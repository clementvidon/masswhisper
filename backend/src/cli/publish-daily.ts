import 'dotenv/config';

import { randomUUID } from 'node:crypto';
import { pathToFileURL } from 'node:url';

import { getDaily } from '../application/usecases/queries/getDaily';
import {
  loadDatabaseConfig,
  loadReadApiConfig,
} from '../infrastructure/config/loaders';
import { writeDailyBundleAtomically } from '../infrastructure/daily-bundle/dailyBundleFileStore';
import { makeLogger } from '../infrastructure/logging/root';
import { PostgresAdapter } from '../infrastructure/persistence/PostgresAdapter';

const rootLogger = makeLogger();

export async function publishDaily() {
  const { databaseUrl } = loadDatabaseConfig();
  const { dailyBundlePath } = loadReadApiConfig();
  const persistence = new PostgresAdapter(databaseUrl);
  const daily = await getDaily(persistence);
  await writeDailyBundleAtomically(dailyBundlePath, daily);
}

const entryUrl = process.argv[1]
  ? pathToFileURL(process.argv[1]).href
  : undefined;

if (import.meta.url === entryUrl) {
  const logger = rootLogger.child({
    cmd: 'publishDaily',
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
    await publishDaily();
    process.exit(0);
  } catch (err) {
    logger.error('Failed to publish daily bundle', { error: err });
    process.exit(1);
  }
}
