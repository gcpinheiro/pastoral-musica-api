import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from './prisma.service';

interface QueryResult<T> {
  rows: T[];
  rowCount: number;
}
export interface TransactionClient {
  query<T extends object = Record<string, unknown>>(
    text: string,
    values?: readonly unknown[],
  ): Promise<QueryResult<T>>;
}

@Injectable()
export class DatabaseService {
  constructor(private readonly prisma: PrismaService) {}

  query<T extends object = Record<string, unknown>>(
    text: string,
    values: readonly unknown[] = [],
  ): Promise<QueryResult<T>> {
    return this.run<T>(this.prisma, text, values);
  }

  transaction<T>(work: (client: TransactionClient) => Promise<T>): Promise<T> {
    return this.prisma.$transaction((transaction) =>
      work({
        query: (text, values = []) => this.run(transaction, text, values),
      }),
    );
  }

  private async run<T extends object>(
    client: PrismaService | Prisma.TransactionClient,
    text: string,
    values: readonly unknown[],
  ): Promise<QueryResult<T>> {
    const returnsRows =
      /^\s*(select|with)\b/i.test(text) || /\breturning\b/i.test(text);
    if (returnsRows) {
      const rows = await client.$queryRawUnsafe<T[]>(text, ...values);
      return { rows, rowCount: rows.length };
    }
    const rowCount = await client.$executeRawUnsafe(text, ...values);
    return { rows: [], rowCount };
  }
}
