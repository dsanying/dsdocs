import { mkdir, writeFile, lstat, realpath } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { openContent } from '../packages/content/store.mjs';
export async function exportBackup(target) {
  const repo = await realpath(target),
    project = await realpath(fileURLToPath(new URL('../', import.meta.url)));
  if (repo === project || repo.startsWith(project + path.sep))
    throw new Error('备份仓库必须位于项目目录之外。');
  const git = spawnSync('git', ['-C', repo, 'rev-parse', '--show-toplevel'], { encoding: 'utf8' });
  if (git.status !== 0 || git.stdout.trim() !== repo)
    throw new Error('请指定已有 Git 仓库根目录。');
  const folder = path.join(repo, 'dsdocs-backup');
  try {
    if (!(await lstat(folder)).isDirectory() || (await lstat(folder)).isSymbolicLink())
      throw new Error('备份目录不能为符号链接。');
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    await mkdir(folder, { mode: 0o700 });
  }
  const store = openContent(undefined, true);
  try {
    // A single read transaction captures drafts, snapshots, folders and asset metadata together.
    store.db.exec('BEGIN');
    const snapshot = {
      format: 1,
      documents: store.list(),
      folders: store.folders(),
      assets: store.db.prepare('SELECT id,name,mime,size,createdAt FROM assets ORDER BY id').all(),
    };
    store.db.exec('COMMIT');
    const filename = path.join(folder, 'content.json');
    try {
      if ((await lstat(filename)).isSymbolicLink()) throw new Error('备份文件不能为符号链接。');
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
    await writeFile(filename, JSON.stringify(snapshot, null, 2) + '\n', { mode: 0o600 });
    return repo;
  } finally {
    store.close();
  }
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  if (!process.env.DSDOCS_GIT_BACKUP_DIR)
    throw new Error('请配置 DSDOCS_GIT_BACKUP_DIR，指向已有的独立 Git 仓库。');
  const repo = await exportBackup(process.env.DSDOCS_GIT_BACKUP_DIR);
  const run = (args) => {
    const result = spawnSync('git', ['-C', repo, ...args], { stdio: 'inherit' });
    if (result.status !== 0) throw new Error('Git 备份失败，请检查仓库状态与签名配置。');
  };
  run(['add', '--', 'dsdocs-backup/content.json']);
  const diff = spawnSync('git', [
    '-C',
    repo,
    'diff',
    '--cached',
    '--quiet',
    '--',
    'dsdocs-backup/content.json',
  ]);
  if (diff.status === 1)
    run([
      'commit',
      '-S',
      '--only',
      '-m',
      'docs(backup): 同步 DSdocs 文档',
      '--',
      'dsdocs-backup/content.json',
    ]);
  else if (diff.status !== 0) throw new Error('Git 状态读取失败。');
  if (process.env.DSDOCS_GIT_PUSH === '1') run(['push']);
  console.log('内容备份已写入独立 Git 仓库；附件二进制和账号数据需单独备份。');
}
