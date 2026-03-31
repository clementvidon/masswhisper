import type { Report } from '@masswhisper/shared/domain';
import { asc, desc } from 'drizzle-orm';
import { drizzle, type PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import type { Sql } from 'postgres';
import postgres from 'postgres';
import { v4 as uuidv4 } from 'uuid';

import type { PersistencePort } from '../../application/ports/output/PersistencePort';
import type {
  HeadlinesReadItem,
  SentimentHistoryPoint,
} from '../../application/read-models/snapshotReads';
import {
  type PipelineSnapshot,
  PipelineSnapshotSchema,
  type SnapshotData,
  SnapshotDataSchema,
} from '../../domain/value-objects/PipelineSnapshot';
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

  async getLatestReport(): Promise<Report | null> {
    const rows = await this.db
      .select({
        id: snapshotsTable.id,
        data: snapshotsTable.data,
        createdAt: snapshotsTable.date_created,
      })
      .from(snapshotsTable)
      .orderBy(desc(snapshotsTable.date_created))
      .limit(1);

    if (rows.length === 0) return null;

    const row = rows[0];
    const payload = SnapshotDataSchema.parse(row.data);
    requireCreatedAt(row.createdAt, 'PostgresAdapter.getLatestReport');
    return payload.report;
  }

  async getLatestHeadlines(): Promise<HeadlinesReadItem[] | null> {
    const rows = await this.db
      .select({
        data: snapshotsTable.data,
        createdAt: snapshotsTable.date_created,
      })
      .from(snapshotsTable)
      .orderBy(desc(snapshotsTable.date_created))
      .limit(1);

    if (rows.length === 0) return null;

    const row = rows[0];
    const payload = SnapshotDataSchema.parse(row.data);

    requireCreatedAt(row.createdAt, 'PostgresAdapter.getLatestHeadlines');
    return payload.weightedItems.map(({ title, weight, itemRef }) => ({
      title,
      weight,
      itemRef,
    }));
  }

  async getSentimentHistory(): Promise<SentimentHistoryPoint[]> {
    const rows = await this.db
      .select({
        data: snapshotsTable.data,
        createdAt: snapshotsTable.date_created,
      })
      .from(snapshotsTable)
      .orderBy(asc(snapshotsTable.date_created));

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
    const rows = await this.db
      .select({
        id: snapshotsTable.id,
        data: snapshotsTable.data,
        createdAt: snapshotsTable.date_created,
      })
      .from(snapshotsTable)
      .orderBy(desc(snapshotsTable.date_created));

    return rows.map((row) =>
      mapRowToSnapshot(row, 'PostgresAdapter.getSnapshots'),
    );
  }
}
