import { mkdtemp, mkdir, symlink, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
const base = process.env.DSDOCS_BASE_PATH ?? '/docs';
if (!/^\/(?:[a-zA-Z0-9_-]+(?:\/[a-zA-Z0-9_-]+)*)?$/.test(base))
  throw new Error('Invalid DSDOCS_BASE_PATH');
const directory = await mkdtemp(path.join(tmpdir(), 'dsdocs-preview-'));
const output = path.resolve(import.meta.dirname, '../apps/reader/out');
const target = path.join(directory, base);
await mkdir(path.dirname(target), { recursive: true });
if (base !== '/') await symlink(output, target, 'dir');
const child = spawn(
  'pnpm',
  [
    '-C',
    'apps/studio',
    'exec',
    'serve',
    base === '/' ? output : directory,
    '--listen',
    'tcp://127.0.0.1:3200',
    '--no-clipboard',
  ],
  { stdio: 'inherit' }
);
for (const signal of ['SIGTERM', 'SIGINT']) process.once(signal, () => child.kill(signal));
child.once('exit', async (code) => {
  await rm(directory, { recursive: true, force: true });
  process.exitCode = code ?? 0;
});
