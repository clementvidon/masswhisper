import fs from 'node:fs';

import { z } from 'zod';

import { ConfigError } from './errors';

const SourceSchema = z.object({
  kind: z.literal('reddit'),
  url: z.string().url(),
});

export const SourcesBundleSchema = z.object({
  variant: z.string().min(1),
  sources: z.array(SourceSchema).min(1),
});

export type SourcesBundle = z.infer<typeof SourcesBundleSchema>;

export function loadSourcesBundle(
  path: string,
  expectedVariant: string,
): SourcesBundle {
  let raw: string;
  try {
    raw = fs.readFileSync(path, 'utf8');
  } catch {
    throw new ConfigError(`Unable to read topic sources bundle: ${path}`);
  }

  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(raw);
  } catch {
    throw new ConfigError(`Topic sources bundle must be valid JSON: ${path}`);
  }

  const parsed = SourcesBundleSchema.safeParse(parsedJson);
  if (!parsed.success) {
    throw new ConfigError(`Topic sources bundle has invalid shape: ${path}`);
  }

  if (parsed.data.variant !== expectedVariant) {
    throw new ConfigError(
      `Topic sources bundle variant mismatch: expected ${expectedVariant}, got ${parsed.data.variant}`,
    );
  }

  return parsed.data;
}
