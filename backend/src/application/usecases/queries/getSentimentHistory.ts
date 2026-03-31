import {
  type SentimentHistoryDto,
  SentimentHistoryPointDtoSchema,
} from '@masswhisper/shared/dtos';

import type { PersistencePort } from '../../ports/output/PersistencePort';

export async function getSentimentHistory(
  persistence: PersistencePort,
): Promise<SentimentHistoryDto> {
  const history = await persistence.getSentimentHistory();
  return history.map((point) => SentimentHistoryPointDtoSchema.parse(point));
}
