import { describe, expect, test, vi } from 'vitest';

import type { RelevantItem, WeightedItem } from '../../../domain/entities';
import type { PipelineSnapshot } from '../../../domain/value-objects/PipelineSnapshot';
import type { PersistencePort } from '../../ports/output/PersistencePort';
import { getLastRelevantItemsBefore } from './getLastRelevantItemsBefore';

/**
 * Spec: Return relevant items from the closest snapshot strictly before a reference date.
 * - Selects the snapshot with the greatest `createdAt` such that `createdAt < referenceDate`.
 * - Returns that snapshot’s relevant items derived from `weightedItems`, or `[]` if no snapshot matches.
 */

describe('getLastRelevantItemsBefore', () => {
  function makeRelevantItem(
    overrides: Partial<RelevantItem> = {},
  ): RelevantItem {
    return {
      sourceFetchRef: 'sourceFetchRef',
      itemRef: 'itemRef',
      title: 'title',
      content: 'content',
      score: 1,
      ...overrides,
    };
  }
  function makeWeightedItem(
    overrides: Partial<WeightedItem> = {},
  ): WeightedItem {
    return {
      sourceFetchRef: 'sourceFetchRef',
      itemRef: 'itemRef',
      title: 'title',
      content: 'content',
      score: 1,
      weight: 1,
      ...overrides,
    };
  }
  function makePipelineSnapshot(
    overrides: Partial<PipelineSnapshot> = {},
  ): PipelineSnapshot {
    return {
      id: 'id',
      createdAt: '2001-01-01',
      status: 'ok',
      issues: [],
      fetchedItems: [],
      itemsRelevance: [],
      weightedItems: [],
      weightedSentimentProfiles: [],
      aggregatedSentimentProfile: {
        count: 0,
        confidenceMass: 0,
        emotions: {
          joy: 0,
          trust: 0,
          anger: 0,
          fear: 0,
          sadness: 0,
          disgust: 0,
        },
        tonalities: {
          positive: 0,
          negative: 0,
          positive_surprise: 0,
          negative_surprise: 0,
          optimistic_anticipation: 0,
          pessimistic_anticipation: 0,
        },
      },
      report: {
        text: 'report',
        emoji: '☀️',
      },
      ...overrides,
    };
  }
  function makePersistence(): PersistencePort {
    const snapshots: PipelineSnapshot[] = [
      makePipelineSnapshot({
        createdAt: '2026-02-01',
        weightedItems: [makeWeightedItem({ title: 'A', weight: 3 })],
      }),
      makePipelineSnapshot({
        createdAt: '2026-02-02',
        weightedItems: [makeWeightedItem({ title: 'B', weight: 3 })],
      }),
      makePipelineSnapshot({
        createdAt: '2026-02-03',
        weightedItems: [makeWeightedItem({ title: 'C', weight: 3 })],
      }),
      makePipelineSnapshot({
        createdAt: '2026-02-04',
        weightedItems: [makeWeightedItem({ title: 'D', weight: 3 })],
      }),
    ];
    const persistence = {
      getSnapshots: vi.fn().mockResolvedValue(snapshots),
      storeSnapshotAt: vi.fn(),
      getLatestReport: vi.fn().mockResolvedValue(null),
      getLatestHeadlines: vi.fn().mockResolvedValue(null),
      getSentimentHistory: vi.fn().mockResolvedValue([]),
    };
    return persistence;
  }

  test('returns relevant items from the closest snapshot before the given date', async () => {
    const createdAtISO = '2026-02-03';
    const persistence = makePersistence();

    const result = await getLastRelevantItemsBefore(createdAtISO, persistence);

    expect(result[0]).toStrictEqual(makeRelevantItem({ title: 'B' }));
    expect(result[0]).not.toHaveProperty('weight');
  });
  test('return an empty array if it is not found', async () => {
    const createdAtISO = '1999-01-01';
    const persistence = makePersistence();

    const result = await getLastRelevantItemsBefore(createdAtISO, persistence);

    expect(result).toStrictEqual([]);
  });
});
