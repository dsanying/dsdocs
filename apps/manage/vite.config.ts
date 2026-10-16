import { defineConfig } from 'vite';
import { editorSync } from '@fumadocs-editor/core/vite';
import { identityMiddleware } from './server/identity.mjs';

export default defineConfig({
  plugins: [
    editorSync({
      root: process.env.DSDOCS_CONTENT_ROOT ?? '../reader/content/docs',
      upload: { maxBytes: 5 * 1024 * 1024, types: /^image\/(png|jpeg|webp)$/ },
    }),
    {
      name: 'dsdocs-identity-adapter',
      configureServer(server) {
        server.middlewares.use(identityMiddleware());
      },
    },
  ],
  server: { strictPort: true, fs: { deny: ['**/.env', '**/.env.*', '**/server/**'] } },
});
