import fs from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
import type { TopicManifest } from './topic-manifest.js';

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

export function validateLocalTopicBundles(
  manifest: TopicManifest,
  topicConfigDir: string,
): void {
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
      `Prompt bundle variant mismatch: expected ${manifest.prompt_variant}, got
${promptBundle.variant}`,
    );
  }

  const sourceBundle = SourceBundleSchema.parse(
    JSON.parse(fs.readFileSync(sourcesPath, 'utf8')),
  );
  if (sourceBundle.variant !== manifest.sources_variant) {
    throw new Error(
      `Sources bundle variant mismatch: expected ${manifest.sources_variant}, got
${sourceBundle.variant}`,
    );
  }
}
