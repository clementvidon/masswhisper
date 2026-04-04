import fs from 'node:fs';
import path from 'node:path';
import { parse } from 'yaml';
import { z } from 'zod';

export const TopicManifestSchema = z.object({
  topic_slug: z.string().min(1),
  topic_name: z.string().min(1),
  environment: z.enum(['dev', 'prod']),
  schedule: z.string().min(1),
  sources_variant: z.string().min(1),
  prompt_variant: z.string().min(1),
  database_name: z.string().min(1),
  domain: z.string().min(1),
});

export type TopicManifest = z.infer<typeof TopicManifestSchema>;

export function parseTopicManifest(raw: string): TopicManifest {
  return TopicManifestSchema.parse(parse(raw));
}

export function readTopicManifest(manifestPath: string): TopicManifest {
  const raw = fs.readFileSync(path.resolve(manifestPath), 'utf8');
  return parseTopicManifest(raw);
}

export function validateTopicManifestRules(manifest: TopicManifest): void {
  const sourcesVariantPattern = new RegExp(`^${manifest.topic_slug}-v[0-9]+$`);
  const promptVariantPattern = new RegExp(`^${manifest.topic_slug}-v[0-9]+$`);

  if (!sourcesVariantPattern.test(manifest.sources_variant)) {
    throw new Error(`sources_variant must match ${manifest.topic_slug}-vN`);
  }

  if (!promptVariantPattern.test(manifest.prompt_variant)) {
    throw new Error(`prompt_variant must match ${manifest.topic_slug}-vN`);
  }
}
