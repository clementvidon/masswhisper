import type { DailyDto } from '@masswhisper/shared/dtos';
import express, { type Express } from 'express';

import type { LoggerPort } from '../../application/ports/output/LoggerPort';

type ReadApiControllerDeps = {
  readDaily: () => Promise<DailyDto>;
};

export function makeReadApiController(
  logger: LoggerPort,
  deps: ReadApiControllerDeps,
): Express {
  const app = express();
  app.use(express.json());

  const frontendOrigin = process.env.FRONTEND_ORIGIN;

  function applyReadCors(req: express.Request, res: express.Response) {
    if (!frontendOrigin) {
      return;
    }
    const requestOrigin = req.get('Origin');
    if (requestOrigin !== frontendOrigin) {
      return;
    }
    res.setHeader('Access-Control-Allow-Origin', frontendOrigin);
    res.setHeader('Vary', 'Origin');
  }

  app.use((req, _res, next) => {
    const requestId = globalThis.crypto.randomUUID();
    req.logger = logger.child({ requestId });
    next();
  });

  app.get('/health', (_req, res) => {
    res.status(200).json({ ok: true });
  });

  app.get('/daily', async (req, res) => {
    applyReadCors(req, res);
    const reqLogger = req.logger ?? logger;
    try {
      const daily = await deps.readDaily();
      res.setHeader('Cache-Control', 'no-store');
      res.json(daily);
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      reqLogger.warn(
        'Failed to load daily bundle',
        { path: '/daily', method: 'GET' },
        error,
      );
      res.status(503).json({ error: 'Failed to load daily bundle' });
    }
  });

  return app;
}
