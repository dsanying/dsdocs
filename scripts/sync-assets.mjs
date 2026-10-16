import { cp, mkdir, readdir, rm, lstat } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

// Studio and the reader share MDX files. Only the asset copy is generated.
export async function syncAssets(source, target) {
  async function inspect(directory) {
    for (const name of await readdir(directory)) {
      const file = path.join(directory, name);
      const info = await lstat(file);
      if (info.isSymbolicLink()) throw new Error(`Asset symlinks are not supported: ${file}`);
      if (info.isDirectory()) await inspect(file);
      else if (!info.isFile()) throw new Error(`Unsupported asset: ${file}`);
    }
  }
  let rootInfo;
  try {
    rootInfo = await lstat(source);
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  if (rootInfo?.isSymbolicLink()) throw new Error(`Asset symlinks are not supported: ${source}`);
  if (rootInfo && !rootInfo.isDirectory())
    throw new Error(`Asset root must be a directory: ${source}`);
  if (rootInfo) await inspect(source);
  await rm(target, { recursive: true, force: true });
  await mkdir(target, { recursive: true });
  if (rootInfo) await cp(source, target, { recursive: true });
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const root = path.resolve(import.meta.dirname, '..');
  await syncAssets(
    path.join(root, 'apps/reader/content/docs/assets'),
    path.join(root, 'apps/reader/public/assets')
  );
}
