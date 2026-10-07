import {
  DatabaseService,
  TransactionClient,
} from '../database/database.service';
import { SessionUser } from '../common/auth.types';
import { DomainService } from './domain.service';

jest.mock('../database/prisma.service', () => ({ PrismaService: class {} }));

describe('DomainService occurrence generation', () => {
  it('uses the textual PostgreSQL time and the series timezone', async () => {
    const today = new Date();
    const throughDate = today.toISOString().slice(0, 10);
    const weekdays = [
      'SUNDAY',
      'MONDAY',
      'TUESDAY',
      'WEDNESDAY',
      'THURSDAY',
      'FRIDAY',
      'SATURDAY',
    ];
    const transactionQuery = jest
      .fn()
      .mockResolvedValueOnce({ rows: [{ id: 'occurrence-id' }], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [], rowCount: 2 });
    const transactionClient = {
      query: transactionQuery,
    } as unknown as TransactionClient;
    const runTransaction = <T>(
      work: (client: TransactionClient) => Promise<T>,
    ): Promise<T> => work(transactionClient);
    const database = {
      query: jest.fn().mockResolvedValue({
        rows: [
          {
            id: 'series-id',
            parish_id: 'parish-id',
            ministry_id: 'ministry-id',
            title: 'Santa Missa',
            location: 'Igreja Matriz',
            weekday: weekdays[today.getUTCDay()],
            local_time: new Date('1970-01-01T18:30:00.000Z'),
            local_time_text: '18:30:00',
            timezone: 'America/Fortaleza',
          },
        ],
        rowCount: 1,
      }),
      transaction: jest.fn(runTransaction),
    } as unknown as DatabaseService;
    const user: SessionUser = {
      id: 'user-id',
      parishId: 'parish-id',
      memberId: 'member-id',
      name: 'Eury',
      email: 'eury@example.com',
      role: 'LEADER',
      initials: 'EU',
    };

    const result = await new DomainService(database).generate(
      user,
      'series-id',
      { throughDate },
    );

    const [insertSql, insertValues] = transactionQuery.mock.calls[0] as [
      string,
      unknown[],
    ];
    expect(insertSql).toContain('AT TIME ZONE $5');
    expect(insertValues[4]).toBe('America/Fortaleza');
    expect(insertValues[7]).toBe('18:30:00');
    expect(insertValues.join(' ')).not.toContain('Thu Jan');
    expect(result).toEqual({
      createdCount: 1,
      skippedCount: 0,
      occurrenceIds: ['occurrence-id'],
      generatedThrough: throughDate,
    });
  });
});

describe('DomainService occurrence confirmations', () => {
  const memberUser: SessionUser = {
    id: 'user-id',
    parishId: 'parish-id',
    memberId: 'member-id',
    name: 'Membro',
    email: 'membro@example.com',
    role: 'MEMBER',
    initials: 'ME',
  };

  it('prevents a member from responding for another member', async () => {
    const database = {
      transaction: jest.fn(),
    } as unknown as DatabaseService;

    await expect(
      new DomainService(database).updateConfirmation(
        memberUser,
        'occurrence-id',
        'another-member-id',
        'CONFIRMED',
      ),
    ).rejects.toMatchObject({ response: { code: 'FORBIDDEN' } });
    expect(database.transaction).not.toHaveBeenCalled();
  });

  it('updates the authenticated member confirmation and audits the change', async () => {
    const transactionQuery = jest
      .fn()
      .mockResolvedValueOnce({
        rows: [{ status: 'PUBLISHED', confirmation: 'PENDING' }],
        rowCount: 1,
      })
      .mockResolvedValueOnce({ rows: [], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [], rowCount: 1 });
    const database = {
      transaction: jest.fn((work: (client: TransactionClient) => Promise<void>) =>
        work({ query: transactionQuery } as unknown as TransactionClient),
      ),
    } as unknown as DatabaseService;
    const service = new DomainService(database);
    jest.spyOn(service, 'getOccurrence').mockResolvedValue({ id: 'occurrence-id' });

    await service.updateConfirmation(
      memberUser,
      'occurrence-id',
      'member-id',
      'CONFIRMED',
    );

    expect(transactionQuery.mock.calls[1][0]).toContain(
      'UPDATE occurrence_members SET confirmation=$1',
    );
    expect(transactionQuery.mock.calls[1][1]).toEqual([
      'CONFIRMED',
      'occurrence-id',
      'member-id',
    ]);
    expect(transactionQuery.mock.calls[2][0]).toContain(
      'UPDATE_OCCURRENCE_CONFIRMATION',
    );
  });

  it('preserves confirmations when the leader edits the formation', async () => {
    const transactionQuery = jest
      .fn()
      .mockResolvedValueOnce({ rows: [], rowCount: 0 })
      .mockResolvedValueOnce({ rows: [{}], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [], rowCount: 0 })
      .mockResolvedValueOnce({ rows: [], rowCount: 1 });
    const database = {
      query: jest.fn().mockResolvedValue({
        rows: [{ starts_at: new Date('2026-10-04T22:00:00Z') }],
        rowCount: 1,
      }),
      transaction: jest.fn((work: (client: TransactionClient) => Promise<void>) =>
        work({ query: transactionQuery } as unknown as TransactionClient),
      ),
    } as unknown as DatabaseService;
    const service = new DomainService(database);
    jest.spyOn(service, 'getOccurrence').mockResolvedValue({ id: 'occurrence-id' });

    await service.replaceMembers(
      { ...memberUser, role: 'LEADER' },
      'occurrence-id',
      [{ memberId: 'member-id', role: 'Voz', overrideConflicts: false }],
    );

    expect(transactionQuery.mock.calls[0][0]).toContain(
      'NOT (member_id=ANY($2::uuid[]))',
    );
    expect(transactionQuery.mock.calls[3][0]).toContain(
      'ON CONFLICT (occurrence_id,member_id) DO UPDATE',
    );
    expect(transactionQuery.mock.calls[3][0]).not.toContain(
      'confirmation=EXCLUDED.confirmation',
    );
  });
});

describe('DomainService occurrence batch creation', () => {
  const leader: SessionUser = {
    id: '00000000-0000-4000-8000-000000000001',
    parishId: '00000000-0000-4000-8000-000000000002',
    memberId: '00000000-0000-4000-8000-000000000003',
    name: 'Eury',
    email: 'eury@example.com',
    role: 'LEADER',
    initials: 'EU',
  };
  const ministryId = '00000000-0000-4000-8000-000000000004';
  const firstMemberId = '00000000-0000-4000-8000-000000000005';
  const secondMemberId = '00000000-0000-4000-8000-000000000006';
  const idempotencyKey = '00000000-0000-4000-8000-000000000007';
  const firstSongId = '00000000-0000-4000-8000-000000000008';
  const secondSongId = '00000000-0000-4000-8000-000000000009';

  it('rejects batches with more than five dates before opening a transaction', async () => {
    const database = { transaction: jest.fn() } as unknown as DatabaseService;
    const slot = {
      startsAt: '2026-10-14T09:00:00-03:00',
      title: 'Santa Missa',
      location: 'Igreja Matriz',
      excludedMemberIds: [],
      additionalMembers: [],
      setlist: { items: [] },
    };

    await expect(new DomainService(database).createOccurrenceBatch(
      leader,
      idempotencyKey,
      {
        timezone: 'America/Fortaleza',
        ministryId,
        slots: Array.from({ length: 6 }, (_, index) => ({
          ...slot,
          startsAt: `2026-10-${String(14 + index).padStart(2, '0')}T09:00:00-03:00`,
        })),
      },
    )).rejects.toMatchObject({
      response: { code: 'OCCURRENCE_BATCH_LIMIT_EXCEEDED' },
    });
    expect(database.transaction).not.toHaveBeenCalled();
  });

  it('creates independent member and repertoire copies for every date in one transaction', async () => {
    let occurrenceIndex = 0;
    const transactionQuery = jest.fn(async (sql: string) => {
      if (sql.includes('INSERT INTO occurrence_creation_batches'))
        return { rows: [{ id: 'batch-id' }], rowCount: 1 };
      if (sql.includes("SELECT id FROM ministries"))
        return { rows: [{ id: ministryId }], rowCount: 1 };
      if (sql.includes('FROM ministry_members mm'))
        return {
          rows: [
            { member_id: firstMemberId, role: 'Voz' },
            { member_id: secondMemberId, role: 'Violão' },
          ],
          rowCount: 2,
        };
      if (sql.includes('SELECT id,lyrics FROM songs'))
        return {
          rows: [
            { id: firstSongId, lyrics: 'Primeira letra' },
            { id: secondSongId, lyrics: 'Segunda letra' },
          ],
          rowCount: 2,
        };
      if (sql.includes('SELECT pg_advisory_xact_lock'))
        return { rows: [{}], rowCount: 1 };
      if (sql.includes('SELECT 1 FROM occurrences'))
        return { rows: [], rowCount: 0 };
      if (sql.includes('SELECT DISTINCT om.member_id'))
        return { rows: [], rowCount: 0 };
      if (sql.includes('INSERT INTO occurrences')) {
        occurrenceIndex++;
        return { rows: [{ id: `occurrence-${occurrenceIndex}` }], rowCount: 1 };
      }
      return { rows: [], rowCount: 1 };
    });
    const database = {
      transaction: jest.fn((work: (client: TransactionClient) => Promise<unknown>) =>
        work({ query: transactionQuery } as unknown as TransactionClient),
      ),
    } as unknown as DatabaseService;

    const result = await new DomainService(database).createOccurrenceBatch(
      leader,
      idempotencyKey,
      {
        timezone: 'America/Fortaleza',
        ministryId,
        slots: [
          {
            startsAt: '2026-10-14T09:00:00-03:00',
            title: 'Santa Missa',
            location: 'Igreja Matriz',
            liturgicalTime: 'Tempo Comum',
            notes: 'Primeira celebração',
            excludedMemberIds: [],
            additionalMembers: [],
            setlist: {
              items: [{
                songId: firstSongId,
                position: 1,
                key: 'C',
                liturgicalMoment: 'Entrada',
              }],
            },
          },
          {
            startsAt: '2026-10-28T19:00:00-03:00',
            title: 'Celebração da Palavra',
            location: 'Capela do Santíssimo',
            liturgicalTime: 'Solenidade',
            notes: 'Segunda celebração',
            excludedMemberIds: [secondMemberId],
            additionalMembers: [],
            setlist: {
              items: [{
                songId: secondSongId,
                position: 1,
                key: 'D',
                liturgicalMoment: 'Comunhão',
              }],
            },
          },
        ],
      },
    );

    const occurrenceInserts = transactionQuery.mock.calls.filter(([sql]) =>
      String(sql).includes('INSERT INTO occurrences'),
    );
    const lockQueries = transactionQuery.mock.calls.filter(([sql]) =>
      String(sql).includes('pg_advisory_xact_lock'),
    );
    const memberInserts = transactionQuery.mock.calls.filter(([sql]) =>
      String(sql).includes('INSERT INTO occurrence_members'),
    );
    const setlistInserts = transactionQuery.mock.calls.filter(([sql]) =>
      String(sql).includes('INSERT INTO setlist_items'),
    );
    expect(result).toEqual({
      batchId: 'batch-id',
      createdCount: 2,
      replayed: false,
      occurrenceIds: ['occurrence-1', 'occurrence-2'],
    });
    expect(occurrenceInserts).toHaveLength(2);
    expect(lockQueries).toHaveLength(2);
    expect(lockQueries.every(([sql]) => String(sql).includes('::text'))).toBe(true);
    expect(occurrenceInserts[0][1]).toEqual(expect.arrayContaining([
      'Santa Missa',
      'Igreja Matriz',
      'Tempo Comum',
      'Primeira celebração',
    ]));
    expect(occurrenceInserts[1][1]).toEqual(expect.arrayContaining([
      'Celebração da Palavra',
      'Capela do Santíssimo',
      'Solenidade',
      'Segunda celebração',
    ]));
    expect(memberInserts).toHaveLength(3);
    expect(memberInserts[0][1][0]).toBe('occurrence-1');
    expect(memberInserts[2][1][0]).toBe('occurrence-2');
    expect(memberInserts[2][1][1]).toBe(firstMemberId);
    expect(setlistInserts).toHaveLength(2);
    expect(setlistInserts[0][1][0]).toBe('occurrence-1');
    expect(setlistInserts[0][1][1]).toBe(firstSongId);
    expect(setlistInserts[1][1][0]).toBe('occurrence-2');
    expect(setlistInserts[1][1][1]).toBe(secondSongId);
  });

  it('replays an existing batch without creating occurrences again', async () => {
    let requestHash = '';
    const transactionQuery = jest.fn(async (sql: string, values?: readonly unknown[]) => {
      if (sql.includes('INSERT INTO occurrence_creation_batches')) {
        requestHash = String(values?.[3]);
        return { rows: [], rowCount: 0 };
      }
      if (sql.includes('SELECT id,request_hash'))
        return { rows: [{ id: 'batch-id', request_hash: requestHash }], rowCount: 1 };
      if (sql.includes('SELECT id FROM occurrences'))
        return {
          rows: [{ id: 'occurrence-1' }, { id: 'occurrence-2' }],
          rowCount: 2,
        };
      return { rows: [], rowCount: 0 };
    });
    const database = {
      transaction: jest.fn((work: (client: TransactionClient) => Promise<unknown>) =>
        work({ query: transactionQuery } as unknown as TransactionClient),
      ),
    } as unknown as DatabaseService;
    const service = new DomainService(database);
    const input = {
      timezone: 'America/Fortaleza',
      ministryId,
      slots: [{
        startsAt: '2026-10-14T09:00:00-03:00',
        title: 'Santa Missa',
        location: 'Igreja Matriz',
        liturgicalTime: 'Tempo Comum',
        notes: '',
        excludedMemberIds: [],
        additionalMembers: [],
        setlist: { items: [] },
      }],
    };

    await expect(service.createOccurrenceBatch(leader, idempotencyKey, input))
      .resolves.toEqual({
        batchId: 'batch-id',
        createdCount: 2,
        replayed: true,
        occurrenceIds: ['occurrence-1', 'occurrence-2'],
      });
    expect(transactionQuery).toHaveBeenCalledTimes(3);
  });
});

describe('DomainService paginated song options and bulk archive', () => {
  const leader: SessionUser = {
    id: 'leader-id',
    parishId: 'parish-id',
    memberId: 'member-id',
    name: 'Eury',
    email: 'eury@example.com',
    role: 'LEADER',
    initials: 'EU',
  };

  it('returns a lightweight page of song options', async () => {
    const query = jest.fn().mockResolvedValue({ rows: [{ id: 'song-id', title: 'Tua Palavra', default_key: 'D', liturgical_moments: ['Aclamação'], total_count: 12 }] });
    const result = await new DomainService({ query } as unknown as DatabaseService).listSongOptions(leader, 'Palavra', 2, 5);

    expect(query.mock.calls[0][1]).toEqual(['parish-id', 'Palavra', '%Palavra%', 5, 5]);
    expect(result).toEqual({ items: [{ songId: 'song-id', title: 'Tua Palavra', key: 'D', liturgicalMoment: 'Aclamação' }], page: 2, pageSize: 5, total: 12 });
  });

  it('archives all selected occurrences in one transaction and audits each one', async () => {
    const transactionQuery = jest.fn()
      .mockResolvedValueOnce({ rows: [{ id: 'occurrence-1', status: 'DRAFT' }, { id: 'occurrence-2', status: 'PUBLISHED' }], rowCount: 2 })
      .mockResolvedValueOnce({ rows: [], rowCount: 2 })
      .mockResolvedValueOnce({ rows: [], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [], rowCount: 1 });
    const database = { transaction: jest.fn((work: (client: TransactionClient) => Promise<void>) => work({ query: transactionQuery } as unknown as TransactionClient)) } as unknown as DatabaseService;

    await new DomainService(database).archiveOccurrences(leader, ['occurrence-1', 'occurrence-2']);

    expect(transactionQuery.mock.calls[1][0]).toContain('UPDATE occurrences');
    expect(transactionQuery.mock.calls[2][0]).toContain('ARCHIVE_OCCURRENCE');
    expect(transactionQuery.mock.calls[3][0]).toContain('ARCHIVE_OCCURRENCE');
  });
});

describe('DomainService external song sources', () => {
  const leader: SessionUser = {
    id: 'leader-id',
    parishId: 'parish-id',
    memberId: 'member-id',
    name: 'Eury',
    email: 'eury@example.com',
    role: 'LEADER',
    initials: 'EU',
  };

  it('accepts an exact HTTPS host from the allowlist', async () => {
    const query = jest.fn().mockResolvedValue({
      rows: [{
        id: 'song-id',
        parish_id: 'parish-id',
        title: 'Tua Palavra',
        author: 'Comunidade Católica Shalom',
        default_key: 'D',
        liturgical_moments: ['Aclamação'],
        lyrics: '',
        chords: '',
        content_mode: 'EXTERNAL_EMBED',
        external_url: 'https://cifrascatolicas.com.br/comunidade-catolica-shalom/tua-palavra',
        status: 'ACTIVE',
      }],
      rowCount: 1,
    });
    const service = new DomainService({ query } as unknown as DatabaseService);

    const result = await service.createSong(leader, {
      title: 'Tua Palavra',
      author: 'Comunidade Católica Shalom',
      defaultKey: 'D',
      liturgicalMoments: ['Aclamação'],
      contentMode: 'EXTERNAL_EMBED',
      externalUrl: 'https://cifrascatolicas.com.br/comunidade-catolica-shalom/tua-palavra',
    });

    expect(result).toMatchObject({ contentMode: 'EXTERNAL_EMBED', lyrics: '', chords: '' });
    expect(query.mock.calls[0][1]).toContain('EXTERNAL_EMBED');
  });

  it('rejects deceptive and non-allowlisted hosts before querying the database', async () => {
    const query = jest.fn();
    const service = new DomainService({ query } as unknown as DatabaseService);

    await expect(service.createSong(leader, {
      title: 'Música externa',
      author: 'Autor',
      defaultKey: 'C',
      liturgicalMoments: ['Entrada'],
      contentMode: 'EXTERNAL_EMBED',
      externalUrl: 'https://cifrascatolicas.com.br.attacker.test/musica',
    })).rejects.toMatchObject({ response: { code: 'EXTERNAL_SONG_SOURCE_NOT_ALLOWED' } });
    expect(query).not.toHaveBeenCalled();
  });
});

describe('DomainService occurrence archiving', () => {
  it('archives the scoped occurrence and records an audit event', async () => {
    const transactionQuery = jest
      .fn()
      .mockResolvedValueOnce({ rows: [{ status: 'PUBLISHED' }], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [], rowCount: 1 });
    const database = {
      transaction: jest.fn((work: (client: TransactionClient) => Promise<void>) =>
        work({ query: transactionQuery } as unknown as TransactionClient),
      ),
    } as unknown as DatabaseService;
    const user: SessionUser = {
      id: 'leader-id',
      parishId: 'parish-id',
      memberId: 'member-id',
      name: 'Eury',
      email: 'eury@example.com',
      role: 'LEADER',
      initials: 'EU',
    };

    await new DomainService(database).archiveOccurrence(user, 'occurrence-id');

    expect(transactionQuery.mock.calls[0][0]).toContain('archived_at=now()');
    expect(transactionQuery.mock.calls[0][1]).toEqual(['occurrence-id', 'parish-id']);
    expect(transactionQuery.mock.calls[1][0]).toContain('ARCHIVE_OCCURRENCE');
  });

  it('returns not found when the occurrence is absent or already archived', async () => {
    const database = {
      transaction: jest.fn((work: (client: TransactionClient) => Promise<void>) =>
        work({ query: jest.fn().mockResolvedValue({ rows: [], rowCount: 0 }) } as unknown as TransactionClient),
      ),
    } as unknown as DatabaseService;
    const user = { id: 'leader-id', parishId: 'parish-id', role: 'LEADER' } as SessionUser;

    await expect(new DomainService(database).archiveOccurrence(user, 'missing-id'))
      .rejects.toMatchObject({ response: { code: 'NOT_FOUND' } });
  });
});

describe('DomainService setlist lyrics arrangement', () => {
  it('updates the key only on the scoped setlist item', async () => {
    const transactionQuery = jest
      .fn()
      .mockResolvedValueOnce({ rows: [{ created_by: 'leader-id' }], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [{ id: 'item-id' }], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [], rowCount: 1 });
    const database = {
      transaction: jest.fn((work: (client: TransactionClient) => Promise<void>) =>
        work({ query: transactionQuery } as unknown as TransactionClient),
      ),
    } as unknown as DatabaseService;
    const service = new DomainService(database);
    jest.spyOn(service, 'getOccurrence').mockResolvedValue({ id: 'occurrence-id' });
    const user = { id: 'leader-id', parishId: 'parish-id', role: 'LEADER' } as SessionUser;

    await service.updateSetlistItem(user, 'occurrence-id', 'item-id', {
      key: 'D',
      liturgicalMoment: 'Entrada',
      notes: 'Tom definido para esta celebração',
    });

    expect(transactionQuery.mock.calls[1][0]).toContain('UPDATE setlist_items');
    expect(transactionQuery.mock.calls[1][1]).toEqual([
      'D',
      'Entrada',
      'Tom definido para esta celebração',
      'item-id',
      'occurrence-id',
    ]);
    expect(transactionQuery.mock.calls[2][0]).toContain('UPDATE_SETLIST_ITEM');
  });

  it('updates only the scoped setlist item and records an audit entry', async () => {
    const transactionQuery = jest
      .fn()
      .mockResolvedValueOnce({ rows: [{ created_by: 'leader-id' }], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [{ id: 'item-id' }], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [], rowCount: 1 });
    const database = {
      transaction: jest.fn((work: (client: TransactionClient) => Promise<void>) =>
        work({ query: transactionQuery } as unknown as TransactionClient),
      ),
    } as unknown as DatabaseService;
    const service = new DomainService(database);
    jest.spyOn(service, 'getOccurrence').mockResolvedValue({ id: 'occurrence-id' });
    const user = { id: 'leader-id', parishId: 'parish-id', role: 'LEADER' } as SessionUser;
    const content = { version: 1, segments: [{ text: 'Cantai', voice: 'WOMEN', bold: true }] };

    await service.updateSetlistLyrics(user, 'occurrence-id', 'item-id', content);

    expect(transactionQuery.mock.calls[1][0]).toContain('formatted_lyrics');
    expect(transactionQuery.mock.calls[1][1]).toEqual([
      JSON.stringify({ version: 1, segments: [{ text: 'Cantai', bold: true, voice: 'WOMEN' }] }),
      'item-id',
      'occurrence-id',
    ]);
    expect(transactionQuery.mock.calls[2][0]).toContain('UPDATE_SETLIST_LYRICS');
  });

  it('prevents another leader from editing the occurrence setlist', async () => {
    const transactionQuery = jest
      .fn()
      .mockResolvedValueOnce({ rows: [{ created_by: 'other-leader-id' }], rowCount: 1 });
    const database = {
      transaction: jest.fn((work: (client: TransactionClient) => Promise<void>) =>
        work({ query: transactionQuery } as unknown as TransactionClient),
      ),
    } as unknown as DatabaseService;
    const service = new DomainService(database);
    const user = { id: 'leader-id', parishId: 'parish-id', role: 'LEADER' } as SessionUser;

    await expect(
      service.updateSetlistLyrics(user, 'occurrence-id', 'item-id', {
        version: 1,
        segments: [{ text: 'Cantai' }],
      }),
    ).rejects.toMatchObject({ response: { code: 'FORBIDDEN' } });

    expect(transactionQuery).toHaveBeenCalledTimes(1);
  });
});
