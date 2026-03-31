import type { Report } from '@masswhisper/shared/domain';
import {
  type HeadlineDto,
  type SentimentHistoryDto,
} from '@masswhisper/shared/dtos';

import type { SnapshotQueryPort } from '../../ports/input/SnapshotQueryPort';
import type { PersistencePort } from '../../ports/output/PersistencePort';
import { getLastReport } from './getLastReport';
import { getSentimentHistory as getSentimentHistoryQuery } from './getSentimentHistory';
import { getTopHeadlines } from './getTopHeadlines';

export class SnapshotQueryService implements SnapshotQueryPort {
  constructor(private readonly persistence: PersistencePort) {}

  async getLastReport(): Promise<Report | null> {
    return getLastReport(this.persistence);
  }
  getSentimentHistory(): Promise<SentimentHistoryDto> {
    return getSentimentHistoryQuery(this.persistence);
  }
  getTopHeadlines(limit?: number): Promise<HeadlineDto[]> {
    return getTopHeadlines(this.persistence, limit);
  }
}
