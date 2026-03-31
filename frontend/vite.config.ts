import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// https://vite.dev/config/
export default defineConfig({
  base: '/masswhisper/',
  plugins: [react()],
  server: {
    proxy: {
      '/report': 'http://localhost:3000',
      '/headlines': 'http://localhost:3000',
      '/sentiment-history': 'http://localhost:3000',
    },
  },
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
});
