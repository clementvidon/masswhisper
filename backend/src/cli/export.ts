import 'dotenv/config';

import { randomUUID } from 'node:crypto';
import { pathToFileURL } from 'node:url';

import fs from 'fs';
import path from 'path';

import type { LoggerPort } from '../application/ports/output/LoggerPort';
import { loadDatabaseConfig } from '../infrastructure/config/loaders';
import { makeLogger } from '../infrastructure/logging/root';
import { PostgresAdapter } from '../infrastructure/persistence/PostgresAdapter';

const rootLogger = makeLogger();

export async function runExport(logger: LoggerPort, outArg?: string) {
  const log = logger.child({ module: 'cli' });
  log.info('Snapshots export start');
  const outPath = outArg ?? (process.argv[2] || './tmp/snapshots-export.json');

  const { databaseUrl } = loadDatabaseConfig();
  const persistence = new PostgresAdapter(databaseUrl);
  const snapshots = await persistence.getSnapshots();

  const ordered = [...snapshots].sort(
    (a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt),
  );

  const absPath = path.isAbsolute(outPath)
    ? outPath
    : path.resolve(process.cwd(), outPath);
  fs.mkdirSync(path.dirname(absPath), { recursive: true });
  fs.writeFileSync(absPath, JSON.stringify(ordered, null, 2), 'utf-8');
  log.info('Snapshots export done', {
    snapshotCount: ordered.length,
    outputPath: absPath,
  });
}

const entryUrl = process.argv[1]
  ? pathToFileURL(process.argv[1]).href
  : undefined;
const isEntryPoint = import.meta.url === entryUrl;

if (isEntryPoint) {
  const logger = rootLogger.child({ cmd: 'export', traceId: randomUUID() });
  process.on('unhandledRejection', (reason) => {
    logger.error('Unhandled rejection', { error: reason });
    process.exit(1);
  });
  process.on('uncaughtException', (err) => {
    logger.error('Uncaught exception', { error: err });
    process.exit(1);
  });
  try {
    await runExport(logger);
    process.exit(0);
  } catch (err) {
    logger.error('Export failed', { error: err });
    process.exit(1);
  }
}
