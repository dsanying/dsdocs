import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { openContent } from '../../packages/content/store.mjs';
import { exportBackup } from '../backup-git.mjs';
test('Git 内容导出与身份数据分离，并拒绝目录符号链接', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'dsdocs-backup-')),
    repo = path.join(root, 'repository'),
    directory = path.join(root, 'data');
  const previous = process.env.DSDOCS_DATA_DIR;
  process.env.DSDOCS_DATA_DIR = directory;
  try {
    assert.equal(spawnSync('git', ['init', repo], { stdio: 'ignore' }).status, 0);
    const store = openContent(directory);
    store.create({ title: '备份文档', slug: 'backup', locale: 'zh' });
    store.close();
    await exportBackup(repo);
    const snapshot = JSON.parse(
      await readFile(path.join(repo, 'dsdocs-backup/content.json'), 'utf8')
    );
    assert.equal(snapshot.documents[0].title, '备份文档');
    assert.deepEqual(Object.keys(snapshot).sort(), ['assets', 'documents', 'folders', 'format', 'settings']);
    await rm(path.join(repo, 'dsdocs-backup'), { recursive: true });
    await symlink(directory, path.join(repo, 'dsdocs-backup'));
    await assert.rejects(() => exportBackup(repo), /符号链接/);
  } finally {
    if (previous === undefined) delete process.env.DSDOCS_DATA_DIR;
    else process.env.DSDOCS_DATA_DIR = previous;
    await rm(root, { recursive: true, force: true });
  }
});
