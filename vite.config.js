import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// base './' so the built site works from any folder or link
export default defineConfig({
  plugins: [react()],
  base: './',
  // npm run dev talks to Nour's backend (server/nour_server.py) on port 8000
  server: { proxy: { '/api': 'http://localhost:8000' } },
  build: { assetsInlineLimit: 0, chunkSizeWarningLimit: 1200 }
});
