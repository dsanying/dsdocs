import { readdir } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
async function discover(dir) {
  const files = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const name = `${dir}/${entry.name}`;
    if (entry.isDirectory()) files.push(...(await discover(name)));
    else if (entry.name.endsWith('.unit.test.mjs')) files.push(name);
  }
  return files;
}
const result = spawnSync(process.execPath, ['--test', ...(await discover('apps/manage/src'))], {
  stdio: 'inherit',
});
process.exit(result.status ?? 1);
