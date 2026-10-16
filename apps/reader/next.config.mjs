import { fileURLToPath } from 'node:url';
// Load the shared local configuration without forwarding CLI flags to Next workers.
try {
  process.loadEnvFile(fileURLToPath(new URL('../../.env', import.meta.url)));
} catch (error) {
  if (error.code !== 'ENOENT') throw error;
}
const basePath = process.env.DSDOCS_BASE_PATH ?? '/docs';
if (basePath !== '' && !/^\/(?:[a-zA-Z0-9_-]+(?:\/[a-zA-Z0-9_-]+)*)?$/.test(basePath))
  throw new Error('Invalid DSDOCS_BASE_PATH');
export default {
  output: 'standalone',
  turbopack: { root: fileURLToPath(new URL('../../', import.meta.url)) },
  outputFileTracingRoot: fileURLToPath(new URL('../../', import.meta.url)),
  basePath: basePath === '/' ? '' : basePath,
  poweredByHeader: false,
  images: { unoptimized: true },
  env: { NEXT_PUBLIC_DSDOCS_BASE_PATH: basePath === '/' ? '' : basePath },
};
