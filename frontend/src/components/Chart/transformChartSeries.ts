import {
  TONALITY_AXIS_FIELDS,
  TONALITY_AXIS_KEYS,
  type TonalityAxisKey,
} from '@masswhisper/shared/domain';
import type { SentimentHistoryPointDto } from '@masswhisper/shared/dtos';

import { EMOTION_COLORS } from './config';
import { dateFmtTooltip } from './formatters';

export type EmotionSeriesPoint = {
  dateLabel: string;
  createdAt: string;
  confidenceMass: number;
} & Record<keyof typeof EMOTION_COLORS, number>;

export function buildEmotionSeries(
  profiles: SentimentHistoryPointDto[],
): EmotionSeriesPoint[] {
  const keys = Object.keys(EMOTION_COLORS) as (keyof typeof EMOTION_COLORS)[];
  return profiles
    .slice()
    .sort((a, b) => +new Date(a.createdAt) - +new Date(b.createdAt))
    .map(({ createdAt, confidenceMass, emotions }) => {
      const base = {} as Record<keyof typeof EMOTION_COLORS, number>;

      for (const key of keys) base[key] = emotions[key];

      return {
        dateLabel: dateFmtTooltip.format(new Date(createdAt)),
        createdAt,
        confidenceMass,
        ...base,
      };
    });
}

export type TonalitySeriesPoint = {
  createdAt: string;
  confidenceMass: number;
} & Record<TonalityAxisKey, number>;

export function buildTonalitySeries(
  profiles: SentimentHistoryPointDto[],
): TonalitySeriesPoint[] {
  return profiles
    .slice()
    .sort((a, b) => +new Date(a.createdAt) - +new Date(b.createdAt))
    .map(({ createdAt, confidenceMass, tonalities }) => {
      const base = {} as Record<TonalityAxisKey, number>;

      for (const key of TONALITY_AXIS_KEYS) {
        const { pos, neg } = TONALITY_AXIS_FIELDS[key];
        base[key] = tonalities[pos] - tonalities[neg];
      }

      return {
        createdAt,
        confidenceMass,
        ...base,
      };
    });
}
