import { readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
const { gates } = JSON.parse(await readFile('quality/manifest.json', 'utf8'));
const ids = new Set();
for (const gate of gates) {
  if (ids.has(gate.id)) throw new Error('重复门禁');
  ids.add(gate.id);
  await readFile(gate.rule);
  const start = Date.now();
  console.log(`[gate:${gate.id}] START`);
  const result = spawnSync(gate.command[0], gate.command.slice(1), { stdio: 'inherit' });
  if (result.status !== 0) {
    console.error(`[gate:${gate.id}] FAIL`);
    process.exit(result.status ?? 1);
  }
  console.log(`[gate:${gate.id}] PASS ${Date.now() - start}ms`);
}
