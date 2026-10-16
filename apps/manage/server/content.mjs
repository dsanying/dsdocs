import { mkdir, writeFile, unlink, readFile } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { openContent, problem } from '../../../packages/content/store.mjs';
import { validateMarkdown } from './markdown.mjs';
export async function createContentAPI(directory) {
  const store = openContent(directory),
    assets = path.join(directory, 'assets');
  await mkdir(assets, { recursive: true, mode: 0o700 });
  const only = (value, keys) => {
    if (Object.keys(value).some((k) => !keys.includes(k))) throw problem(400, '存在不支持的字段。');
  };
  async function handle(req, res, pathname, json, body) {
    const method = req.method;
    if (pathname === '/__dsdocs_content' && method === 'GET')
      return json(res, 200, { documents: store.list(), folders: store.folders() });
    if (pathname === '/__dsdocs_content/documents' && method === 'POST') {
      const data = await body(req);
      only(data, ['title', 'description', 'slug', 'locale', 'folder', 'translationId']);
      return json(res, 201, store.create(data));
    }
    const doc = pathname.match(
      /^\/__dsdocs_content\/documents\/([a-f0-9-]+)(\/publish|\/unpublish|\/revisions|\/restore)?$/
    );
    if (doc) {
      const id = doc[1],
        action = doc[2],
        current = store.get(id);
      if (!action && method === 'PATCH') {
        const data = await body(req);
        only(data, ['version', 'title', 'description', 'slug', 'locale', 'folder', 'body']);
        return json(res, 200, store.save(id, data));
      }
      if (!action && method === 'DELETE') {
        await body(req);
        store.db.prepare('DELETE FROM documents WHERE id=?').run(id);
        return json(res, 200, { saved: true });
      }
      if (action === '/publish' && method === 'POST') {
        const data = await body(req);
        only(data, ['version']);
        validateMarkdown(current.body);
        for (const match of current.body.matchAll(/\/docs\/assets\/([a-f0-9-]+)/g))
          if (!store.db.prepare('SELECT id FROM assets WHERE id=?').get(match[1]))
            throw problem(422, '正文引用的附件已不存在。');
        return json(res, 200, store.publish(id, data.version));
      }
      if (action === '/unpublish' && method === 'POST') {
        await body(req);
        store.db.prepare('UPDATE documents SET published=NULL WHERE id=?').run(id);
        return json(res, 200, store.get(id));
      }
      if (action === '/revisions' && method === 'GET')
        return json(
          res,
          200,
          store.db.prepare('SELECT * FROM revisions WHERE documentId=? ORDER BY id DESC').all(id)
        );
      if (action === '/restore' && method === 'POST') {
        const data = await body(req);
        only(data, ['revision', 'version']);
        const revision = store.db
          .prepare('SELECT snapshot FROM revisions WHERE id=? AND documentId=?')
          .get(data.revision, id);
        if (!revision) throw problem(404, '版本不存在。');
        const snap = JSON.parse(revision.snapshot);
        return json(
          res,
          200,
          store.save(id, { ...snap, folder: current.folder, version: data.version })
        );
      }
    }
    const folder = pathname.match(/^\/__dsdocs_content\/folders(?:\/([a-f0-9-]+))?$/);
    if (folder) {
      if ((!folder[1] && method === 'POST') || (folder[1] && method === 'PATCH')) {
        const data = await body(req);
        only(data, ['title', 'titleEn', 'parent']);
        return json(res, 200, store.folderSave(folder[1], data));
      }
      if (folder[1] && method === 'DELETE') {
        await body(req);
        store.removeFolder(folder[1]);
        return json(res, 200, { saved: true });
      }
    }
    if (pathname === '/__dsdocs_content/assets' && method === 'GET')
      return json(
        res,
        200,
        store.db.prepare('SELECT * FROM assets ORDER BY createdAt DESC,id').all()
      );
    if (pathname === '/__dsdocs_content/assets' && method === 'POST') {
      const mime = req.headers['content-type']?.split(';')[0];
      if (
        !['image/png', 'image/jpeg', 'image/webp', 'application/pdf', 'text/plain'].includes(mime)
      )
        throw problem(415, '仅支持 PNG、JPEG、WebP、PDF 和纯文本文件。');
      const chunks = [];
      let size = 0;
      for await (const chunk of req) {
        size += chunk.length;
        if (size > 5 * 1024 * 1024) throw problem(413, '附件不能超过 5 MiB。');
        chunks.push(chunk);
      }
      const bytes = Buffer.concat(chunks);
      if (!size) throw problem(400, '附件不能为空。');
      if (
        (mime === 'image/png' &&
          !bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) ||
        (mime === 'image/jpeg' && (bytes.length < 3 || bytes.readUInt16BE(0) !== 0xffd8)) ||
        (mime === 'image/webp' &&
          (bytes.toString('ascii', 0, 4) !== 'RIFF' ||
            bytes.toString('ascii', 8, 12) !== 'WEBP')) ||
        (mime === 'application/pdf' && bytes.toString('ascii', 0, 5) !== '%PDF-')
      )
        throw problem(400, '附件内容与类型不一致。');
      let name;
      try {
        name = decodeURIComponent(req.headers['x-filename'] ?? 'attachment');
      } catch {
        throw problem(400, '文件名无效。');
      }
      name =
        path
          .basename(name)
          .replace(/[\x00-\x1f\x7f]/g, '')
          .slice(0, 160) || 'attachment';
      const id = randomUUID();
      await writeFile(path.join(assets, id), bytes, { mode: 0o600, flag: 'wx' });
      try {
        store.db
          .prepare('INSERT INTO assets(id,name,mime,size,createdAt) VALUES(?,?,?,?,?)')
          .run(id, name, mime, size, new Date().toISOString());
      } catch (error) {
        await unlink(path.join(assets, id));
        throw error;
      }
      return json(res, 201, { id, name, src: `/docs/assets/${id}` });
    }
    const asset = pathname.match(/^\/__dsdocs_content\/assets\/([a-f0-9-]+)$/);
    if (asset) {
      const item = store.db.prepare('SELECT * FROM assets WHERE id=?').get(asset[1]);
      if (!item) throw problem(404, '附件不存在。');
      if (method === 'DELETE') {
        await body(req);
        const url = `/docs/assets/${item.id}`;
        if (store.list().some((x) => x.body.includes(url) || x.published?.includes(url)))
          throw problem(409, '附件仍被草稿或已发布文档引用，请先移除引用并发布。');
        await unlink(path.join(assets, item.id));
        store.db.prepare('DELETE FROM assets WHERE id=?').run(item.id);
        return json(res, 200, { saved: true });
      }
      if (method === 'GET') {
        res.writeHead(200, {
          'Content-Type': item.mime,
          'X-Content-Type-Options': 'nosniff',
          'Cache-Control': 'no-store',
          'Content-Disposition': `inline; filename*=UTF-8''${encodeURIComponent(item.name)}`,
        });
        res.end(await readFile(path.join(assets, item.id)));
        return;
      }
    }
    throw problem(404, '内容接口不存在。');
  }
  return { store, handle };
}
