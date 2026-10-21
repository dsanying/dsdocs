import { copyFile } from 'node:fs/promises';
await copyFile(
  new URL('src/style.css', import.meta.url),
  new URL('dist/style.css', import.meta.url)
);
await copyFile(
  new URL('src/style.d.ts', import.meta.url),
  new URL('dist/style.d.ts', import.meta.url)
);
