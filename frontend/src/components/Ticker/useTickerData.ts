import { type HeadlineDto, HeadlineDtoSchema } from '@masswhisper/shared/dtos';
import { useEffect, useState } from 'react';

import { buildFrontendResourceUrl } from '../../config/runtime';
import { shuffleArray } from '../../utils/shuffle';

export function useTickerData() {
  const [headlines, setHeadlines] = useState<HeadlineDto[] | null>(null);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        const res = await fetch(buildFrontendResourceUrl('ticker'));
        if (!res.ok) {
          setHeadlines([]);
          return;
        }
        const payload: unknown = await res.json();
        const result = HeadlineDtoSchema.array().safeParse(payload);
        if (!result.success) {
          setError(new Error(result.error.message));
          setHeadlines([]);
          return;
        }
        setHeadlines(shuffleArray(result.data));
      } catch (e) {
        setError(e instanceof Error ? e : new Error('Erreur inconnue'));
        setHeadlines([]);
      }
    })();
  }, []);

  return {
    headlines,
    isLoading: headlines === null && error === null,
    error,
  };
}
