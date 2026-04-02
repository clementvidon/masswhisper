import type { EmotionScores, TonalityScores } from '@masswhisper/shared/domain';

export type SentimentHistoryPoint = {
  createdAt: string;
  count: number;
  confidenceMass: number;
  emotions: EmotionScores;
  tonalities: TonalityScores;
};
