import { promises as fs } from 'node:fs';
import path from 'node:path';

import { type DailyDto, DailyDtoSchema } from '@masswhisper/shared/dtos';

export async function readDailyBundle(filePath: string): Promise<DailyDto> {
  const raw = await fs.readFile(filePath, 'utf8');
  return DailyDtoSchema.parse(JSON.parse(raw));
}

export async function writeDailyBundleAtomically(
  filePath: string,
  daily: DailyDto,
): Promise<void> {
  const validated = DailyDtoSchema.parse(daily);
  const dir = path.dirname(filePath);
  const tmpPath = path.join(
    dir,
    `.${path.basename(filePath)}.${String(process.pid)}.${String(Date.now())}.tmp`,
  );

  await fs.mkdir(dir, { recursive: true });

  let fileHandle: fs.FileHandle | undefined;
  let dirHandle: fs.FileHandle | undefined;
  try {
    fileHandle = await fs.open(tmpPath, 'wx');
    await fileHandle.writeFile(JSON.stringify(validated, null, 2), 'utf8');
    await fileHandle.sync();
    await fileHandle.close();
    fileHandle = undefined;

    await fs.rename(tmpPath, filePath);

    dirHandle = await fs.open(dir, 'r');
    await dirHandle.sync();
    await dirHandle.close();
    dirHandle = undefined;
  } finally {
    await fileHandle?.close().catch(() => undefined);
    await dirHandle?.close().catch(() => undefined);
    await fs.rm(tmpPath, { force: true }).catch(() => undefined);
  }
}
