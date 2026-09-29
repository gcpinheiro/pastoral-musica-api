import { ConflictException, Injectable } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { SessionUser } from '../common/auth.types';
import { ProblemException } from '../common/problem.exception';
import { LeadershipDecisionDto, LeadershipRequestDto } from './auth.dto';

@Injectable()
export class LeadershipService {
  constructor(private readonly db: DatabaseService) {}
  async list(
    user: SessionUser,
    page: number,
    pageSize: number,
    status?: string,
  ) {
    const values: unknown[] = [pageSize, (page - 1) * pageSize];
    let where = 'WHERE 1=1';
    if (user.role === 'LEADER') {
      values.push(user.parishId);
      where += ` AND parish_id=$${values.length}`;
    }
    if (status) {
      values.push(status);
      where += ` AND status=$${values.length}`;
    }
    const rows = (
      await this.db.query(
        `SELECT *,count(*) OVER()::int total FROM leadership_requests ${where} ORDER BY created_at DESC LIMIT $1 OFFSET $2`,
        values,
      )
    ).rows;
    return {
      page,
      pageSize,
      total: Number(rows[0]?.total ?? 0),
      items: rows.map((row) => this.present(row)),
    };
  }
  async create(user: SessionUser, input: LeadershipRequestDto) {
    if (user.role !== 'LEADER' || !user.parishId)
      throw new ProblemException(
        403,
        'FORBIDDEN',
        'Apenas líderes podem solicitar mudanças.',
      );
    if (
      input.type === 'ADD_LEADER' &&
      (!input.candidateName || !input.candidateEmail)
    )
      throw new ProblemException(
        422,
        'CANDIDATE_REQUIRED',
        'Nome e e-mail são obrigatórios.',
      );
    if (input.type !== 'ADD_LEADER' && !input.targetUserId)
      throw new ProblemException(
        422,
        'TARGET_REQUIRED',
        'Líder alvo é obrigatório.',
      );
    const row = (
      await this.db.query(
        `INSERT INTO leadership_requests(parish_id,requested_by_user_id,type,target_user_id,candidate_name,candidate_email,reason) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
        [
          user.parishId,
          user.id,
          input.type,
          input.targetUserId ?? null,
          input.candidateName ?? null,
          input.candidateEmail?.toLowerCase() ?? null,
          input.reason,
        ],
      )
    ).rows[0];
    return this.present(row);
  }
  async decide(user: SessionUser, id: string, input: LeadershipDecisionDto) {
    return this.db.transaction(async (client) => {
      const found = await client.query(
        `SELECT * FROM leadership_requests WHERE id=$1 FOR UPDATE`,
        [id],
      );
      const request = found.rows[0] as Record<string, unknown> | undefined;
      if (!request)
        throw new ProblemException(
          404,
          'NOT_FOUND',
          'Solicitação não encontrada.',
        );
      if (request.status !== 'PENDING')
        throw new ConflictException('Solicitação já decidida.');
      if (input.decision === 'APPROVED') {
        if (request.type === 'ADD_LEADER')
          throw new ConflictException(
            'Use o fluxo de convite para concluir a inclusão do líder.',
          );
        const next =
          request.type === 'SUSPEND_LEADER' ? 'SUSPENDED' : 'SUSPENDED';
        await client.query(
          'UPDATE users SET status=$1,updated_at=now() WHERE id=$2 AND parish_id=$3 AND role=$4',
          [next, request.target_user_id, request.parish_id, 'LEADER'],
        );
      }
      const updated = (
        await client.query<Record<string, unknown>>(
          `UPDATE leadership_requests SET status=$1,decided_by_user_id=$2,decision_reason=$3,decided_at=now() WHERE id=$4 RETURNING *`,
          [input.decision, user.id, input.reason, id],
        )
      ).rows[0];
      await client.query(
        `INSERT INTO audit_logs(parish_id,actor_user_id,action,entity_type,entity_id,details) VALUES($1,$2,'LEADERSHIP_DECISION','LEADERSHIP_REQUEST',$3,$4)`,
        [
          request.parish_id,
          user.id,
          id,
          JSON.stringify({ decision: input.decision, reason: input.reason }),
        ],
      );
      return this.present(updated);
    });
  }
  private present(row: Record<string, unknown>) {
    return {
      id: row.id,
      parishId: row.parish_id,
      requestedByUserId: row.requested_by_user_id,
      type: row.type,
      targetUserId: row.target_user_id,
      candidateName: row.candidate_name,
      candidateEmail: row.candidate_email,
      reason: row.reason,
      status: row.status,
      decidedByUserId: row.decided_by_user_id,
      decisionReason: row.decision_reason,
      createdAt: row.created_at,
      decidedAt: row.decided_at,
    };
  }
}
