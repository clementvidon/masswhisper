import { asc, desc } from 'drizzle-orm';
import { drizzle, type PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import type { Sql } from 'postgres';
import postgres from 'postgres';
import { v4 as uuidv4 } from 'uuid';

import type { PersistencePort } from '../../application/ports/output/PersistencePort';
import type { SentimentHistoryPoint } from '../../application/read-models/snapshotReads';
import {
  type PipelineSnapshot,
  PipelineSnapshotSchema,
  type SnapshotData,
  SnapshotDataSchema,
} from '../../domain/value-objects/PipelineSnapshot';
import { sleep } from '../../lib/async/sleep';
import { snapshotsTable } from './schema';

const pg = postgres as unknown as (...args: Parameters<typeof postgres>) => Sql;

type SnapshotRow = {
  id: string;
  data: unknown;
  createdAt: Date | null;
};

function requireCreatedAt(createdAt: Date | null, source: string): string {
  if (!createdAt) {
    throw new Error(`[${source}] Missing date_created.`);
  }
  return createdAt.toISOString();
}

function mapRowToSnapshot(row: SnapshotRow, source: string): PipelineSnapshot {
  return PipelineSnapshotSchema.parse({
    id: row.id,
    createdAt: requireCreatedAt(row.createdAt, source),
    ...SnapshotDataSchema.parse(row.data),
  });
}

function isRetryablePostgresReadError(err: unknown): boolean {
  const message = err instanceof Error ? err.message : String(err);
  const cause =
    err instanceof Error && err.cause instanceof Error ? err.cause.message : '';
  const text = `${message} ${cause}`;

  return (
    text.includes('CONNECT_TIMEOUT') ||
    text.includes('Control plane request failed') ||
    text.includes('ECONNRESET') ||
    text.includes('ETIMEDOUT') ||
    text.includes('Connection terminated unexpectedly')
  );
}

export class PostgresAdapter implements PersistencePort {
  private readonly db: PostgresJsDatabase;

  constructor(databaseUrl: string) {
    const client = pg(databaseUrl, { ssl: 'require' });
    this.db = drizzle(client);
  }

  async storeSnapshotAt(
    createdAtISO: string,
    snapshot: SnapshotData,
  ): Promise<void> {
    const parsedSnapshot = SnapshotDataSchema.parse(snapshot);
    await this.db.insert(snapshotsTable).values({
      id: uuidv4(),
      data: parsedSnapshot,
      date_created: new Date(createdAtISO),
    });
  }

  private async read<T>(operation: string, fn: () => Promise<T>): Promise<T> {
    const attempts = 3;

    for (let attempt = 1; attempt <= attempts; attempt++) {
      try {
        return await fn();
      } catch (err) {
        if (attempt === attempts || !isRetryablePostgresReadError(err)) {
          throw err;
        }

        await sleep(250 * attempt);
      }
    }

    throw new Error(`[${operation}] Postgres read retry exhausted`);
  }

  async getLatestSnapshot(): Promise<PipelineSnapshot | null> {
    const rows = await this.read('getLatestSnapshot', () =>
      this.db
        .select({
          id: snapshotsTable.id,
          data: snapshotsTable.data,
          createdAt: snapshotsTable.date_created,
        })
        .from(snapshotsTable)
        .orderBy(desc(snapshotsTable.date_created))
        .limit(1),
    );

    if (rows.length === 0) return null;
    return mapRowToSnapshot(rows[0], 'PostgresAdapter.getLatestSnapshot');
  }

  async getSentimentHistory(): Promise<SentimentHistoryPoint[]> {
    const rows = await this.read('getSentimentHistory', () =>
      this.db
        .select({
          data: snapshotsTable.data,
          createdAt: snapshotsTable.date_created,
        })
        .from(snapshotsTable)
        .orderBy(asc(snapshotsTable.date_created)),
    );

    return rows.map((row) => {
      const payload = SnapshotDataSchema.parse(row.data);
      const aggregate = payload.aggregatedSentimentProfile;

      return {
        createdAt: requireCreatedAt(
          row.createdAt,
          'PostgresAdapter.getSentimentHistory',
        ),
        count: aggregate.count,
        confidenceMass: aggregate.confidenceMass,
        emotions: aggregate.emotions,
        tonalities: aggregate.tonalities,
      };
    });
  }

  async getSnapshots(): Promise<PipelineSnapshot[]> {
    const rows = await this.read('getSnapshots', () =>
      this.db
        .select({
          id: snapshotsTable.id,
          data: snapshotsTable.data,
          createdAt: snapshotsTable.date_created,
        })
        .from(snapshotsTable)
        .orderBy(desc(snapshotsTable.date_created)),
    );

    return rows.map((row) =>
      mapRowToSnapshot(row, 'PostgresAdapter.getSnapshots'),
    );
  }
}
