import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { TopicManifest } from './topic-manifest.js';

export function deriveTerraformInput(manifest: TopicManifest) {
  return {
    topic_backend: {
      topic_slug: manifest.topic_slug,
      topic_name: manifest.topic_name,
      environment: manifest.environment,
      schedule: manifest.schedule,
      sources_variant: manifest.sources_variant,
      prompt_variant: manifest.prompt_variant,
      database_name: manifest.database_name,
      domain: manifest.domain,
    },
  };
}

export function getTerraformVarFilePath(manifest: TopicManifest): string {
  const scriptDir = path.dirname(fileURLToPath(import.meta.url));
  const repoRoot = path.resolve(scriptDir, '../../..');

  return path.join(
    repoRoot,
    'infra',
    'terraform',
    'generated',
    `${manifest.topic_slug}-${manifest.environment}.tfvars.json`,
  );
}

export function writeTerraformInputFile(targetPath: string, input: unknown): void {
  const json = JSON.stringify(input, null, 2);
  fs.mkdirSync(path.dirname(targetPath), { recursive: true });

  const tmpPath = path.join(
    path.dirname(targetPath),
    `.${path.basename(targetPath)}.${String(process.pid)}.tmp`,
  );

  try {
    fs.writeFileSync(tmpPath, `${json}\n`);
    fs.renameSync(tmpPath, targetPath);
  } finally {
    if (fs.existsSync(tmpPath)) {
      fs.rmSync(tmpPath, { force: true });
    }
  }
}
