import request from 'supertest';
import { describe, expect, test, vi } from 'vitest';

import { NoopLoggerAdapter } from '../../infrastructure/logging/NoopLoggerAdapter';
import { makeReadApiController } from './ReadApiController';

describe('ReadApiController', () => {
  test('GET /health returns 200', async () => {
    const app = makeReadApiController(new NoopLoggerAdapter(), {
      getLastReport: vi.fn(),
      getSentimentHistory: vi.fn(),
      getTopHeadlines: vi.fn(),
    });

    const response = await request(app).get('/health');
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ ok: true });
  });

  test('POST /report is not exposed', async () => {
    const app = makeReadApiController(new NoopLoggerAdapter(), {
      getLastReport: vi.fn(),
      getSentimentHistory: vi.fn(),
      getTopHeadlines: vi.fn(),
    });

    const response = await request(app).post('/report');
    expect(response.status).toBe(404);
  });

  test('GET /headlines returns 200', async () => {
    const app = makeReadApiController(new NoopLoggerAdapter(), {
      getLastReport: vi.fn(),
      getSentimentHistory: vi.fn().mockResolvedValue([]),
      getTopHeadlines: vi.fn().mockResolvedValue([]),
    });

    const response = await request(app).get('/headlines');
    expect(response.status).toBe(200);
    expect(response.body).toEqual([]);
  });

  test('GET /sentiment-history returns 200', async () => {
    const app = makeReadApiController(new NoopLoggerAdapter(), {
      getLastReport: vi.fn(),
      getSentimentHistory: vi.fn().mockResolvedValue([]),
      getTopHeadlines: vi.fn(),
    });

    const response = await request(app).get('/sentiment-history');
    expect(response.status).toBe(200);
    expect(response.body).toEqual([]);
  });
});
