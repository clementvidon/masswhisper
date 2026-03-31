import 'dotenv/config';

import { randomUUID } from 'node:crypto';
import { pathToFileURL } from 'node:url';

import type { LoggerPort } from '../application/ports/output/LoggerPort';
import type { PersistencePort } from '../application/ports/output/PersistencePort';
import { makeSnapshotQueryService } from '../application/usecases/queries/makeSnapshotQueryService';
import type { HttpServerConfig } from '../infrastructure/config/loaders';
import { loadHttpServerConfig } from '../infrastructure/config/loaders';
import { makeLogger } from '../infrastructure/logging/root';
import { PostgresAdapter } from '../infrastructure/persistence/PostgresAdapter';
import { makeReportController } from '../interface/web/ReportController';

const rootLogger = makeLogger();

type Deps = {
  logger: LoggerPort;
  bindHost: string;
  port: number;
  persistence: PersistencePort;
};

export function buildHttpServer(deps: Deps) {
  const query = makeSnapshotQueryService(deps.persistence);
  const app = makeReportController(deps.logger.child({ scope: 'web' }), query);
  return { app, port: deps.port };
}

export function buildDeps(logger: LoggerPort, config: HttpServerConfig): Deps {
  const { bindHost, port, databaseUrl } = config;
  return {
    logger,
    bindHost,
    port,
    persistence: new PostgresAdapter(databaseUrl),
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
