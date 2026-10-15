import { createMDX } from 'fumadocs-mdx/next';
const basePath = process.env.DSDOCS_BASE_PATH ?? '/docs';
if (basePath !== '' && !/^\/(?:[a-zA-Z0-9_-]+(?:\/[a-zA-Z0-9_-]+)*)?$/.test(basePath))
  throw new Error('Invalid DSDOCS_BASE_PATH');
export default createMDX()({
  output: 'export',
  trailingSlash: true,
  basePath: basePath === '/' ? '' : basePath,
  poweredByHeader: false,
  images: { unoptimized: true },
  env: { NEXT_PUBLIC_DSDOCS_BASE_PATH: basePath === '/' ? '' : basePath },
});
