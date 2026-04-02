import {
  type DailyDto,
  DailyDtoSchema,
  type HeadlineDto,
  HeadlineDtoSchema,
  type SentimentHistoryDto,
  SentimentHistoryPointDtoSchema,
} from '@masswhisper/shared/dtos';

import type { WeightedItem } from '../../../domain/entities';
import { formatFloat } from '../../../lib/number/formatFloat';
import { nowIso } from '../../../lib/time/nowIso';
import type { PersistencePort } from '../../ports/output/PersistencePort';

export const DAILY_HEADLINES_LIMIT = 10;

function mapHeadlineToDto(raw: {
  title: string;
  weight: number;
  itemRef: string;
}): HeadlineDto {
  return HeadlineDtoSchema.parse({
    title: raw.title,
    weight: formatFloat(raw.weight, 0),
    itemRef: raw.itemRef,
  });
}

function buildDailyHeadlines(
  weightedItems: WeightedItem[],
  limit = 10,
): HeadlineDto[] {
  return weightedItems
    .slice()
    .sort((a, b) => b.weight - a.weight)
    .slice(0, limit)
    .map(mapHeadlineToDto);
}

async function buildDailySentimentHistory(
  persistence: PersistencePort,
): Promise<SentimentHistoryDto> {
  const history = await persistence.getSentimentHistory();
  return history.map((point) => SentimentHistoryPointDtoSchema.parse(point));
}

export async function getDaily(
  persistence: PersistencePort,
): Promise<DailyDto> {
  const [latestSnapshot, sentimentHistory] = await Promise.all([
    persistence.getLatestSnapshot(),
    buildDailySentimentHistory(persistence),
  ]);
  if (!latestSnapshot) {
    throw new Error('Cannot build daily bundle without latest snapshot');
  }
  return DailyDtoSchema.parse({
    generatedAt: nowIso(),
    snapshotCreatedAt: latestSnapshot.createdAt,
    report: latestSnapshot.report,
    headlines: buildDailyHeadlines(
      latestSnapshot.weightedItems,
      DAILY_HEADLINES_LIMIT,
    ),
    sentimentHistory,
  });
}
