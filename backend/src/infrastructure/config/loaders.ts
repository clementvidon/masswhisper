import type { z } from 'zod';

import type { LogLevel } from '../../application/ports/output/LoggerPort';
import { ConfigError } from './errors';
import { loadPromptBundle, type PromptBundle } from './loadPromptBundle';
import {
  loadSourceBundle as loadSourceBundle,
  type SourceBundle as SourceBundle,
} from './loadSourceBundle';
import {
  DatabaseEnvSchema,
  GlobalEnvSchema,
  HttpServerEnvSchema,
  LlmEnvSchema,
  LoggingEnvSchema,
  ReadApiEnvSchema,
  RedditEnvSchema,
  TopicEnvSchema,
} from './schemas';

/* ---------- helpers ---------- */

type Env = typeof process.env;

function prettyErrors(issues: z.ZodIssue[]) {
  return issues
    .map((i) => `${i.path.length ? i.path.join('.') : '(root)'}: ${i.message}`)
    .join('; ');
}

export function parseEnv<Output, Input = Output>(
  schema: z.ZodType<Output, z.ZodTypeDef, Input>,
  env: Env = process.env,
): Output {
  const parsed = schema.safeParse(env);
  if (parsed.success) return parsed.data;
  throw new ConfigError(`Invalid env: ${prettyErrors(parsed.error.issues)}`);
}

/* ---------- global ---------- */

export type NodeEnv = z.infer<typeof GlobalEnvSchema>['NODE_ENV'];

export type GlobalConfig = {
  appName: string;
  appVersion: string;
  nodeEnv: NodeEnv;
};

export function loadGlobalConfig(env: Env = process.env): GlobalConfig {
  const globalEnv = parseEnv(GlobalEnvSchema, env);
  const nodeEnv = globalEnv.NODE_ENV;
  return {
    appName: globalEnv.APP_NAME,
    appVersion: globalEnv.APP_VERSION,
    nodeEnv,
  };
}

/* ---------- logging ---------- */

export type LoggingConfig = {
  level: LogLevel;
  pretty: boolean;
};

export function loadLoggingConfig(env: Env = process.env): LoggingConfig {
  const logging = parseEnv(LoggingEnvSchema, env);
  const { nodeEnv } = loadGlobalConfig(env);
  const pretty = logging.LOG_PRETTY ?? nodeEnv !== 'production';
  const level = (logging.LOG_LEVEL ?? (pretty ? 'debug' : 'info')) as LogLevel;
  return { level, pretty };
}

/* ---------- database ---------- */

export type DatabaseConfig = {
  databaseUrl: string;
};

export function loadDatabaseConfig(env: Env = process.env): DatabaseConfig {
  const db = parseEnv(DatabaseEnvSchema, env);
  return {
    databaseUrl: db.DATABASE_URL,
  };
}

/* ---------- http server ---------- */

export type HttpServerConfig = {
  bindHost: string;
  port: number;
  dailyBundlePath: string;
};

export function loadHttpServerConfig(env: Env = process.env): HttpServerConfig {
  const http = parseEnv(HttpServerEnvSchema, env);
  const readApi = loadReadApiConfig(env);
  return {
    bindHost: http.BIND_HOST,
    port: http.PORT,
    dailyBundlePath: readApi.dailyBundlePath,
  };
}

/* ---------- replay ---------- */

export type ReplayConfig = {
  databaseUrl: string;
  openaiApiKey: string;
};

export function loadReplayConfig(env: Env = process.env): ReplayConfig {
  const db = parseEnv(DatabaseEnvSchema, env);
  const llm = parseEnv(LlmEnvSchema, env);

  if (llm.LLM_PROVIDER !== 'openai')
    throw new ConfigError('Replay requires LLM_PROVIDER=openai');
  if (!llm.OPENAI_API_KEY)
    throw new ConfigError('Replay requires OPENAI_API_KEY');

  return {
    databaseUrl: db.DATABASE_URL,
    openaiApiKey: llm.OPENAI_API_KEY,
  };
}

/* ---------- read api ---------- */

export type ReadApiConfig = {
  dailyBundlePath: string;
};

export function loadReadApiConfig(env: Env = process.env): ReadApiConfig {
  const readApi = parseEnv(ReadApiEnvSchema, env);
  return {
    dailyBundlePath: readApi.READ_API_DAILY_BUNDLE_PATH,
  };
}

/* ---------- reporting agent ---------- */

export type RedditConfig = {
  clientId: string;
  clientSecret: string;
  username: string;
  password: string;
};

export type TopicConfig = {
  slug: string;
  sourcesVariant: string;
  promptVariant: string;
  sourceBundlePath: string;
  promptBundlePath: string;
  sourceBundle: SourceBundle;
  promptBundle: PromptBundle;
};

export type LlmProvider = z.infer<typeof LlmEnvSchema>['LLM_PROVIDER'];

export type ReportingAgentConfig = {
  databaseUrl: string;
  openaiApiKey: string;
  topic: TopicConfig;
  reddit: RedditConfig;
  llmProvider: LlmProvider;
};

export function loadReportingAgentConfig(
  env: Env = process.env,
): ReportingAgentConfig {
  const db = parseEnv(DatabaseEnvSchema, env);
  const llm = parseEnv(LlmEnvSchema, env);
  const topic = parseEnv(TopicEnvSchema, env);
  const reddit = parseEnv(RedditEnvSchema, env);

  if (llm.LLM_PROVIDER !== 'openai') {
    throw new ConfigError('Reporting agent MVP requires LLM_PROVIDER=openai');
  }
  if (!llm.OPENAI_API_KEY) {
    throw new ConfigError(
      'OPENAI_API_KEY is required for this reporting agent configuration',
    );
  }

  if (
    !reddit.REDDIT_CLIENT_ID ||
    !reddit.REDDIT_CLIENT_SECRET ||
    !reddit.REDDIT_USERNAME ||
    !reddit.REDDIT_PASSWORD
  ) {
    throw new ConfigError(
      'All Reddit credentials are required for this reporting agent configuration',
    );
  }

  const sourceBundle = loadSourceBundle(
    topic.TOPIC_SOURCES_BUNDLE_PATH,
    topic.TOPIC_SOURCES_VARIANT,
  );

  const promptBundle = loadPromptBundle(
    topic.TOPIC_PROMPT_BUNDLE_PATH,
    topic.TOPIC_PROMPT_VARIANT,
  );

  if (sourceBundle.sources.length !== 1) {
    throw new ConfigError(
      'Reporting agent MVP requires exactly one topic source',
    );
  }

  return {
    databaseUrl: db.DATABASE_URL,
    openaiApiKey: llm.OPENAI_API_KEY,
    topic: {
      slug: topic.TOPIC_SLUG,
      promptVariant: topic.TOPIC_PROMPT_VARIANT,
      promptBundlePath: topic.TOPIC_PROMPT_BUNDLE_PATH,
      sourcesVariant: topic.TOPIC_SOURCES_VARIANT,
      sourceBundlePath: topic.TOPIC_SOURCES_BUNDLE_PATH,
      sourceBundle: sourceBundle,
      promptBundle,
    },
    reddit: {
      clientId: reddit.REDDIT_CLIENT_ID,
      clientSecret: reddit.REDDIT_CLIENT_SECRET,
      username: reddit.REDDIT_USERNAME,
      password: reddit.REDDIT_PASSWORD,
    },
    llmProvider: llm.LLM_PROVIDER,
  };
}
