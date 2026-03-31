import type { EmotionScores, TonalityScores } from '@masswhisper/shared/domain';

import type { WeightedItem } from '../../domain/entities';

export type HeadlinesReadItem = Pick<
  WeightedItem,
  'title' | 'weight' | 'itemRef'
>;

export type SentimentHistoryPoint = {
  createdAt: string;
  count: number;
  confidenceMass: number;
  emotions: EmotionScores;
  tonalities: TonalityScores;
};
