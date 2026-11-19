import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// base './' so the built site works from any folder or link
export default defineConfig({
  plugins: [react()],
  base: './',
  build: { assetsInlineLimit: 0, chunkSizeWarningLimit: 1200 }
});
