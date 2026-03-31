import 'dotenv/config';

import { randomUUID } from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';

import fs from 'fs';
import path from 'path';

import type { LoggerPort } from '../application/ports/output/LoggerPort';
import { getLastReport } from '../application/usecases/queries/getLastReport';
import { getSentimentHistory } from '../application/usecases/queries/getSentimentHistory';
import { getTopHeadlines } from '../application/usecases/queries/getTopHeadlines';
import { loadDatabaseConfig } from '../infrastructure/config/loaders';
import { makeLogger } from '../infrastructure/logging/root';
import { PostgresAdapter } from '../infrastructure/persistence/PostgresAdapter';

const rootLogger = makeLogger();

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const outputDir = path.resolve(__dirname, '../../../frontend/public');
function save(logger: LoggerPort, filename: string, data: unknown) {
  const filePath = path.join(outputDir, filename);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(data ?? null, null, 2), 'utf-8');
  logger.info('Static file saved', { filename, outputDir });
}

export async function generateStatic(logger: LoggerPort) {
  const log = logger.child({ module: 'cli' });
  log.info('Generate static start');
  const { databaseUrl } = loadDatabaseConfig();
  const persistence = new PostgresAdapter(databaseUrl);

  const report = await getLastReport(persistence);
  const ticker = await getTopHeadlines(persistence, 5);
  const chart = await getSentimentHistory(persistence);

  save(log, 'report.json', report);
  save(log, 'ticker.json', ticker);
  save(log, 'chart.json', chart);

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
