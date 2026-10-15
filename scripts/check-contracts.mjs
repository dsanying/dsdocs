import assert from 'node:assert/strict';
import { readFile, access, readdir } from 'node:fs/promises';
import path from 'node:path';
import { componentRegistry as serviceRegistry } from '../apps/site/src/content/registry.ts';
import { componentRegistry as readerRegistry } from '../apps/reader/src/content/registry.ts';
const root = path.resolve(import.meta.dirname, '..');
assert.deepEqual(readerRegistry, serviceRegistry, 'Reader and CMS component contracts differ');
for (const file of ['components.tsx', 'ui-translations.ts'])
  assert.equal(
    await readFile(path.join(root, 'apps/site/src/content', file), 'utf8'),
    await readFile(path.join(root, 'apps/reader/src/content', file), 'utf8'),
    `Native renderer drift: ${file}`
  );
const site = JSON.parse(await readFile(path.join(root, 'apps/site/package.json'), 'utf8')),
  reader = JSON.parse(await readFile(path.join(root, 'apps/reader/package.json'), 'utf8'));
for (const name of ['fumadocs-core', 'fumadocs-ui'])
  assert.equal(site.dependencies[name], reader.dependencies[name], `Version drift: ${name}`);
async function files(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  return (
    await Promise.all(
      entries.map((entry) =>
        entry.isDirectory()
          ? files(path.join(directory, entry.name))
          : [path.join(directory, entry.name)]
      )
    )
  ).flat();
}
for (const file of await files(path.join(root, 'apps/reader/src'))) {
  const text = await readFile(file, 'utf8');
  assert.ok(
    !/node:sqlite|@\/core\/store|apps\/site|\.\.\/.*site\//.test(text),
    `Reader backend dependency: ${file}`
  );
}
for (const file of [
  'README.md',
  'ARCHITECTURE.md',
  'CONTRIBUTING.md',
  'SECURITY.md',
  'CHANGELOG.md',
  'AGENTS.md',
  ...(await files(path.join(root, 'docs'))).filter((file) => file.endsWith('.md')),
]) {
  const absolute = path.resolve(root, file),
    text = await readFile(absolute, 'utf8');
  for (const match of text.matchAll(/\]\(([^)]+)\)/g)) {
    let target = match[1].split('#')[0];
    if (!target || /^[a-z]+:/i.test(target)) continue;
    target = decodeURIComponent(target.replace(/^<|>$/g, ''));
    await access(path.resolve(path.dirname(absolute), target));
  }
}
console.log(
  'PASS component contracts, native renderer parity, standalone dependency boundary and documentation links'
);
