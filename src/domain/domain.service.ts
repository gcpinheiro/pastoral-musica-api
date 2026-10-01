import { ConflictException, HttpStatus, Injectable } from '@nestjs/common';
import {
  DatabaseService,
  TransactionClient,
} from '../database/database.service';
import { SessionUser } from '../common/auth.types';
import { ProblemException } from '../common/problem.exception';
import {
  GenerateDto,
  MemberDto,
  MinistryDto,
  NewsDto,
  OccurrenceDto,
  OccurrenceMemberDto,
  ParishDto,
  SetlistDto,
  SongDto,
} from './domain.dto';

type Row = Record<string, unknown>;
@Injectable()
export class DomainService {
  constructor(private readonly db: DatabaseService) {}
  private requireParish(user: SessionUser): string {
    if (!user.parishId)
      throw new ProblemException(
        HttpStatus.FORBIDDEN,
        'PASTORAL_SCOPE_REQUIRED',
        'Usuário global não possui escopo pastoral.',
      );
    return user.parishId;
  }
  private initials(name: string): string {
    return name
      .split(/\s+/)
      .slice(0, 2)
      .map((part) => part[0])
      .join('')
      .toUpperCase();
  }
  private async replaceMemberMinistries(
    client: TransactionClient,
    memberId: string,
    parishId: string,
    ministryIds: readonly string[],
  ): Promise<void> {
    await client.query('DELETE FROM ministry_members WHERE member_id=$1', [
      memberId,
    ]);
    for (const ministryId of ministryIds) {
      const inserted = await client.query(
        `INSERT INTO ministry_members(ministry_id,member_id)
         SELECT id,$1 FROM ministries
         WHERE id=$2 AND parish_id=$3 AND status='ACTIVE'`,
        [memberId, ministryId, parishId],
      );
      if (inserted.rowCount !== 1)
        throw new ProblemException(
          404,
          'NOT_FOUND',
          'Ministério não encontrado.',
        );
    }
  }
  private parish(row: Row) {
    return {
      id: row.id,
      name: row.name,
      slug: row.slug,
      city: row.city,
      state: row.state,
      timezone: row.timezone,
      status: row.status,
    };
  }
  private member(row: Row) {
    const name = String(row.name);
    const ministries = Array.isArray(row.ministries)
      ? (row.ministries as { id: string; name: string }[])
      : [];
    return {
      id: row.id,
      name,
      email: row.email,
      phone: row.phone,
      photoUrl: row.photo_url,
      talentIds: row.talent_ids,
      ministryIds: ministries.map((ministry) => ministry.id),
      ministries,
      availability: row.availability,
      notes: row.notes,
      initials: this.initials(name),
      status: row.status,
    };
  }
  private song(row: Row) {
    return {
      id: row.id,
      title: row.title,
      author: row.author,
      defaultKey: row.default_key,
      liturgicalMoments: row.liturgical_moments,
      lyrics: row.lyrics,
      chords: row.chords,
      status: row.status,
      rightsStatus: row.rights_status,
      rightsType: row.rights_type,
      sourceUrl: row.source_url,
      attribution: row.attribution,
    };
  }

  async listParishes() {
    return (
      await this.db.query('SELECT * FROM parishes ORDER BY name')
    ).rows.map((row) => this.parish(row));
  }
  async createParish(input: ParishDto) {
    const slug =
      input.slug ??
      input.name
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/(^-|-$)/g, '');
    const row = (
      await this.db.query(
        'INSERT INTO parishes(name,slug,city,state,timezone) VALUES($1,$2,$3,upper($4),$5) RETURNING *',
        [input.name, slug, input.city, input.state, input.timezone],
      )
    ).rows[0];
    return this.parish(row);
  }
  async updateParish(id: string, input: ParishDto) {
    const row = (
      await this.db.query(
        'UPDATE parishes SET name=$1,slug=coalesce($2,slug),city=$3,state=upper($4),timezone=$5,updated_at=now() WHERE id=$6 RETURNING *',
        [input.name, input.slug, input.city, input.state, input.timezone, id],
      )
    ).rows[0];
    if (!row)
      throw new ProblemException(404, 'NOT_FOUND', 'Paróquia não encontrada.');
    return this.parish(row);
  }

  async listUsers(
    user: SessionUser,
    page: number,
    pageSize: number,
    status?: string,
    parishId?: string,
  ) {
    const scope =
      user.role === 'SUPER_ADMIN' ? (parishId ?? null) : user.parishId;
    const values: unknown[] = [pageSize, (page - 1) * pageSize];
    let where = 'WHERE 1=1';
    if (scope) {
      values.push(scope);
      where += ` AND parish_id=$${values.length}`;
    }
    if (status) {
      values.push(status);
      where += ` AND status=$${values.length}`;
    }
    const rows = (
      await this.db.query(
        `SELECT *,count(*) OVER()::int total_count FROM users ${where} ORDER BY name LIMIT $1 OFFSET $2`,
        values,
      )
    ).rows;
    return {
      page,
      pageSize,
      total: Number(rows[0]?.total_count ?? 0),
      items: rows.map((r) => ({
        id: r.id,
        parishId: r.parish_id,
        memberId: r.member_id,
        name: r.name,
        email: r.email,
        role: r.role,
        status: r.status,
      })),
    };
  }

  async listMembers(
    user: SessionUser,
    page: number,
    pageSize: number,
    query?: string,
    status?: string,
  ) {
    const parish = this.requireParish(user);
    const values: unknown[] = [parish, pageSize, (page - 1) * pageSize];
    let where = 'm.parish_id=$1';
    if (query) {
      values.push(`%${query}%`);
      where += ` AND (m.name ILIKE $${values.length} OR m.email ILIKE $${values.length})`;
    }
    if (status) {
      values.push(status);
      where += ` AND m.status=$${values.length}`;
    }
    const rows = (
      await this.db.query(
        `SELECT m.*,count(*) OVER()::int total_count,
          COALESCE((SELECT jsonb_agg(jsonb_build_object('id',mi.id,'name',mi.name) ORDER BY mi.name)
            FROM ministry_members mm JOIN ministries mi ON mi.id=mm.ministry_id
            WHERE mm.member_id=m.id AND mi.status='ACTIVE'),'[]'::jsonb) ministries
         FROM members m WHERE ${where} ORDER BY m.name LIMIT $2 OFFSET $3`,
        values,
      )
    ).rows;
    return {
      page,
      pageSize,
      total: Number(rows[0]?.total_count ?? 0),
      items: rows.map((r) => this.member(r)),
    };
  }
  async createMember(user: SessionUser, input: MemberDto) {
    const parish = this.requireParish(user);
    const id = await this.db.transaction(async (client) => {
      const row = (
        await client.query<{ id: string }>(
          'INSERT INTO members(parish_id,name,email,phone,talent_ids,availability,notes) VALUES($1,$2,lower($3),$4,$5,$6,$7) RETURNING id',
          [
            parish,
            input.name,
            input.email,
            input.phone ?? null,
            JSON.stringify(input.talentIds),
            JSON.stringify(input.availability),
            input.notes ?? null,
          ],
        )
      ).rows[0];
      await this.replaceMemberMinistries(
        client,
        row.id,
        parish,
        input.ministryIds,
      );
      return row.id;
    });
    return this.getMember(user, id);
  }
  async getMember(user: SessionUser, id: string) {
    const row = (
      await this.db.query(
        `SELECT m.*,
          COALESCE((SELECT jsonb_agg(jsonb_build_object('id',mi.id,'name',mi.name) ORDER BY mi.name)
            FROM ministry_members mm JOIN ministries mi ON mi.id=mm.ministry_id
            WHERE mm.member_id=m.id AND mi.status='ACTIVE'),'[]'::jsonb) ministries
         FROM members m WHERE m.id=$1 AND m.parish_id=$2`,
        [id, this.requireParish(user)],
      )
    ).rows[0];
    if (!row)
      throw new ProblemException(404, 'NOT_FOUND', 'Membro não encontrado.');
    return this.member(row);
  }
  async updateMember(user: SessionUser, id: string, input: MemberDto) {
    const parish = this.requireParish(user);
    await this.db.transaction(async (client) => {
      const updated = await client.query(
        'UPDATE members SET name=$1,email=lower($2),phone=$3,talent_ids=$4,availability=$5,notes=$6,updated_at=now() WHERE id=$7 AND parish_id=$8 RETURNING id',
        [
          input.name,
          input.email,
          input.phone ?? null,
          JSON.stringify(input.talentIds),
          JSON.stringify(input.availability),
          input.notes ?? null,
          id,
          parish,
        ],
      );
      if (!updated.rowCount)
        throw new ProblemException(404, 'NOT_FOUND', 'Membro não encontrado.');
      await this.replaceMemberMinistries(client, id, parish, input.ministryIds);
    });
    return this.getMember(user, id);
  }
  async archiveMember(user: SessionUser, id: string) {
    const result = await this.db.query(
      "UPDATE members SET status='INACTIVE',updated_at=now() WHERE id=$1 AND parish_id=$2",
      [id, this.requireParish(user)],
    );
    if (!result.rowCount)
      throw new ProblemException(404, 'NOT_FOUND', 'Membro não encontrado.');
  }
  async setPhoto(user: SessionUser, id: string, url: string | null) {
    const result = await this.db.query(
      'UPDATE members SET photo_url=$1,updated_at=now() WHERE id=$2 AND parish_id=$3',
      [url, id, this.requireParish(user)],
    );
    if (!result.rowCount)
      throw new ProblemException(404, 'NOT_FOUND', 'Membro não encontrado.');
  }
  async assertPhotoAccess(user: SessionUser, name: string): Promise<void> {
    const result = await this.db.query(
      'SELECT 1 FROM members WHERE parish_id=$1 AND photo_url=$2',
      [this.requireParish(user), `/api/v1/media/member-photos/${name}`],
    );
    if (!result.rowCount)
      throw new ProblemException(404, 'NOT_FOUND', 'Foto não encontrada.');
  }

  async listSongs(user: SessionUser, query?: string) {
    const values: unknown[] = [this.requireParish(user)];
    let sql = "SELECT * FROM songs WHERE parish_id=$1 AND status='ACTIVE'";
    if (query) {
      values.push(`%${query}%`);
      sql += ` AND (title ILIKE $2 OR author ILIKE $2)`;
    }
    sql += ' ORDER BY title';
    return (await this.db.query(sql, values)).rows.map((r) => this.song(r));
  }
  async createSong(user: SessionUser, input: SongDto) {
    const row = (
      await this.db.query(
        'INSERT INTO songs(parish_id,title,author,default_key,liturgical_moments,lyrics,chords) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING *',
        [
          this.requireParish(user),
          input.title,
          input.author,
          input.defaultKey,
          JSON.stringify(input.liturgicalMoments),
          input.lyrics,
          input.chords,
        ],
      )
    ).rows[0];
    return this.song(row);
  }
  async getSong(user: SessionUser, id: string) {
    const row = (
      await this.db.query('SELECT * FROM songs WHERE id=$1 AND parish_id=$2', [
        id,
        this.requireParish(user),
      ])
    ).rows[0];
    if (!row)
      throw new ProblemException(404, 'NOT_FOUND', 'Música não encontrada.');
    return this.song(row);
  }
  async updateSong(user: SessionUser, id: string, input: SongDto) {
    const row = (
      await this.db.query(
        'UPDATE songs SET title=$1,author=$2,default_key=$3,liturgical_moments=$4,lyrics=$5,chords=$6,updated_at=now() WHERE id=$7 AND parish_id=$8 RETURNING *',
        [
          input.title,
          input.author,
          input.defaultKey,
          JSON.stringify(input.liturgicalMoments),
          input.lyrics,
          input.chords,
          id,
          this.requireParish(user),
        ],
      )
    ).rows[0];
    if (!row)
      throw new ProblemException(404, 'NOT_FOUND', 'Música não encontrada.');
    return this.song(row);
  }
  async listNews(user: SessionUser) {
    const rows = (
      await this.db.query(
        `SELECT n.*,u.id author_id,u.name author_name,u.email author_email,u.role author_role,u.member_id FROM news n JOIN users u ON u.id=n.author_user_id WHERE n.parish_id=$1 AND n.archived_at IS NULL ORDER BY n.published_at DESC`,
        [this.requireParish(user)],
      )
    ).rows;
    return rows.map((r) => ({
      id: r.id,
      title: r.title,
      body: r.body,
      publishedAt: r.published_at,
      author: {
        id: r.author_id,
        name: r.author_name,
        email: r.author_email,
        role: r.author_role,
        memberId: r.member_id,
        initials: this.initials(String(r.author_name)),
      },
    }));
  }
  async createNews(user: SessionUser, input: NewsDto) {
    const row = (
      await this.db.query(
        'INSERT INTO news(parish_id,title,body,author_user_id) VALUES($1,$2,$3,$4) RETURNING *',
        [this.requireParish(user), input.title, input.body, user.id],
      )
    ).rows[0];
    return {
      id: row.id,
      title: row.title,
      body: row.body,
      publishedAt: row.published_at,
      author: user,
    };
  }
  async updateNews(user: SessionUser, id: string, input: NewsDto) {
    const row = (
      await this.db.query(
        'UPDATE news SET title=$1,body=$2 WHERE id=$3 AND parish_id=$4 AND archived_at IS NULL RETURNING *',
        [input.title, input.body, id, this.requireParish(user)],
      )
    ).rows[0];
    if (!row)
      throw new ProblemException(404, 'NOT_FOUND', 'Notícia não encontrada.');
    return {
      id: row.id,
      title: row.title,
      body: row.body,
      publishedAt: row.published_at,
      author: user,
    };
  }
  async archiveNews(user: SessionUser, id: string): Promise<void> {
    const result = await this.db.query(
      'UPDATE news SET archived_at=now() WHERE id=$1 AND parish_id=$2 AND archived_at IS NULL',
      [id, this.requireParish(user)],
    );
    if (!result.rowCount)
      throw new ProblemException(404, 'NOT_FOUND', 'Notícia não encontrada.');
  }

  async createMinistry(user: SessionUser, input: MinistryDto) {
    const parish = this.requireParish(user);
    const id = await this.db.transaction(async (client) => {
      const ministry = (
        await client.query<{ id: string }>(
          'INSERT INTO ministries(parish_id,name) VALUES($1,$2) RETURNING id',
          [parish, input.name],
        )
      ).rows[0];
      for (const memberId of input.memberIds)
        await client.query(
          `INSERT INTO ministry_members(ministry_id,member_id) SELECT $1,id FROM members WHERE id=$2 AND parish_id=$3 AND status='ACTIVE'`,
          [ministry.id, memberId, parish],
        );
      await client.query(
        'INSERT INTO celebration_series(parish_id,ministry_id,title,location,weekday,local_time,timezone) VALUES($1,$2,$3,$4,$5,$6,$7)',
        [
          parish,
          ministry.id,
          input.defaultSeries.title,
          input.defaultSeries.location,
          input.defaultSeries.weekday,
          input.defaultSeries.localTime,
          input.defaultSeries.timezone,
        ],
      );
      return ministry.id;
    });
    return this.getMinistry(user, id);
  }
  async listMinistries(user: SessionUser) {
    const ids = (
      await this.db.query<{ id: string }>(
        "SELECT id FROM ministries WHERE parish_id=$1 AND status='ACTIVE' ORDER BY name",
        [this.requireParish(user)],
      )
    ).rows;
    return Promise.all(ids.map(({ id }) => this.getMinistry(user, id)));
  }
  async getMinistry(user: SessionUser, id: string) {
    const ministry = (
      await this.db.query(
        'SELECT * FROM ministries WHERE id=$1 AND parish_id=$2',
        [id, this.requireParish(user)],
      )
    ).rows[0];
    if (!ministry)
      throw new ProblemException(
        404,
        'NOT_FOUND',
        'Ministério não encontrado.',
      );
    const members = (
      await this.db.query(
        `SELECT m.id member_id,m.name,m.phone,'Integrante' role,'PENDING' confirmation FROM ministry_members mm JOIN members m ON m.id=mm.member_id WHERE mm.ministry_id=$1`,
        [id],
      )
    ).rows;
    const series = (
      await this.db.query(
        'SELECT cs.*,cs.local_time::text local_time_text FROM celebration_series cs WHERE ministry_id=$1 ORDER BY created_at',
        [id],
      )
    ).rows;
    return {
      id: ministry.id,
      name: ministry.name,
      status: ministry.status,
      members: members.map((m) => ({
        memberId: m.member_id,
        name: m.name,
        initials: this.initials(String(m.name)),
        whatsapp: m.phone,
        role: m.role,
        confirmation: m.confirmation,
      })),
      series: series.map((s) => ({
        id: s.id,
        title: s.title,
        location: s.location,
        weekday: s.weekday,
        localTime: String(s.local_time_text).slice(0, 5),
        timezone: s.timezone,
      })),
    };
  }
  async updateMinistry(user: SessionUser, id: string, input: MinistryDto) {
    await this.db.transaction(async (client) => {
      const updated = await client.query(
        'UPDATE ministries SET name=$1,updated_at=now() WHERE id=$2 AND parish_id=$3',
        [input.name, id, this.requireParish(user)],
      );
      if (!updated.rowCount)
        throw new ProblemException(
          404,
          'NOT_FOUND',
          'Ministério não encontrado.',
        );
      await client.query('DELETE FROM ministry_members WHERE ministry_id=$1', [
        id,
      ]);
      for (const memberId of input.memberIds)
        await client.query(
          `INSERT INTO ministry_members(ministry_id,member_id) SELECT $1,id FROM members WHERE id=$2 AND parish_id=$3 AND status='ACTIVE'`,
          [id, memberId, this.requireParish(user)],
        );
      await client.query(
        'UPDATE celebration_series SET title=$1,location=$2,weekday=$3,local_time=$4,timezone=$5,updated_at=now() WHERE ministry_id=$6',
        [
          input.defaultSeries.title,
          input.defaultSeries.location,
          input.defaultSeries.weekday,
          input.defaultSeries.localTime,
          input.defaultSeries.timezone,
          id,
        ],
      );
    });
    return this.getMinistry(user, id);
  }
  async archiveMinistry(user: SessionUser, id: string): Promise<void> {
    const result = await this.db.query(
      "UPDATE ministries SET status='ARCHIVED',updated_at=now() WHERE id=$1 AND parish_id=$2 AND status='ACTIVE'",
      [id, this.requireParish(user)],
    );
    if (!result.rowCount)
      throw new ProblemException(
        404,
        'NOT_FOUND',
        'Ministério não encontrado.',
      );
  }

  async generate(user: SessionUser, seriesId: string, input: GenerateDto) {
    const parish = this.requireParish(user);
    const series = (
      await this.db.query(
        'SELECT cs.*,cs.local_time::text local_time_text FROM celebration_series cs WHERE id=$1 AND parish_id=$2',
        [seriesId, parish],
      )
    ).rows[0];
    if (!series)
      throw new ProblemException(404, 'NOT_FOUND', 'Série não encontrada.');
    const today = new Date();
    const through = new Date(`${input.throughDate}T23:59:59Z`);
    const max = new Date(today);
    max.setUTCFullYear(max.getUTCFullYear() + 1);
    if (through > max)
      throw new ConflictException('A geração está limitada a 12 meses.');
    const weekdays = [
      'SUNDAY',
      'MONDAY',
      'TUESDAY',
      'WEDNESDAY',
      'THURSDAY',
      'FRIDAY',
      'SATURDAY',
    ];
    const localTime = String(series.local_time_text).slice(0, 8);
    const generation = await this.db.transaction(async (client) => {
      let createdCount = 0,
        skippedCount = 0;
      const occurrenceIds: string[] = [];
      for (
        let cursor = new Date(
          Date.UTC(
            today.getUTCFullYear(),
            today.getUTCMonth(),
            today.getUTCDate(),
          ),
        );
        cursor <= through;
        cursor.setUTCDate(cursor.getUTCDate() + 1)
      ) {
        if (weekdays[cursor.getUTCDay()] !== series.weekday) continue;
        const date = cursor.toISOString().slice(0, 10);
        const inserted = await client.query<{ id: string }>(
          `INSERT INTO occurrences(parish_id,series_id,ministry_id,title,starts_at,timezone,location,local_date,local_time)
           VALUES($1,$2,$3,$4,(($7::date + $8::time) AT TIME ZONE $5),$5,$6,$7,$8)
           ON CONFLICT DO NOTHING RETURNING id`,
          [
            parish,
            series.id,
            series.ministry_id,
            series.title,
            series.timezone,
            series.location,
            date,
            localTime,
          ],
        );
        if (!inserted.rows[0]) {
          skippedCount++;
          continue;
        }
        await client.query(
          `INSERT INTO occurrence_members(occurrence_id,member_id,role) SELECT $1,member_id,role FROM ministry_members WHERE ministry_id=$2`,
          [inserted.rows[0].id, series.ministry_id],
        );
        createdCount++;
        occurrenceIds.push(inserted.rows[0].id);
      }
      return { createdCount, skippedCount, occurrenceIds };
    });
    return {
      ...generation,
      generatedThrough: input.throughDate,
    };
  }

  async createOccurrence(user: SessionUser, input: OccurrenceDto) {
    const starts = new Date(input.startsAt);
    const row = (
      await this.db.query(
        `INSERT INTO occurrences(parish_id,ministry_id,title,starts_at,timezone,location,liturgical_time,notes,local_date,local_time) SELECT $1,id,$2,$3,$4,$5,$6,$7,$8,$9 FROM ministries WHERE id=$10 AND parish_id=$1 RETURNING id`,
        [
          this.requireParish(user),
          input.title,
          input.startsAt,
          input.timezone,
          input.location,
          input.liturgicalTime ?? null,
          input.notes ?? null,
          starts.toISOString().slice(0, 10),
          starts.toISOString().slice(11, 19),
          input.ministryId,
        ],
      )
    ).rows[0];
    if (!row)
      throw new ProblemException(
        404,
        'NOT_FOUND',
        'Ministério não encontrado.',
      );
    return this.getOccurrence(user, String(row.id));
  }
  async listOccurrences(
    user: SessionUser,
    filters: {
      from?: string;
      to?: string;
      memberId?: string;
      ministryId?: string;
      status?: string;
    },
  ) {
    const parish = this.requireParish(user);
    if (user.role === 'MEMBER' && !user.memberId) return [];
    const values: unknown[] = [parish];
    let where = 'o.parish_id=$1';
    const memberId = user.role === 'MEMBER' ? user.memberId : filters.memberId;
    let memberParameter: string | undefined;
    if (memberId) {
      values.push(memberId);
      memberParameter = `$${values.length}`;
      where += ` AND EXISTS(SELECT 1 FROM occurrence_members om WHERE om.occurrence_id=o.id AND om.member_id=${memberParameter})`;
      if (user.role === 'MEMBER')
        where += " AND o.status IN ('PUBLISHED','ATTENTION','CANCELLED')";
    }
    for (const [column, value] of [
      ['o.starts_at::date >=', filters.from],
      ['o.starts_at::date <=', filters.to],
      ['o.ministry_id =', filters.ministryId],
      ['o.status =', filters.status],
    ] as const)
      if (value) {
        values.push(value);
        where += ` AND ${column} $${values.length}`;
      }
    const rows = (
      await this.db.query(
        `SELECT o.*,m.name ministry_name,
                (SELECT count(*) FROM occurrence_members WHERE occurrence_id=o.id)::int member_count,
                (SELECT count(*) FROM setlist_items WHERE occurrence_id=o.id)::int repertoire_count,
                ${memberParameter ? `(SELECT om.confirmation FROM occurrence_members om WHERE om.occurrence_id=o.id AND om.member_id=${memberParameter})` : 'NULL::text'} current_confirmation
           FROM occurrences o
           JOIN ministries m ON m.id=o.ministry_id
          WHERE ${where}
          ORDER BY starts_at`,
        values,
      )
    ).rows;
    return rows.map((r) => this.occurrenceSummary(r));
  }
  private occurrenceSummary(r: Row) {
    return {
      id: r.id,
      title: r.title,
      startsAt: r.starts_at,
      timezone: r.timezone,
      location: r.location,
      ministryId: r.ministry_id,
      ministry: r.ministry_name,
      liturgicalTime: r.liturgical_time,
      notes: r.notes,
      version: r.version,
      status: r.status,
      memberCount: Number(r.member_count ?? 0),
      repertoireCount: Number(r.repertoire_count ?? 0),
      ...(r.current_confirmation
        ? { myConfirmation: r.current_confirmation }
        : {}),
    };
  }
  async getOccurrence(user: SessionUser, id: string) {
    const parish = this.requireParish(user);
    const values: unknown[] = [id, parish];
    let access = 'o.id=$1 AND o.parish_id=$2';
    if (user.role === 'MEMBER') {
      if (!user.memberId)
        throw new ProblemException(
          404,
          'NOT_FOUND',
          'Ocorrência não encontrada.',
        );
      values.push(user.memberId);
      access += ` AND o.status IN ('PUBLISHED','ATTENTION','CANCELLED') AND EXISTS(SELECT 1 FROM occurrence_members access_member WHERE access_member.occurrence_id=o.id AND access_member.member_id=$3)`;
    }
    const row = (
      await this.db.query(
        `SELECT o.*,m.name ministry_name,(SELECT count(*) FROM occurrence_members WHERE occurrence_id=o.id)::int member_count,(SELECT count(*) FROM setlist_items WHERE occurrence_id=o.id)::int repertoire_count FROM occurrences o JOIN ministries m ON m.id=o.ministry_id WHERE ${access}`,
        values,
      )
    ).rows[0];
    if (!row)
      throw new ProblemException(
        404,
        'NOT_FOUND',
        'Ocorrência não encontrada.',
      );
    const maySeePhone =
      user.role === 'LEADER' ||
      Boolean(
        user.memberId &&
        (
          await this.db.query(
            'SELECT 1 FROM occurrence_members WHERE occurrence_id=$1 AND member_id=$2',
            [id, user.memberId],
          )
        ).rowCount,
      );
    const members = (
      await this.db.query(
        `SELECT om.*,m.name,m.phone FROM occurrence_members om JOIN members m ON m.id=om.member_id WHERE om.occurrence_id=$1 ORDER BY m.name`,
        [id],
      )
    ).rows.map((m) => ({
      memberId: m.member_id,
      name: m.name,
      initials: this.initials(String(m.name)),
      role: m.role,
      confirmation: m.confirmation,
      ...(maySeePhone ? { whatsapp: m.phone } : {}),
    }));
    const items = (
      await this.db.query(
        `SELECT si.*,s.title FROM setlist_items si JOIN songs s ON s.id=si.song_id WHERE si.occurrence_id=$1 ORDER BY position`,
        [id],
      )
    ).rows.map((i) => ({
      id: i.id,
      songId: i.song_id,
      title: i.title,
      position: i.position,
      key: i.key,
      liturgicalMoment: i.liturgical_moment,
      notes: i.notes,
    }));
    const myConfirmation = user.memberId
      ? members.find((member) => member.memberId === user.memberId)?.confirmation
      : undefined;
    return {
      ...this.occurrenceSummary(row),
      ...(myConfirmation ? { myConfirmation } : {}),
      members,
      setlist: { items },
    };
  }
  async updateOccurrence(user: SessionUser, id: string, input: OccurrenceDto) {
    const result = await this.db.query(
      `UPDATE occurrences SET title=$1,starts_at=$2,timezone=$3,location=$4,ministry_id=$5,liturgical_time=$6,notes=$7,version=version+1,updated_at=now() WHERE id=$8 AND parish_id=$9 AND version=$10`,
      [
        input.title,
        input.startsAt,
        input.timezone,
        input.location,
        input.ministryId,
        input.liturgicalTime ?? null,
        input.notes ?? null,
        id,
        this.requireParish(user),
        input.version ?? 0,
      ],
    );
    if (!result.rowCount)
      throw new ConflictException(
        'Ocorrência inexistente ou alterada por outro usuário.',
      );
    return this.getOccurrence(user, id);
  }
  async publishOccurrence(user: SessionUser, id: string) {
    const parish = this.requireParish(user);
    await this.db.transaction(async (client) => {
      const occurrence = (
        await client.query<{ status: string }>(
          'SELECT status FROM occurrences WHERE id=$1 AND parish_id=$2 FOR UPDATE',
          [id, parish],
        )
      ).rows[0];
      if (!occurrence)
        throw new ProblemException(
          404,
          'NOT_FOUND',
          'Ocorrência não encontrada.',
        );
      if (occurrence.status === 'CANCELLED')
        throw new ProblemException(
          HttpStatus.CONFLICT,
          'OCCURRENCE_CANCELLED',
          'Uma escala cancelada não pode ser publicada.',
        );
      if (occurrence.status === 'PUBLISHED') return;
      await client.query(
        "UPDATE occurrences SET status='PUBLISHED',version=version+1,updated_at=now() WHERE id=$1",
        [id],
      );
      await client.query(
        `INSERT INTO audit_logs(parish_id,actor_user_id,action,entity_type,entity_id,details)
         VALUES($1,$2,'PUBLISH_OCCURRENCE','OCCURRENCE',$3,$4)`,
        [parish, user.id, id, JSON.stringify({ previousStatus: occurrence.status })],
      );
    });
    return this.getOccurrence(user, id);
  }
  async updateConfirmation(
    user: SessionUser,
    id: string,
    memberId: string,
    confirmation: 'CONFIRMED' | 'DECLINED',
  ) {
    if (user.role === 'MEMBER' && user.memberId !== memberId)
      throw new ProblemException(
        HttpStatus.FORBIDDEN,
        'FORBIDDEN',
        'Você só pode responder por sua própria participação.',
      );
    const parish = this.requireParish(user);
    await this.db.transaction(async (client) => {
      const participation = (
        await client.query<{ status: string; confirmation: string }>(
          `SELECT o.status,om.confirmation
             FROM occurrences o
             JOIN occurrence_members om ON om.occurrence_id=o.id
            WHERE o.id=$1 AND o.parish_id=$2 AND om.member_id=$3
            FOR UPDATE`,
          [id, parish, memberId],
        )
      ).rows[0];
      if (!participation)
        throw new ProblemException(
          404,
          'NOT_FOUND',
          'Participação na escala não encontrada.',
        );
      if (!['PUBLISHED', 'ATTENTION'].includes(participation.status))
        throw new ProblemException(
          HttpStatus.CONFLICT,
          'OCCURRENCE_NOT_PUBLISHED',
          'A participação só pode ser respondida depois da publicação da escala.',
        );
      if (participation.confirmation === confirmation) return;
      await client.query(
        'UPDATE occurrence_members SET confirmation=$1 WHERE occurrence_id=$2 AND member_id=$3',
        [confirmation, id, memberId],
      );
      await client.query(
        `INSERT INTO audit_logs(parish_id,actor_user_id,action,entity_type,entity_id,details)
         VALUES($1,$2,'UPDATE_OCCURRENCE_CONFIRMATION','OCCURRENCE',$3,$4)`,
        [
          parish,
          user.id,
          id,
          JSON.stringify({
            memberId,
            previousConfirmation: participation.confirmation,
            confirmation,
          }),
        ],
      );
    });
    return this.getOccurrence(user, id);
  }
  async replaceMembers(
    user: SessionUser,
    id: string,
    members: OccurrenceMemberDto[],
  ) {
    if (new Set(members.map((member) => member.memberId)).size !== members.length)
      throw new ProblemException(
        422,
        'DUPLICATE_MEMBER',
        'A formação não pode conter o mesmo membro mais de uma vez.',
      );
    const parish = this.requireParish(user);
    const occurrence = (
      await this.db.query(
        'SELECT starts_at FROM occurrences WHERE id=$1 AND parish_id=$2',
        [id, parish],
      )
    ).rows[0];
    if (!occurrence)
      throw new ProblemException(
        404,
        'NOT_FOUND',
        'Ocorrência não encontrada.',
      );
    await this.db.transaction(async (client) => {
      await client.query(
        'DELETE FROM occurrence_members WHERE occurrence_id=$1 AND NOT (member_id=ANY($2::uuid[]))',
        [id, members.map((member) => member.memberId)],
      );
      for (const member of members) {
        const scopedMember = await client.query(
          "SELECT 1 FROM members WHERE id=$1 AND parish_id=$2 AND status='ACTIVE'",
          [member.memberId, parish],
        );
        if (!scopedMember.rowCount)
          throw new ProblemException(
            404,
            'NOT_FOUND',
            'Membro não encontrado.',
          );
        const conflict = await client.query(
          `SELECT 1 FROM occurrence_members om JOIN occurrences o ON o.id=om.occurrence_id WHERE om.member_id=$1 AND o.starts_at=$2 AND o.id<>$3`,
          [member.memberId, occurrence.starts_at, id],
        );
        if (conflict.rowCount && !member.overrideConflicts)
          throw new ConflictException(
            `Conflito de escala para o membro ${member.memberId}.`,
          );
        if (
          member.overrideConflicts &&
          (!member.conflictJustification ||
            member.conflictJustification.length < 10)
        )
          throw new ProblemException(
            422,
            'JUSTIFICATION_REQUIRED',
            'Justificativa obrigatória para ignorar conflitos.',
          );
        await client.query(
          `INSERT INTO occurrence_members(occurrence_id,member_id,role,conflict_override,conflict_justification)
           VALUES($1,$2,$3,$4,$5)
           ON CONFLICT (occurrence_id,member_id) DO UPDATE
             SET role=EXCLUDED.role,
                 conflict_override=EXCLUDED.conflict_override,
                 conflict_justification=EXCLUDED.conflict_justification`,
          [
            id,
            member.memberId,
            member.role,
            member.overrideConflicts ?? false,
            member.conflictJustification ?? null,
          ],
        );
        if (member.overrideConflicts)
          await client.query(
            `INSERT INTO audit_logs(parish_id,actor_user_id,action,entity_type,entity_id,details) VALUES($1,$2,'OVERRIDE_CONFLICT','OCCURRENCE',$3,$4)`,
            [
              parish,
              user.id,
              id,
              JSON.stringify({
                memberId: member.memberId,
                justification: member.conflictJustification,
              }),
            ],
          );
      }
    });
    return this.getOccurrence(user, id);
  }
  async replaceSetlist(user: SessionUser, id: string, input: SetlistDto) {
    const parish = this.requireParish(user);
    await this.db.transaction(async (client) => {
      const exists = await client.query(
        'SELECT 1 FROM occurrences WHERE id=$1 AND parish_id=$2',
        [id, parish],
      );
      if (!exists.rowCount)
        throw new ProblemException(
          404,
          'NOT_FOUND',
          'Ocorrência não encontrada.',
        );
      await client.query('DELETE FROM setlist_items WHERE occurrence_id=$1', [
        id,
      ]);
      for (const item of input.items)
        await client.query(
          `INSERT INTO setlist_items(occurrence_id,song_id,position,key,liturgical_moment,notes) SELECT $1,id,$2,$3,$4,$5 FROM songs WHERE id=$6 AND parish_id=$7`,
          [
            id,
            item.position,
            item.key,
            item.liturgicalMoment,
            item.notes ?? null,
            item.songId,
            parish,
          ],
        );
    });
    return this.getOccurrence(user, id);
  }
  async dashboard(user: SessionUser, month: string) {
    const [year, monthNumber] = month.split('-').map(Number);
    const from = `${month}-01`;
    const to = new Date(Date.UTC(year, monthNumber, 1))
      .toISOString()
      .slice(0, 10);
    const occurrences = await this.listOccurrences(user, { from, to });
    const news = await this.listNews(user);
    const occurrenceIds = occurrences.map((item) => item.id);
    const confirmationValues: unknown[] = [occurrenceIds];
    let confirmationScope = '';
    if (user.role === 'MEMBER' && user.memberId) {
      confirmationValues.push(user.memberId);
      confirmationScope = ' AND member_id=$2';
    }
    const confirmations = occurrenceIds.length
      ? (
          await this.db.query(
            `SELECT count(*) FILTER (WHERE confirmation='CONFIRMED')::int confirmed,
                    count(*) FILTER (WHERE confirmation='PENDING')::int pending
             FROM occurrence_members WHERE occurrence_id=ANY($1::uuid[])${confirmationScope}`,
            confirmationValues,
          )
        ).rows[0]
      : { confirmed: 0, pending: 0 };
    return {
      summary: {
        celebrations: occurrences.length,
        confirmedMembers: Number(confirmations.confirmed ?? 0),
        pendingConfirmations: Number(confirmations.pending ?? 0),
        openPositions: occurrences.filter((item) => item.status === 'ATTENTION')
          .length,
      },
      occurrences,
      news: news.slice(0, 5),
    };
  }
}
