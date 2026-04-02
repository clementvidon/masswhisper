type FrontendMode = 'static' | 'dedicated';

function readFrontendMode(raw: string | undefined): FrontendMode {
  if (raw === 'static') {
    return 'static';
  }
  if (raw === 'dedicated') {
    return 'dedicated';
  }
  if (raw === 'test') {
    return 'static';
  }
  throw new Error(
    'Unsupported frontend mode. Expected "static" or "dedicated"',
  );
}

function readRequiredEnv(name: string, value: string | undefined): string {
  if (!value) {
    throw new Error(`${name} is required in dedicated mode`);
  }

  return value;
}

function readTopicName(value: string | undefined): string {
  return value?.trim() || 'MassWhisper';
}

const mode = readFrontendMode(import.meta.env.MODE);
const assetBasePath = import.meta.env.BASE_URL;

export const runtimeConfig =
  mode === 'dedicated'
    ? {
        mode,
        assetBasePath,
        apiBaseUrl: readRequiredEnv(
          'VITE_API_BASE_URL',
          import.meta.env.VITE_API_BASE_URL,
        ),
        topicName: readTopicName(import.meta.env.VITE_TOPIC_NAME),
      }
    : {
        mode,
        assetBasePath,
        apiBaseUrl: '',
        topicName: readTopicName(import.meta.env.VITE_TOPIC_NAME),
      };

export function buildDailyResourceUrl(): string {
  if (runtimeConfig.mode === 'dedicated') {
    return `${runtimeConfig.apiBaseUrl}/daily`;
  }
  return `${runtimeConfig.assetBasePath}daily.json`;
}
