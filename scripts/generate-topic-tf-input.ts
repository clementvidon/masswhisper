import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { parse } from 'yaml';
import { z } from 'zod';

const SourceSchema = z.object({
  kind: z.literal('reddit'),
  url: z.string().url(),
});

const ManifestSchema = z.object({
  topic_slug: z.string().min(1),
  topic_name: z.string().min(1),
  environment: z.enum(['dev', 'prod']),
  schedule: z.string().min(1),
  sources: z.array(SourceSchema).min(1),
  prompt_variant: z.string().min(1),
  database_name: z.string().min(1),
  domain: z.string().min(1),
});

function deriveTfInput(manifest: z.infer<typeof ManifestSchema>) {
  return {
    topic_backend: {
      topic_slug: manifest.topic_slug,
      topic_name: manifest.topic_name,
      environment: manifest.environment,
      schedule: manifest.schedule,
      sources: manifest.sources,
      prompt_variant: manifest.prompt_variant,
      database_name: manifest.database_name,
      domain: manifest.domain,
    },
  };
}

const manifestPath = process.argv[2];
if (!manifestPath) throw new Error('Usage: generate-topic-tf-input <manifest-path>');

const raw = fs.readFileSync(path.resolve(manifestPath), 'utf8');
const parsed = parse(raw);
const manifest = ManifestSchema.parse(parsed);
const tfInput = deriveTfInput(manifest);
const json = JSON.stringify(tfInput, null, 2);

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, '..');
const targetPath = path.join(
  repoRoot,
  'infra',
  'terraform',
  'generated',
  `${manifest.topic_slug}-${manifest.environment}.tfvars.json`,
);

fs.mkdirSync(path.dirname(targetPath), { recursive: true });
fs.writeFileSync(targetPath, `${json}\n`);

console.log(`Generated: ${targetPath}`);
