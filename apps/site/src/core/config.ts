import path from 'node:path';
const rawBasePath =
  process.env.NEXT_PUBLIC_DSDOCS_BASE_PATH ?? process.env.DSDOCS_BASE_PATH ?? '/docs';
export const basePath = rawBasePath === '/' ? '' : rawBasePath;
export const config = {
  title: process.env.DSDOCS_TITLE ?? 'dsdocs',
  database: process.env.DSDOCS_DATABASE ?? path.resolve('data/dsdocs.sqlite'),
  origin: process.env.DSDOCS_ORIGIN ?? 'http://localhost:3200',
  locales: ['zh', 'en'] as const,
  defaultLocale: 'zh',
  versions: ['latest'] as const,
  sessionSeconds: 8 * 60 * 60,
  maxSourceBytes: 256 * 1024,
  maxUploadBytes: 5 * 1024 * 1024,
};
export type Locale = (typeof config.locales)[number];
