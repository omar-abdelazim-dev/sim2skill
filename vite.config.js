import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { createPlatformHandler } from './server/platform.mjs';
const platform = {name:'sim2skill-platform', async configureServer(server){server.middlewares.use(await createPlatformHandler());}, async configurePreviewServer(server){server.middlewares.use(await createPlatformHandler());}};

// base './' so the built site works from any folder or link
export default defineConfig({
  plugins: [react(), platform],
  base: './',
  build: { assetsInlineLimit: 0, chunkSizeWarningLimit: 1200 }
});
