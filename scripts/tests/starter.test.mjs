import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { createContentAPI } from '../../apps/manage/server/content.mjs';
import { initializeStarter } from '../../apps/manage/server/starter.mjs';
import { validateMarkdown } from '../../apps/manage/server/markdown.mjs';

async function fixture(t, mode) {
  const directory = await mkdtemp(path.join(tmpdir(), 'dsdocs-starter-'));
  const api = await createContentAPI(directory, mode);
  t.after(async () => {
    api.store.close();
    await rm(directory, { recursive: true, force: true });
  });
  return { directory, api };
}
test('新站载入成对教程、发布快照、有效链接及本地附件', async (t) => {
  const { directory, api } = await fixture(t, 'guide');
  const documents = api.store.published();
  assert.equal(documents.length, 8);
  assert.equal(api.store.folders().length, 2);
  const paths = new Set(documents.map((doc) => `/docs/${doc.locale}/${doc.slug}`));
  for (const doc of documents) {
    assert.equal(documents.filter((other) => other.translationId === doc.translationId).length, 2);
    assert.ok(!doc.body.includes('{{asset:'));
    validateMarkdown(doc.body);
    for (const match of doc.body.matchAll(/\]\((\/docs\/(?:zh|en)\/[^)#]+)(?:#[^)]*)?\)/g))
      assert.ok(paths.has(match[1]), `失效站内链接 ${match[1]}`);
    assert.equal(JSON.parse(api.store.get(doc.id).published).body, doc.body);
  }
  const assets = api.store.db.prepare('SELECT * FROM assets').all();
  assert.equal(assets.length, 2);
  for (const asset of assets) {
    const bytes = await readFile(path.join(directory, 'assets', asset.id));
    assert.equal(bytes.length, asset.size);
    assert.ok(documents.some((doc) => doc.body.includes(`/docs/assets/${asset.id}`)));
  }
  assert.equal(api.store.db.prepare('SELECT count(*) AS n FROM revisions').get().n, 8);
});
test('已有内容和删除后的站点不会被自动恢复或覆盖', async (t) => {
  const { directory, api } = await fixture(t, 'guide');
  const doc = api.store.list()[0];
  api.store.save(doc.id, { ...doc, body: '自己的内容' });
  await assert.rejects(initializeStarter(api.store, directory), /不会覆盖/);
  let restarted = await createContentAPI(directory);
  assert.equal(restarted.store.get(doc.id).body, '自己的内容');
  restarted.store.close();
  api.store.db.exec('DELETE FROM documents; DELETE FROM folders; DELETE FROM assets;');
  restarted = await createContentAPI(directory);
  assert.equal(restarted.store.list().length, 0);
  restarted.store.close();
});
test('可关闭初始教程，并显式向空站点载入', async (t) => {
  const { directory, api } = await fixture(t, 'none');
  assert.equal(api.store.list().length, 0);
  const restarted = await createContentAPI(directory);
  assert.equal(restarted.store.list().length, 0);
  restarted.store.close();
  assert.deepEqual(await initializeStarter(api.store, directory), { documents: 8, assets: 2 });
  await assert.rejects(createContentAPI(directory, 'unknown'), /只能为/);
});
test('初始化中断时回滚数据库并清理本次附件，可重新执行', async (t) => {
  const { directory, api } = await fixture(t, 'none');
  const create = api.store.create;
  let calls = 0;
  api.store.create = (...args) => {
    if (++calls === 2) throw new Error('模拟写入失败');
    return create(...args);
  };
  await assert.rejects(initializeStarter(api.store, directory), /模拟写入失败/);
  assert.equal(api.store.list().length, 0);
  assert.equal(api.store.folders().length, 0);
  assert.equal(api.store.db.prepare('SELECT count(*) AS n FROM assets').get().n, 0);
  assert.deepEqual(await readdir(path.join(directory, 'assets')), []);
  api.store.create = create;
  assert.equal((await initializeStarter(api.store, directory)).documents, 8);
});

test('读取初始包期间新增内容也不会被导入操作覆盖', async (t) => {
  const { directory, api } = await fixture(t, 'none');
  const transaction = api.store.transaction;
  api.store.transaction = (action) => {
    api.store.create({ title: '自己的新文档', locale: 'zh', slug: 'my-document' });
    return transaction(action);
  };
  await assert.rejects(initializeStarter(api.store, directory), /不会覆盖/);
  assert.equal(api.store.list().length, 1);
  assert.equal(api.store.list()[0].title, '自己的新文档');
  assert.equal(api.store.folders().length, 0);
  assert.deepEqual(await readdir(path.join(directory, 'assets')), []);
});
