import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { parse } from 'yaml';
import { z } from 'zod';

const PromptBundleSchema = z.object({
  variant: z.string().min(1),
  relevancePrompt: z.string().min(1),
  emotionPrompt: z.string().min(1),
  tonalityPrompt: z.string().min(1),
  reportPrompt: z.string().min(1),
});

const SourceBundleSchema = z.object({
  variant: z.string().min(1),
  sources: z
    .array(
      z.object({
        kind: z.literal('reddit'),
        url: z.string().url(),
      }),
    )
    .min(1),
});

const ManifestSchema = z.object({
  topic_slug: z.string().min(1),
  topic_name: z.string().min(1),
  environment: z.enum(['dev', 'prod']),
  schedule: z.string().min(1),
  sources_variant: z.string().min(1),
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
      sources_variant: manifest.sources_variant,
      prompt_variant: manifest.prompt_variant,
      database_name: manifest.database_name,
      domain: manifest.domain,
    },
  };
}

const manifestPath = process.argv[2];
const topicConfigDir = process.argv[3];
if (!manifestPath) {
  throw new Error(
    'Usage: generate-topic-tf-input <manifest-path> [topic-config-dir]',
  );
}

const raw = fs.readFileSync(path.resolve(manifestPath), 'utf8');
const parsed = parse(raw);
const manifest = ManifestSchema.parse(parsed);

const sourcesVariantPattern = new RegExp(`^${manifest.topic_slug}-v[0-9]+$`);
const promptVariantPattern = new RegExp(`^${manifest.topic_slug}-v[0-9]+$`);
if (!sourcesVariantPattern.test(manifest.sources_variant)) {
  throw new Error(`sources_variant must match ${manifest.topic_slug}-vN`);
}
if (!promptVariantPattern.test(manifest.prompt_variant)) {
  throw new Error(`prompt_variant must match ${manifest.topic_slug}-vN`);
}

if (topicConfigDir) {
  const promptPath = path.resolve(
    topicConfigDir,
    'prompts',
    `${manifest.prompt_variant}.json`,
  );
  const sourcesPath = path.resolve(
    topicConfigDir,
    'sources',
    `${manifest.sources_variant}.json`,
  );

  if (!fs.existsSync(promptPath)) {
    throw new Error(`Missing prompt bundle: ${promptPath}`);
  }
  if (!fs.existsSync(sourcesPath)) {
    throw new Error(`Missing sources bundle: ${sourcesPath}`);
  }

  const promptBundle = PromptBundleSchema.parse(
    JSON.parse(fs.readFileSync(promptPath, 'utf8')),
  );
  if (promptBundle.variant !== manifest.prompt_variant) {
    throw new Error(
      `Prompt bundle variant mismatch: expected ${manifest.prompt_variant}, got ${promptBundle.variant}`,
    );
  }

  const sourceBundle = SourceBundleSchema.parse(
    JSON.parse(fs.readFileSync(sourcesPath, 'utf8')),
  );
  if (sourceBundle.variant !== manifest.sources_variant) {
    throw new Error(
      `Sources bundle variant mismatch: expected ${manifest.sources_variant}, got ${sourceBundle.variant}`,
    );
  }
} else {
  console.warn(
    'No topic config directory provided; skipping local bundle validation.',
  );
}

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

console.log(`Generated: ${targetPath}`);
