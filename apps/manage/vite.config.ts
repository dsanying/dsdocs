import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
export default defineConfig({
  build: {
    rolldownOptions: {
      onLog(level, log, handler) {
        if (log.code === 'MODULE_LEVEL_DIRECTIVE' && log.id?.includes('/node_modules/')) return;
        handler(level, log);
      },
    },
  },
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  server: {
    strictPort: true,
    fs: { deny: ['**/.env', '**/.env.*', '**/server/**', '**/*.sqlite*', '**/*.key'] },
  },
});
