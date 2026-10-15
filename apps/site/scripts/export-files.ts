import { mkdir, writeFile, rename, rm, access } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { getStore } from '../src/core/store';
import { exportFiles } from '../src/core/file-export';
const argument = process.argv.indexOf('--output');
if (argument < 0 || !process.argv[argument + 1])
  throw new Error('Provide --output <new directory>; existing directories are never overwritten');
const destination = path.resolve(process.argv[argument + 1]),
  temporary = `${destination}.tmp-${randomUUID()}`;
try {
  await access(destination);
  throw new Error('Output directory already exists');
} catch (error) {
  if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT')) throw error;
}
const store = getStore();
try {
  const account = store.one('SELECT id,username FROM users WHERE disabled=0 ORDER BY id LIMIT 1');
  if (!account) throw new Error('No enabled manager');
  const files = exportFiles(store, {
    id: String(account.id),
    username: String(account.username),
    role: 'admin',
  });
  await mkdir(temporary, { recursive: true });
  for (const [name, bytes] of Object.entries(files)) {
    const target = path.join(temporary, name);
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, bytes);
  }
  await rename(temporary, destination);
  console.log(`Exported published files to ${destination}`);
} finally {
  store.close();
  await rm(temporary, { recursive: true, force: true });
}
