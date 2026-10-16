import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, readdir, rm, symlink } from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { syncAssets } from '../sync-assets.mjs';

test('asset copy replaces old published files and rejects symlinks before changing output', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'dsdocs-assets-'));
  const source = path.join(root, 'source'),
    target = path.join(root, 'target');
  try {
    await mkdir(source);
    await mkdir(target);
    await writeFile(path.join(source, 'image.png'), 'new');
    await writeFile(path.join(target, 'deleted.png'), 'old');
    await syncAssets(source, target);
    assert.deepEqual(await readdir(target), ['image.png']);
    assert.equal(await readFile(path.join(target, 'image.png'), 'utf8'), 'new');
    await symlink(path.join(target, 'image.png'), path.join(source, 'escape'));
    await assert.rejects(syncAssets(source, target), /symlink/);
    assert.equal(await readFile(path.join(target, 'image.png'), 'utf8'), 'new');
    await symlink(source, path.join(root, 'linked-root'));
    await assert.rejects(syncAssets(path.join(root, 'linked-root'), target), /symlink/);
    await syncAssets(path.join(root, 'missing'), target);
    assert.deepEqual(await readdir(target), []);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
