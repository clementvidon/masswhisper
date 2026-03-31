import type { Report } from '@masswhisper/shared/domain';
import type {
  HeadlineDto,
  SentimentHistoryDto,
} from '@masswhisper/shared/dtos';

/**
 * Read-only query port for application-level snapshot data.
 *
 * Contract (interface-wide):
 * - Pure reads only; no side effects; immutable results.
 * - DTO shapes are stable; callers handle caching/retries.
 */
export interface SnapshotQueryPort {
  /** Returns the latest report or null if none. */
  getLastReport(): Promise<Report | null>;
  /** Returns the chronological sentiment history exposed by the read API. */
  getSentimentHistory(): Promise<SentimentHistoryDto>;
  /** Returns top headlines from the latest snapshot; `limit` defaults are impl-specific. */
  getTopHeadlines(limit?: number): Promise<HeadlineDto[]>;
}
