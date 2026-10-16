import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, rm, readdir, symlink, rename } from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { startManagement } from '../server/start.mjs';
import { openContent } from '../../../packages/content/store.mjs';
import {
  validateSettings,
  defaultSettings,
  readerStyle,
} from '../../../packages/content/settings.mjs';
test('站点设置验证与安全 CSS', () => {
  assert.equal(validateSettings({}).siteName, 'DSdocs');
  for (const value of [
    { baseFontSize: 13 },
    { lineHeight: Infinity },
    { accentColor: 'red;display:none' },
    { siteName: '\n' },
    { footerLinks: [{ label: 'x', url: 'javascript:alert(1)' }] },
    { unknown: true },
    { theme: 'invalid' },
  ])
    assert.throws(() => validateSettings(value));
  assert.match(readerStyle({ ...defaultSettings, baseFontSize: 18 }), /font-size:18px/);
});
test('文件与面板双向编辑、发布及冲突保护', async (t) => {
  const dir = await mkdtemp(path.join(tmpdir(), 'dsdocs-files-'));
  const origin = 'http://127.0.0.1:15383';
  const app = await startManagement({
    ...process.env,
    DSDOCS_PORT: '15383',
    DSDOCS_URL: origin,
    DSDOCS_DATA_DIR: dir,
    DSDOCS_AUTH: 'none',
    DSDOCS_STARTER: 'none',
  });
  t.after(async () => {
    await app.close();
    await rm(dir, { recursive: true, force: true });
  });
  const workspace = path.join(dir, 'workspace');
  const call = async (url = '', method = 'GET', data) => {
    const res = await fetch(origin + '/__dsdocs_content' + url, {
      method,
      headers: { origin, 'content-type': 'application/json' },
      body: data === undefined ? undefined : JSON.stringify(data),
    });
    return { status: res.status, data: await res.json() };
  };
  const getDoc = async (id) => (await call()).data.documents.find((item) => item.id === id);
  const filename = (id) => path.join(workspace, 'documents', `${id}.md`);
  let doc, folder;
  await t.test('设置写回 JSON，文件修改即时进入设置并拒绝旧版本', async () => {
    const first = (await call('/settings')).data;
    const saved = await call('/settings', 'PATCH', {
      version: first.version,
      data: { ...first.data, siteName: '测试文档', baseFontSize: 18 },
    });
    assert.equal(saved.status, 200);
    assert.equal(
      JSON.parse(await readFile(path.join(workspace, 'site.json'), 'utf8')).siteName,
      '测试文档'
    );
    await writeFile(
      path.join(workspace, 'site.json'),
      JSON.stringify({ ...saved.data.data, siteName: '文件修改' })
    );
    const next = (await call('/settings')).data;
    assert.equal(next.data.siteName, '文件修改');
    assert.equal(
      (await call('/settings', 'PATCH', { version: saved.data.version, data: saved.data.data }))
        .status,
      409
    );
    await writeFile(path.join(workspace, 'site.json'), '{invalid');
    assert.equal((await call('/settings')).data.data.siteName, '文件修改');
    assert.equal(
      (await call('/settings', 'PATCH', { version: next.version, data: next.data })).status,
      409
    );
    const issue = (await call('/files')).data.issues[0];
    assert.equal(
      (
        await call('/files/resolve', 'POST', {
          ...Object.fromEntries(['key', 'fileHash', 'version'].map((key) => [key, issue[key]])),
          source: 'panel',
        })
      ).status,
      200
    );
  });
  await t.test('目录文件重命名和文档正文修改进入草稿，发布版保留', async () => {
    folder = (await call('/folders', 'POST', { title: '原目录', titleEn: 'Original' })).data;
    doc = (
      await call('/documents', 'POST', {
        title: '原文',
        slug: 'original',
        locale: 'zh',
        folder: folder.id,
      })
    ).data;
    doc = (
      await call(`/documents/${doc.id}`, 'PATCH', {
        ...doc,
        translationId: undefined,
        published: undefined,
        id: undefined,
        updatedAt: undefined,
        body: '已发布内容',
      })
    ).data;
    assert.ok(doc.id);
    await call(`/documents/${doc.id}/publish`, 'POST', { version: doc.version });
    const file = await readFile(filename(doc.id), 'utf8');
    await writeFile(
      filename(doc.id),
      file.replace('已发布内容', '外部文件草稿').replace('原文', '文件标题')
    );
    const folderFile = path.join(workspace, 'folders', `${folder.id}.json`);
    await writeFile(
      folderFile,
      JSON.stringify({ id: folder.id, title: '新目录', titleEn: 'Renamed', parent: null })
    );
    const next = await getDoc(doc.id);
    assert.equal(next.body, '外部文件草稿');
    assert.equal(next.title, '文件标题');
    assert.equal(JSON.parse(next.published).body, '已发布内容');
    assert.equal((await call()).data.folders[0].title, '新目录');
    assert.equal(
      (
        await call('/folders/' + folder.id, 'PATCH', {
          title: '旧窗口',
          titleEn: 'Old',
          version: folder.version,
        })
      ).status,
      409
    );
    assert.equal(
      (await call(`/documents/${doc.id}`, 'PATCH', { version: doc.version, body: '旧窗口草稿' }))
        .status,
      409
    );
    assert.equal(
      (await call(`/documents/${doc.id}/publish`, 'POST', { version: next.version })).status,
      200
    );
  });
  await t.test('面板正文写回 Markdown，文件改名保留身份，缺失文件自动恢复', async () => {
    doc = await getDoc(doc.id);
    doc = (
      await call(`/documents/${doc.id}`, 'PATCH', {
        version: doc.version,
        title: doc.title,
        slug: doc.slug,
        locale: doc.locale,
        folder: doc.folder,
        description: doc.description,
        body: '面板新草稿',
      })
    ).data;
    assert.match(await readFile(filename(doc.id), 'utf8'), /面板新草稿/);
    await rename(filename(doc.id), path.join(workspace, 'documents', 'renamed.md'));
    assert.equal((await call('/files')).data.issues.length, 0);
    assert.equal((await call()).data.documents.length, 1);
    await rm(path.join(workspace, 'documents', 'renamed.md'));
    await call();
    assert.match(
      await readFile(path.join(workspace, 'documents', 'renamed.md'), 'utf8'),
      /面板新草稿/
    );
  });
  await t.test('新建 Markdown 文件分配 ID，但不自动发布；非法正文可存草稿不能发布', async () => {
    const text =
      '---\n' +
      JSON.stringify({ title: '新文件', slug: 'new-file', locale: 'en' }) +
      '\n---\n<script>alert(1)</script>';
    await writeFile(path.join(workspace, 'documents', 'new.md'), text);
    const row = (await call()).data.documents.find((item) => item.slug === 'new-file');
    assert.ok(row);
    assert.equal(row.published, null);
    assert.match(
      await readFile(path.join(workspace, 'documents', 'new.md'), 'utf8'),
      new RegExp(row.id)
    );
    assert.equal(
      (await call(`/documents/${row.id}/publish`, 'POST', { version: row.version })).status,
      422
    );
  });
  await t.test('两边均有修改时保留双方、二次修改拒绝过期解决请求', async () => {
    const file = path.join(workspace, 'documents', 'renamed.md');
    const store = openContent(dir);
    doc = store.get(doc.id);
    store.save(doc.id, { ...doc, body: '数据库保留' });
    store.close();
    await writeFile(file, (await readFile(file, 'utf8')).replace('面板新草稿', '文件保留'));
    const issue = (await call('/files')).data.issues.find(
      (item) => item.key === `document:${doc.id}`
    );
    assert.ok(issue);
    const comparison = (await call('/files/compare', 'POST', { key: issue.key })).data;
    assert.match(comparison.panelText, /数据库保留/);
    assert.match(comparison.fileText, /文件保留/);
    await writeFile(file, comparison.fileText + '追加');
    assert.equal(
      (
        await call('/files/resolve', 'POST', {
          key: issue.key,
          source: 'file',
          fileHash: comparison.fileHash,
          version: comparison.version,
        })
      ).status,
      409
    );
    const next = (await call('/files/compare', 'POST', { key: issue.key })).data;
    assert.equal(
      (
        await call('/files/resolve', 'POST', {
          key: issue.key,
          source: 'file',
          fileHash: next.fileHash,
          version: next.version,
        })
      ).status,
      200
    );
    assert.equal((await getDoc(doc.id)).body, '文件保留追加');
    assert.ok((await readdir(path.join(workspace, '.history'))).length > 0);
  });
  await t.test('重复 ID、修改 ID、符号链接不导入也不覆盖文件', async () => {
    const file = path.join(workspace, 'documents', 'renamed.md');
    const text = await readFile(file, 'utf8');
    await writeFile(
      path.join(workspace, 'documents', 'duplicate.md'),
      text.replace('文件保留追加', '错误覆盖')
    );
    assert.ok((await call('/files')).data.issues.length);
    assert.equal((await getDoc(doc.id)).body, '文件保留追加');
    await rm(path.join(workspace, 'documents', 'duplicate.md'));
    await call();
    await writeFile(file, text.replace(doc.id, '00000000-0000-0000-0000-000000000000'));
    assert.ok((await call('/files')).data.issues.length);
    assert.equal((await getDoc(doc.id)).body, '文件保留追加');
    await writeFile(file, text);
    await call();
    await symlink(
      path.join(workspace, 'site.json'),
      path.join(workspace, 'documents', 'symlink.md')
    );
    assert.ok(
      (await call('/files')).data.issues.some((issue) => issue.path.endsWith('symlink.md'))
    );
    await rm(path.join(workspace, 'documents', 'symlink.md'));
  });
  await t.test('网站资源引用保护、运行信息不泄露密钥、只读库独立可用', async () => {
    const png = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
    const uploaded = await fetch(origin + '/__dsdocs_content/assets', {
      method: 'POST',
      headers: { origin, 'content-type': 'image/png', 'x-filename': 'logo.png' },
      body: png,
    });
    const asset = await uploaded.json();
    const snapshot = (await call('/settings')).data;
    assert.equal(
      (
        await call('/settings', 'PATCH', {
          version: snapshot.version,
          data: { ...snapshot.data, logoAssetId: asset.id },
        })
      ).status,
      200
    );
    assert.equal((await call('/assets/' + asset.id, 'DELETE', {})).status, 409);
    const runtime = (await call('/runtime')).data;
    assert.deepEqual(Object.keys(runtime).sort(), ['database', 'node', 'workspace']);
    const readonly = openContent(dir, true);
    assert.equal(readonly.settings().data.logoAssetId, asset.id);
    assert.ok(readonly.published().length);
    readonly.close();
  });
  await t.test('明确删除标记与面板删除保持一致，文件缺失不误删', async () => {
    const target = path.join(workspace, 'documents', 'renamed.md');
    const text = await readFile(target, 'utf8');
    const match = text.match(/^---\n([\s\S]*?)\n---\n/);
    await writeFile(
      target,
      '---\n' +
        JSON.stringify({ ...JSON.parse(match[1]), deleted: true }) +
        '\n---\n' +
        text.slice(match[0].length)
    );
    await call();
    assert.equal(await getDoc(doc.id), undefined);
    await assert.rejects(() => readFile(target), { code: 'ENOENT' });
    const folderFile = path.join(workspace, 'folders', folder.id + '.json');
    await writeFile(folderFile, JSON.stringify({ id: folder.id, deleted: true }));
    assert.equal((await call()).data.folders.length, 0);
  });
});
