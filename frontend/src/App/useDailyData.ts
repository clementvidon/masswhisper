import { type DailyDto, DailyDtoSchema } from '@masswhisper/shared/dtos';
import { useEffect, useState } from 'react';
import { z } from 'zod';

import { buildDailyResourceUrl } from '../config/runtime';

const CACHE_KEY = 'masswhisper:daily:v2';

const DailyCacheSchema = z
  .object({
    payload: DailyDtoSchema,
  })
  .strict();

const today = new Date().toISOString().slice(0, 10);

function readCachedDaily(): DailyDto | null {
  try {
    const raw = sessionStorage.getItem(CACHE_KEY);
    if (!raw) return null;

    const parsed = DailyCacheSchema.parse(JSON.parse(raw));

    if (parsed.payload.snapshotCreatedAt.slice(0, 10) !== today) {
      return null;
    }

    return parsed.payload;
  } catch {
    return null;
  }
}

function writeCachedDaily(payload: DailyDto) {
  try {
    sessionStorage.setItem(CACHE_KEY, JSON.stringify({ payload }));
  } catch {
    // ignore
  }
}

function normalizeError(error: unknown): Error {
  return error instanceof Error ? error : new Error('Erreur inconnue');
}

export function useDailyData() {
  const [data, setData] = useState<DailyDto | null>(null);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    const controller = new AbortController();

    const cached = readCachedDaily();

    if (cached) {
      setData(cached);
      return;
    }

    async function load() {
      try {
        const res = await fetch(buildDailyResourceUrl(), {
          cache: 'no-store',
          signal: controller.signal,
        });

        if (!res.ok) throw new Error(`HTTP ${String(res.status)}`);

        const fresh = DailyDtoSchema.parse(await res.json());

        writeCachedDaily(fresh);
        setData(fresh);
      } catch (err) {
        if (controller.signal.aborted) return;
        setError(normalizeError(err));
      }
    }

    void load();

    return () => {
      controller.abort();
    };
  }, []);

  const isSnapshotCurrentDay =
    data?.snapshotCreatedAt.startsWith(today) ?? false;

  return {
    data,
    error,
    isLoading: data === null && error === null,
    isSnapshotCurrentDay: data ? isSnapshotCurrentDay : true,
  };
}
