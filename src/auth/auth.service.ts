import { ConflictException, HttpStatus, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import { createHash, randomBytes } from 'node:crypto';
import { Response } from 'express';
import { DatabaseService } from '../database/database.service';
import { ProblemException } from '../common/problem.exception';
import { SessionUser } from '../common/auth.types';
import { AcceptInvitationDto, InvitationDto, LoginDto } from './auth.dto';
import { EmailQueueService } from '../email/email-queue.service';

interface UserRow {
  id: string;
  parish_id: string | null;
  member_id: string | null;
  name: string;
  email: string;
  password_hash: string;
  role: SessionUser['role'];
  status: string;
}
interface InvitationRow {
  id: string;
  parish_id: string;
  member_id: string | null;
  name: string;
  email: string;
  role: 'LEADER' | 'MEMBER';
  status: string;
  expires_at: Date;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly db: DatabaseService,
    private readonly config: ConfigService,
    private readonly emails: EmailQueueService,
  ) {}
  private hash(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }
  private present(row: UserRow): SessionUser {
    return {
      id: row.id,
      parishId: row.parish_id,
      memberId: row.member_id,
      name: row.name,
      email: row.email,
      role: row.role,
      initials: row.name
        .split(/\s+/)
        .slice(0, 2)
        .map((part) => part[0])
        .join('')
        .toUpperCase(),
    };
  }
  private async createSession(
    user: UserRow,
    response: Response,
  ): Promise<{ user: SessionUser }> {
    const token = randomBytes(32).toString('base64url');
    const days = Number(this.config.get('SESSION_TTL_DAYS', '7'));
    await this.db.query(
      "INSERT INTO sessions(user_id, token_hash, expires_at) VALUES ($1, $2, now() + ($3 || ' days')::interval)",
      [user.id, this.hash(token), days],
    );
    response.cookie('mg_session', token, {
      httpOnly: true,
      secure:
        this.config.get<string>(
          'SESSION_COOKIE_SECURE',
          this.config.get('NODE_ENV') === 'production' ? 'true' : 'false',
        ) === 'true',
      sameSite: 'lax',
      maxAge: days * 86400000,
      path: '/',
    });
    return { user: this.present(user) };
  }
  async login(
    input: LoginDto,
    response: Response,
  ): Promise<{ user: SessionUser }> {
    const result = await this.db.query<UserRow>(
      'SELECT * FROM users WHERE lower(email) = lower($1)',
      [input.email],
    );
    const user = result.rows[0];
    if (
      !user ||
      user.status !== 'ACTIVE' ||
      !(await bcrypt.compare(input.password, user.password_hash))
    )
      throw new ProblemException(
        HttpStatus.UNAUTHORIZED,
        'INVALID_CREDENTIALS',
        'E-mail ou senha inválidos.',
      );
    return this.createSession(user, response);
  }
  async resolve(token?: string): Promise<SessionUser | null> {
    if (!token) return null;
    const result = await this.db.query<UserRow>(
      `SELECT u.* FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=$1 AND s.revoked_at IS NULL AND s.expires_at > now() AND u.status='ACTIVE'`,
      [this.hash(token)],
    );
    return result.rows[0] ? this.present(result.rows[0]) : null;
  }
  async logout(token: string | undefined, response: Response): Promise<void> {
    if (token)
      await this.db.query(
        'UPDATE sessions SET revoked_at=now() WHERE token_hash=$1',
        [this.hash(token)],
      );
    response.clearCookie('mg_session', { path: '/' });
  }
  async invite(
    actor: SessionUser,
    input: InvitationDto,
  ): Promise<Record<string, unknown>> {
    if (
      (actor.role === 'SUPER_ADMIN' && input.role !== 'LEADER') ||
      (actor.role === 'LEADER' && input.role !== 'MEMBER') ||
      actor.role === 'MEMBER'
    )
      throw new ProblemException(
        HttpStatus.FORBIDDEN,
        'FORBIDDEN',
        'Papel não autorizado para este convite.',
      );
    const parishId =
      actor.role === 'SUPER_ADMIN' ? input.parishId! : actor.parishId!;
    let name = input.name ?? '';
    if (input.role === 'MEMBER') {
      const member = await this.db.query<{ name: string; email: string }>(
        "SELECT name,email FROM members WHERE id=$1 AND parish_id=$2 AND status='ACTIVE' AND NOT EXISTS(SELECT 1 FROM users WHERE member_id=members.id)",
        [input.memberId, parishId],
      );
      if (!member.rows[0])
        throw new ConflictException(
          'Membro inválido, inativo, de outra paróquia ou já vinculado.',
        );
      name = member.rows[0].name;
      if (member.rows[0].email.toLowerCase() !== input.email.toLowerCase())
        throw new ConflictException(
          'O e-mail deve ser o mesmo do perfil do membro.',
        );
    }
    const token = randomBytes(32).toString('base64url');
    const result = await this.db.query<InvitationRow>(
      `INSERT INTO user_invitations(parish_id,member_id,name,email,role,token_hash,expires_at,created_by) VALUES($1,$2,$3,lower($4),$5,$6,now()+interval '48 hours',$7) RETURNING *`,
      [
        parishId,
        input.memberId ?? null,
        name,
        input.email,
        input.role,
        this.hash(token),
        actor.id,
      ],
    );
    await this.emails.enqueueInvitation({ to: input.email, name, token });
    return this.presentInvitation(result.rows[0]);
  }
  async accept(
    token: string,
    input: AcceptInvitationDto,
    response: Response,
  ): Promise<{ user: SessionUser }> {
    if (input.password !== input.passwordConfirmation)
      throw new ProblemException(
        HttpStatus.UNPROCESSABLE_ENTITY,
        'PASSWORD_MISMATCH',
        'As senhas não conferem.',
      );
    const created = await this.db.transaction(async (client) => {
      const found = await client.query<InvitationRow>(
        "SELECT * FROM user_invitations WHERE token_hash=$1 AND status='PENDING' AND expires_at>now() FOR UPDATE",
        [this.hash(token)],
      );
      const invitation = found.rows[0];
      if (!invitation)
        throw new ConflictException(
          'Convite inválido, expirado ou já utilizado.',
        );
      let memberId = invitation.member_id;
      if (invitation.role === 'LEADER') {
        if (!input.whatsapp)
          throw new ProblemException(
            HttpStatus.UNPROCESSABLE_ENTITY,
            'WHATSAPP_REQUIRED',
            'WhatsApp é obrigatório para líder.',
          );
        const member = await client.query<{ id: string }>(
          `INSERT INTO members(parish_id,name,email,phone) VALUES($1,$2,$3,$4) RETURNING id`,
          [
            invitation.parish_id,
            invitation.name,
            invitation.email,
            input.whatsapp,
          ],
        );
        memberId = member.rows[0].id;
      }
      const passwordHash = await bcrypt.hash(input.password, 12);
      const createdUser = await client.query<UserRow>(
        `INSERT INTO users(parish_id,member_id,name,email,password_hash,role,status) VALUES($1,$2,$3,$4,$5,$6,'ACTIVE') RETURNING *`,
        [
          invitation.parish_id,
          memberId,
          invitation.name,
          invitation.email,
          passwordHash,
          invitation.role,
        ],
      );
      await client.query(
        "UPDATE user_invitations SET status='ACCEPTED' WHERE id=$1",
        [invitation.id],
      );
      return createdUser.rows[0];
    });
    return this.createSession(created, response);
  }
  presentInvitation(row: InvitationRow): Record<string, unknown> {
    return {
      id: row.id,
      parishId: row.parish_id,
      memberId: row.member_id,
      name: row.name,
      email: row.email,
      role: row.role,
      status: row.status,
      expiresAt: row.expires_at,
    };
  }
}
