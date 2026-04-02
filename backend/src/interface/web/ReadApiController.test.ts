import request from 'supertest';
import { describe, expect, test, vi } from 'vitest';

import { NoopLoggerAdapter } from '../../infrastructure/logging/NoopLoggerAdapter';
import { makeReadApiController } from './ReadApiController';

const DAILY_FIXTURE = {
  generatedAt: '2026-04-02T08:00:00.000Z',
  snapshotCreatedAt: '2026-04-02T07:58:00.000Z',
  report: {
    emoji: '☀️ ',
    text: 'Marche plutot calme aujourd hui.',
  },
  headlines: [
    {
      title: 'Titre 1',
      weight: '42',
      itemRef: 't3_abc123',
    },
  ],
  sentimentHistory: [
    {
      createdAt: '2026-04-02T07:58:00.000Z',
      count: 12,
      confidenceMass: 8.5,
      emotions: {
        joy: 0.4,
        trust: 0.3,
        anger: 0.1,
        fear: 0.05,
        sadness: 0.1,
        disgust: 0.05,
      },
      tonalities: {
        positive: 0.5,
        negative: 0.2,
        positive_surprise: 0.1,
        negative_surprise: 0.05,
        optimistic_anticipation: 0.1,
        pessimistic_anticipation: 0.05,
      },
    },
  ],
} as const;

describe('ReadApiController', () => {
  test('GET /health returns 200', async () => {
    const app = makeReadApiController(new NoopLoggerAdapter(), {
      readDaily: vi.fn(),
    });

    const response = await request(app).get('/health');
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ ok: true });
  });

  test('POST /daily is not exposed', async () => {
    const app = makeReadApiController(new NoopLoggerAdapter(), {
      readDaily: vi.fn(),
    });

    const response = await request(app).post('/daily');
    expect(response.status).toBe(404);
  });

  test('GET /daily returns 200 with no-store cache header', async () => {
    const app = makeReadApiController(new NoopLoggerAdapter(), {
      readDaily: vi.fn().mockResolvedValue(DAILY_FIXTURE),
    });

    const response = await request(app).get('/daily');
    expect(response.status).toBe(200);
    expect(response.headers['cache-control']).toBe('no-store');
    expect(response.body).toEqual(DAILY_FIXTURE);
  });

  test('GET /daily returns 503 when bundle loading fails', async () => {
    const app = makeReadApiController(new NoopLoggerAdapter(), {
      readDaily: vi.fn().mockRejectedValue(new Error('boom')),
    });

    const response = await request(app).get('/daily');
    expect(response.status).toBe(503);
    expect(response.body).toEqual({ error: 'Failed to load daily bundle' });
  });

  test('GET /daily sets CORS header for allowed origin', async () => {
    process.env.FRONTEND_ORIGIN = 'https://front.example.com';
    const app = makeReadApiController(new NoopLoggerAdapter(), {
      readDaily: vi.fn().mockResolvedValue(DAILY_FIXTURE),
    });

    const response = await request(app)
      .get('/daily')
      .set('Origin', 'https://front.example.com');

    expect(response.headers['access-control-allow-origin']).toBe(
      'https://front.example.com',
    );
  });
});
