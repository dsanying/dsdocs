import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { openContent, dataDirectory } from '../packages/content/store.mjs';
import { initializeStarter } from '../apps/manage/server/starter.mjs';
const directory = dataDirectory();
const store = openContent(directory);
try {
  await mkdir(path.join(directory, 'assets'), { recursive: true, mode: 0o700 });
  console.log(JSON.stringify(await initializeStarter(store, directory)));
} finally {
  store.close();
}
