import fs from 'node:fs';

import { z } from 'zod';

import { ConfigError } from './errors';

const PromptBundleSchema = z.object({
  variant: z.string().min(1),
  relevancePrompt: z.string().min(1),
  emotionPrompt: z.string().min(1),
  tonalityPrompt: z.string().min(1),
  reportPrompt: z.string().min(1),
});

export type PromptBundle = z.infer<typeof PromptBundleSchema>;

export function loadPromptBundle(path: string, expectedVariant: string) {
  let raw: string;
  try {
    raw = fs.readFileSync(path, 'utf8');
  } catch {
    throw new ConfigError(`Unable to read prompt bundle: ${path}`);
  }

  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(raw);
  } catch {
    throw new ConfigError(`Prompt bundle must be valid JSON: ${path}`);
  }

  const parsed = PromptBundleSchema.safeParse(parsedJson);
  if (!parsed.success) {
    throw new ConfigError('Prompt bundle has invalid shape');
  }

  if (parsed.data.variant !== expectedVariant) {
    throw new ConfigError(
      `Prompt bundle variant mismatch: expected ${expectedVariant}, got ${parsed.data.variant}`,
    );
  }

  return parsed.data;
}
