import 'dotenv/config';

import { randomUUID } from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';

import path from 'path';

import type { LoggerPort } from '../application/ports/output/LoggerPort';
import { getDaily } from '../application/usecases/queries/getDaily';
import { loadDatabaseConfig } from '../infrastructure/config/loaders';
import { writeDailyBundleAtomically } from '../infrastructure/daily-bundle/dailyBundleFileStore';
import { makeLogger } from '../infrastructure/logging/root';
import { PostgresAdapter } from '../infrastructure/persistence/PostgresAdapter';

const rootLogger = makeLogger();

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const outputFile = path.resolve(
  __dirname,
  '../../../frontend/public/daily.json',
);

export async function generateStatic(logger: LoggerPort) {
  const log = logger.child({ module: 'cli' });
  log.info('Generate static start');
  const { databaseUrl } = loadDatabaseConfig();
  const persistence = new PostgresAdapter(databaseUrl);

  const daily = await getDaily(persistence);
  await writeDailyBundleAtomically(outputFile, daily);

  log.info('Generate static done');
}

const entryUrl = process.argv[1]
  ? pathToFileURL(process.argv[1]).href
  : undefined;
const isEntryPoint = import.meta.url === entryUrl;

if (isEntryPoint) {
  const logger = rootLogger.child({
    cmd: 'generateStatic',
    traceId: randomUUID(),
  });
  process.on('unhandledRejection', (reason) => {
    logger.error('Unhandled rejection', { error: reason });
    process.exit(1);
  });
  process.on('uncaughtException', (err) => {
    logger.error('Uncaught exception', { error: err });
    process.exit(1);
  });
  try {
    await generateStatic(logger);
    process.exit(0);
  } catch (err) {
    logger.error('Failed to generate static JSON', { error: err });
    process.exit(1);
  }
}
