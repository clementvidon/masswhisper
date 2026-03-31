import { describe, expect, test, vi } from 'vitest';

import type { PersistencePort } from '../../ports/output/PersistencePort';
import { getConfirmedRelevanceCacheBefore } from './getConfirmedRelevanceCacheBefore';

describe('getConfirmedRelevanceCacheBefore', () => {
  test('keeps only decisions confirmed twice in a row on identical content', async () => {
    const persistence: PersistencePort = {
      storeSnapshotAt: vi.fn(),
      getLatestReport: vi.fn().mockResolvedValue(null),
      getLatestHeadlines: vi.fn().mockResolvedValue(null),
      getSentimentHistory: vi.fn().mockResolvedValue([]),
      getSnapshots: () =>
        Promise.resolve([
          {
            id: '00000000-0000-0000-0000-000000000003',
            createdAt: '2025-01-03T10:00:00.000Z',
            status: 'ok',
            issues: [],
            fetchedItems: [
              {
                sourceFetchRef: 'source',
                itemRef: 'https://reddit.com/comments/abc',
                title: 'same title',
                content: 'same body',
                score: 1,
              },
            ],
            itemsRelevance: [
              {
                itemRef: 'https://reddit.com/comments/abc',
                relevant: true,
                category: 'emotional_insight',
                topicScore: 0.9,
                emotionScore: 0.8,
                genreScore: 0.9,
              },
            ],
            weightedItems: [],
            weightedSentimentProfiles: [],
            aggregatedSentimentProfile: {
              count: 0,
              confidenceMass: 0,
              emotions: {
                anger: 0,
                disgust: 0,
                fear: 0,
                joy: 0,
                sadness: 0,
                trust: 0,
              },
              tonalities: {
                negative: 0,
                negative_surprise: 0,
                optimistic_anticipation: 0,
                pessimistic_anticipation: 0,
                positive: 0,
                positive_surprise: 0,
              },
            },
            report: {
              text: 'RAS',
              emoji: '☀️',
            },
          },
          {
            id: '00000000-0000-0000-0000-000000000002',
            createdAt: '2025-01-02T10:00:00.000Z',
            status: 'ok',
            issues: [],
            fetchedItems: [
              {
                sourceFetchRef: 'source',
                itemRef: 'https://reddit.com/comments/abc',
                title: 'same title',
                content: 'same body',
                score: 1,
              },
            ],
            itemsRelevance: [
              {
                itemRef: 'https://reddit.com/comments/abc',
                relevant: true,
                category: 'emotional_insight',
                topicScore: 0.7,
                emotionScore: 0.6,
                genreScore: 0.8,
              },
            ],
            weightedItems: [],
            weightedSentimentProfiles: [],
            aggregatedSentimentProfile: {
              count: 0,
              confidenceMass: 0,
              emotions: {
                anger: 0,
                disgust: 0,
                fear: 0,
                joy: 0,
                sadness: 0,
                trust: 0,
              },
              tonalities: {
                negative: 0,
                negative_surprise: 0,
                optimistic_anticipation: 0,
                pessimistic_anticipation: 0,
                positive: 0,
                positive_surprise: 0,
              },
            },
            report: {
              text: 'RAS',
              emoji: '☀️',
            },
          },
        ]),
    };

    const cache = await getConfirmedRelevanceCacheBefore(
      '2025-01-04T10:00:00.000Z',
      persistence,
    );

    expect(cache.size).toBe(1);
    expect(cache.get('https://reddit.com/comments/abc')).toMatchObject({
      signature: 'same title\n\nsame body',
      relevance: {
        relevant: true,
      },
    });
  });
});
