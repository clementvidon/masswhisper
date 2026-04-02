import react from '@vitejs/plugin-react';
import { defineConfig, loadEnv, type ConfigEnv } from 'vite';

type FrontendMode = 'static' | 'dedicated';

function readFrontendMode(raw: string | undefined): FrontendMode {
  if (raw === 'static' || raw === 'dedicated') {
    return raw;
  }
  throw new Error('Vite mode must be "static" or "dedicated"');
}

export default defineConfig((configEnv: ConfigEnv) => {
  const env = loadEnv(configEnv.mode, process.cwd(), '');
  const frontendMode = readFrontendMode(configEnv.mode);

  let assetBasePath = env.VITE_ASSET_BASE_PATH;
  if (!assetBasePath) {
    if (frontendMode === 'static') {
      assetBasePath = '/masswhisper/';
    } else if (frontendMode === 'dedicated') {
      assetBasePath = '/';
    }
  }

  return {
    base: assetBasePath,
    plugins: [react()],
    build: {
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (id.includes('node_modules')) {
              return 'vendor';
            }
          },
        },
      },
    },
  };
});
