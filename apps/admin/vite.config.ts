import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
const prefix = (process.env.DSDOCS_BASE_PATH ?? '/docs').replace(/\/$/, '');
if (prefix && !/^\/(?:[a-zA-Z0-9_-]+(?:\/[a-zA-Z0-9_-]+)*)$/.test(prefix))
  throw new Error('Invalid DSDOCS_BASE_PATH');
export default defineConfig({
  base: `${prefix}/admin/`,
  plugins: [react()],
  server: {
    port: 5174,
    strictPort: true,
    proxy: {
      [`${prefix}/api/`]: { target: 'http://localhost:3200', changeOrigin: true },
      [`${prefix}/preview/`]: { target: 'http://localhost:3200', changeOrigin: true },
    },
  },
});
