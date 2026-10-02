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
  it('updates only the scoped setlist item and records an audit entry', async () => {
    const transactionQuery = jest
      .fn()
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

    expect(transactionQuery.mock.calls[0][0]).toContain('formatted_lyrics');
    expect(transactionQuery.mock.calls[0][1]).toEqual([
      JSON.stringify({ version: 1, segments: [{ text: 'Cantai', bold: true, voice: 'WOMEN' }] }),
      'item-id',
      'occurrence-id',
      'parish-id',
    ]);
    expect(transactionQuery.mock.calls[1][0]).toContain('UPDATE_SETLIST_LYRICS');
  });
});
