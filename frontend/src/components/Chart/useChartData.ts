import {
  EMOTION_SCORE_FIELDS,
  TONALITY_AXIS_KEYS,
} from '@masswhisper/shared/domain';
import { SentimentHistoryPointDtoSchema } from '@masswhisper/shared/dtos';
import { useEffect, useState } from 'react';

import { smoothUX } from './smoothing';
import {
  buildEmotionSeries,
  buildTonalitySeries,
  type EmotionSeriesPoint,
  type TonalitySeriesPoint,
} from './transformChartSeries';

export function useChartData() {
  const [emotionData, setEmotionData] = useState<EmotionSeriesPoint[] | null>(
    null,
  );
  const [tonalityData, setTonalityData] = useState<
    TonalitySeriesPoint[] | null
  >(null);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        const baseUrl = import.meta.env.BASE_URL;
        const res = await fetch(baseUrl + 'chart.json');
        const payload: unknown = await res.json();
        const result =
          SentimentHistoryPointDtoSchema.array().safeParse(payload);
        if (!result.success) {
          setError(new Error(result.error.message));
          setEmotionData([]);
          setTonalityData([]);
          return;
        }
        const profiles = result.data;
        setEmotionData(
          smoothUX<EmotionSeriesPoint>(
            buildEmotionSeries(profiles),
            EMOTION_SCORE_FIELDS,
            'custom',
            {
              weightKey: 'confidenceMass',
              minInfluence: 0.15,
              massHalfSaturation: 8,
            },
          ),
        );
        setTonalityData(
          smoothUX<TonalitySeriesPoint>(
            buildTonalitySeries(profiles),
            TONALITY_AXIS_KEYS,
            'custom',
            {
              weightKey: 'confidenceMass',
              minInfluence: 0.15,
              massHalfSaturation: 8,
            },
          ),
        );
      } catch (e) {
        setError(e instanceof Error ? e : new Error('Erreur inconnue'));
        setEmotionData([]);
        setTonalityData([]);
      }
    })();
  }, []);

  return {
    emotionData,
    tonalityData,
    isLoading: !emotionData || !tonalityData,
    error,
  };
}
