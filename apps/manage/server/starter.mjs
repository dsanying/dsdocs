import { readFile, writeFile, unlink } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { validateMarkdown } from './markdown.mjs';

export async function initializeStarter(store, directory) {
  const assertEmpty = () => {
    if (
      store.list().length ||
      store.folders().length ||
      store.db.prepare('SELECT count(*) AS count FROM assets').get().count
    )
      throw new Error('初始内容只可载入空站点，不会覆盖已有文档、目录或附件。');
  };
  assertEmpty();
  const root = new URL('../starter/', import.meta.url);
  const manifest = JSON.parse(await readFile(new URL('manifest.json', root), 'utf8'));
  const assets = await Promise.all(
    manifest.assets.map(async (asset) => ({
      ...asset,
      id: randomUUID(),
      bytes: await readFile(new URL(`assets/${asset.file}`, root)),
    }))
  );
  const pages = [];
  for (const page of manifest.pages) {
    for (const locale of ['zh', 'en']) {
      let body = await readFile(new URL(`${locale}/${page.slug}.md`, root), 'utf8');
      body = body.replace(/\{\{asset:([a-z-]+)\}\}/g, (_, key) => {
        const asset = assets.find((item) => item.key === key);
        if (!asset) throw new Error(`初始附件不存在：${key}`);
        return `/docs/assets/${asset.id}`;
      });
      validateMarkdown(body);
      pages.push({ ...page[locale], slug: page.slug, folderKey: page.folder, locale, body });
    }
  }
  const written = [];
  try {
    for (const asset of assets) {
      const filename = path.join(directory, 'assets', asset.id);
      await writeFile(filename, asset.bytes, { mode: 0o600, flag: 'wx' });
      written.push(filename);
    }
    store.transaction(() => {
      assertEmpty();
      for (const asset of assets)
        store.db
          .prepare('INSERT INTO assets(id,name,mime,size,createdAt) VALUES(?,?,?,?,?)')
          .run(asset.id, asset.name, asset.mime, asset.bytes.length, new Date().toISOString());
      const folders = new Map(
        manifest.folders.map((folder, index) => {
          const result = store.folderSave(null, folder);
          store.db.prepare('UPDATE folders SET position=? WHERE id=?').run(index, result.id);
          return [folder.key, result.id];
        })
      );
      const translations = new Map();
      for (const page of pages) {
        const created = store.create({
          ...page,
          folder: folders.get(page.folderKey),
          translationId: translations.get(page.slug),
        });
        translations.set(page.slug, created.translationId);
        // The enclosing transaction owns initialization; avoid nested save/publish transactions.
        const snapshot = { ...created, body: page.body };
        const { version, published, ...publishedPage } = snapshot;
        store.db
          .prepare('UPDATE documents SET body=?,published=? WHERE id=?')
          .run(page.body, JSON.stringify(publishedPage), created.id);
        store.db
          .prepare('INSERT INTO revisions(documentId,snapshot,createdAt) VALUES(?,?,?)')
          .run(created.id, JSON.stringify(publishedPage), created.updatedAt);
      }
    });
  } catch (error) {
    await Promise.allSettled(written.map((filename) => unlink(filename)));
    throw error;
  }
  return { documents: pages.length, assets: assets.length };
}
