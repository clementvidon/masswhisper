import type { Report } from '@masswhisper/shared/domain';

import type {
  PipelineSnapshot,
  SnapshotData,
} from '../../../domain/value-objects/PipelineSnapshot';
import type {
  HeadlinesReadItem,
  SentimentHistoryPoint,
} from '../../read-models/snapshotReads';

/**
 * Persistence for pipeline snapshots.
 *
 * Contract (interface-wide):
 * - Timestamps are respected (no override); operations aim to be atomic.
 * - `id` is assigned by the adapter; reads are newest-first.
 */

export interface PersistencePort {
  /**
   * Persist a snapshot at an explicit timestamp.
   *
   * Contract:
   * - `createdAtISO` must be a valid ISO 8601 datetime (UTC recommended).
   * - Adapter must not override the provided timestamp.
   * - Operation should be atomic: either the whole snapshot is stored or none.
   * - The adapter assigns the snapshot `id`.
   */
  storeSnapshotAt(createdAtISO: string, snapshot: SnapshotData): Promise<void>;

  /**
   * Return the most recent report, or null if none exists.
   *
   * Contract:
   * - Result is the latest readable report by `createdAt`.
   * - Returns null when the store is empty.
   * - Returned `createdAt` must be an ISO 8601 string.
   */
  getLatestReport(): Promise<Report | null>;

  /**
   * Return the most recent headlines, or null if none exists.
   *
   * Contract:
   * - Result is the latest readable headlines by `createdAt`.
   * - Returns null when the store is empty.
   * - `weightedItems` only contains the minimal fields required by the read side.
   */
  getLatestHeadlines(): Promise<HeadlinesReadItem[] | null>;

  /**
   * Return the sentiment history intended for read-side trend queries.
   *
   * Contract:
   * - Results are ordered chronologically (oldest-first).
   * - Array may be empty when no snapshot exists.
   * - Each item is limited to the minimal aggregated sentiment fields required by the read side.
   */
  getSentimentHistory(): Promise<SentimentHistoryPoint[]>;

  /**
   * Return all persisted snapshots, ordered newest-first (strictly descending by createdAt).
   *
   * Contract:
   * - snapshots[0] is the most recent.
   * - Array is sorted strictly by createdAt descending.
   * - `createdAt` must be an ISO 8601 string.
   */
  getSnapshots(): Promise<PipelineSnapshot[]>;
}
