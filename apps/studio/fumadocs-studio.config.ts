import { defineConfig } from '@fumadocs-editor/studio';

export default defineConfig({
  root: '../reader/content/docs',
  host: '127.0.0.1',
  port: 5180,
  open: false,
  syntax: { math: true },
  theme: 'system',
  server: './studio.server.ts',
});
