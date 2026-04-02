import 'dotenv/config';

import { randomUUID } from 'node:crypto';
import { pathToFileURL } from 'node:url';

import type { LoggerPort } from '../application/ports/output/LoggerPort';
import type { HttpServerConfig } from '../infrastructure/config/loaders';
import { loadHttpServerConfig } from '../infrastructure/config/loaders';
import { readDailyBundle } from '../infrastructure/daily-bundle/dailyBundleFileStore';
import { makeLogger } from '../infrastructure/logging/root';
import { makeReadApiController } from '../interface/web/ReadApiController';

const rootLogger = makeLogger();

type Deps = {
  logger: LoggerPort;
  bindHost: string;
  port: number;
  dailyBundlePath: string;
};

export function buildHttpServer(deps: Deps) {
  const app = makeReadApiController(deps.logger.child({ scope: 'web' }), {
    readDaily: () => readDailyBundle(deps.dailyBundlePath),
  });
  return { app, port: deps.port };
}

export function buildDeps(logger: LoggerPort, config: HttpServerConfig): Deps {
  const { bindHost, port, dailyBundlePath } = config;
  return {
    logger,
    bindHost,
    port,
    dailyBundlePath,
  };
}

export function runHttpServer(logger: LoggerPort) {
  const log = logger.child({ module: 'http' });
  const config = loadHttpServerConfig();
  const deps = buildDeps(log, config);
  const { app, port } = buildHttpServer(deps);
  return app.listen(port, deps.bindHost, () => {
    log.info('Server listening', { bindHost: deps.bindHost, port });
  });
}

const entryUrl = process.argv[1]
  ? pathToFileURL(process.argv[1]).href
  : undefined;
const isEntryPoint = import.meta.url === entryUrl;

if (isEntryPoint) {
  const logger = rootLogger.child({ cmd: 'httpServer', traceId: randomUUID() });
  process.on('unhandledRejection', (reason) => {
    logger.error('Unhandled rejection', { error: reason });
    process.exit(1);
  });
  process.on('uncaughtException', (err) => {
    logger.error('Uncaught exception', { error: err });
    process.exit(1);
  });
  try {
    runHttpServer(logger);
  } catch (err) {
    logger.error('HTTP server error', { error: err });
    process.exit(1);
  }
}
