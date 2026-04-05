import { z } from 'zod';

export const GlobalEnvSchema = z.object({
  APP_NAME: z.string().optional().default('app'),
  APP_VERSION: z.string().optional().default('0.0.0'),
  NODE_ENV: z
    .enum(['development', 'production', 'test'])
    .default('development'),
});

export const DatabaseEnvSchema = z.object({
  DATABASE_URL: z.string().min(1, 'DATABASE_URL missing'),
});

export const HttpServerEnvSchema = z.object({
  BIND_HOST: z.string().min(1).default('127.0.0.1'),
  PORT: z.coerce.number().int().positive().default(3000),
});

export const LlmEnvSchema = z.object({
  LLM_PROVIDER: z.enum(['openai', 'local']).default('openai'),
  OPENAI_API_KEY: z.string().optional(),
});

export const RedditEnvSchema = z.object({
  REDDIT_CLIENT_ID: z.string().optional(),
  REDDIT_CLIENT_SECRET: z.string().optional(),
  REDDIT_USERNAME: z.string().optional(),
  REDDIT_PASSWORD: z.string().optional(),
});

export const TopicEnvSchema = z.object({
  TOPIC_SLUG: z.string().min(1),
  TOPIC_PROMPT_VARIANT: z.string().min(1),
  TOPIC_PROMPT_BUNDLE_PATH: z.string().min(1),
  TOPIC_SOURCES_VARIANT: z.string().min(1),
  TOPIC_SOURCES_BUNDLE_PATH: z.string().min(1),
});

const LOG_LEVEL_VALUES = ['debug', 'info', 'warn', 'error', 'silent'] as const;
const LogLevelEnum = z.enum(LOG_LEVEL_VALUES);

const LogLevelInputSchema = z
  .string()
  .optional()
  .transform((value) => {
    if (!value) return undefined;
    const normalized = value
      .trim()
      .toLowerCase() as (typeof LOG_LEVEL_VALUES)[number];
    return LOG_LEVEL_VALUES.includes(normalized) ? normalized : undefined;
  })
  .pipe(LogLevelEnum.optional());

const LogPrettyInputSchema = z
  .string()
  .optional()
  .transform((value) => {
    if (!value) return undefined;
    const normalized = value.trim().toLowerCase();
    if (normalized === 'true' || normalized === '1' || normalized === 'yes')
      return true;
    if (normalized === 'false' || normalized === '0' || normalized === 'no')
      return false;
    return undefined;
  })
  .pipe(z.boolean().optional());

export const LoggingEnvSchema = z.object({
  LOG_LEVEL: LogLevelInputSchema,
  LOG_PRETTY: LogPrettyInputSchema,
});

export const ReadApiEnvSchema = z.object({
  READ_API_DAILY_BUNDLE_PATH: z.string().min(1).optional(),
});
