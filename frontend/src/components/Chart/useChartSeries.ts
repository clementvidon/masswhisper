import {
  EMOTION_SCORE_FIELDS,
  TONALITY_AXIS_KEYS,
} from '@masswhisper/shared/domain';
import { type SentimentHistoryDto } from '@masswhisper/shared/dtos';
import { useMemo } from 'react';

import { smoothUX } from './smoothing';
import {
  buildEmotionSeries,
  buildTonalitySeries,
} from './transformChartSeries';

export function useChartSeries(sentimentHistory: SentimentHistoryDto) {
  return useMemo(
    () => ({
      emotionData: smoothUX(
        buildEmotionSeries(sentimentHistory),
        EMOTION_SCORE_FIELDS,
        'custom',
        {
          weightKey: 'confidenceMass',
          minInfluence: 0.15,
          massHalfSaturation: 8,
        },
      ),
      tonalityData: smoothUX(
        buildTonalitySeries(sentimentHistory),
        TONALITY_AXIS_KEYS,
        'custom',
        {
          weightKey: 'confidenceMass',
          minInfluence: 0.15,
          massHalfSaturation: 8,
        },
      ),
    }),
    [sentimentHistory],
  );
}
