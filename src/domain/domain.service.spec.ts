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
