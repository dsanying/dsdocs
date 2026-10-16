import { defaultSettings, validateSettings, settingsAssetIds } from './settings.mjs';
import { createHash } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, chmodSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { homedir } from 'node:os';
export const dataDirectory = () =>
  path.resolve(process.env.DSDOCS_DATA_DIR ?? path.join(homedir(), '.local/share/dsdocs'));
export const problem = (status, message) => Object.assign(new Error(message), { status });
export function openContent(directory = dataDirectory(), readonly = false) {
  if (!readonly) mkdirSync(directory, { recursive: true, mode: 0o700 });
  const filename = path.join(directory, 'content.sqlite');
  const db = new DatabaseSync(filename, { readOnly: readonly });
  db.exec('PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;');
  if (!readonly) {
    chmodSync(filename, 0o600);
    db.exec(`PRAGMA journal_mode=DELETE;
      CREATE TABLE IF NOT EXISTS site_settings (id INTEGER PRIMARY KEY CHECK(id=1), version INTEGER NOT NULL, data TEXT NOT NULL, updatedAt TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS file_state (key TEXT PRIMARY KEY, path TEXT NOT NULL, hash TEXT NOT NULL, version TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS folders (id TEXT PRIMARY KEY, title TEXT NOT NULL, titleEn TEXT NOT NULL, parent TEXT REFERENCES folders(id), position INTEGER NOT NULL DEFAULT 0);
      CREATE TABLE IF NOT EXISTS documents (id TEXT PRIMARY KEY, translationId TEXT NOT NULL, locale TEXT NOT NULL CHECK(locale IN ('zh','en')), slug TEXT NOT NULL, title TEXT NOT NULL, description TEXT NOT NULL DEFAULT '', folder TEXT REFERENCES folders(id), body TEXT NOT NULL DEFAULT '', version INTEGER NOT NULL DEFAULT 1, published TEXT, updatedAt TEXT NOT NULL, UNIQUE(locale,slug), UNIQUE(translationId,locale));
      CREATE TABLE IF NOT EXISTS revisions (id INTEGER PRIMARY KEY, documentId TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE, snapshot TEXT NOT NULL, createdAt TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS assets (id TEXT PRIMARY KEY, name TEXT NOT NULL, mime TEXT NOT NULL, size INTEGER NOT NULL, createdAt TEXT NOT NULL);
    `);
  }
  const transaction = (fn) => {
    db.exec('BEGIN IMMEDIATE');
    try {
      const result = fn();
      db.exec('COMMIT');
      return result;
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }
  };
  const get = (id) => {
    const row = db.prepare('SELECT * FROM documents WHERE id=?').get(id);
    if (!row) throw problem(404, '文档不存在。');
    return row;
  };
  const list = () => db.prepare('SELECT * FROM documents ORDER BY title COLLATE NOCASE,id').all();
  /** @returns {{id:string,title:string,titleEn:string,parent:string|null,position:number,version:string}[]} */
  const folders = () =>
    db
      .prepare('SELECT * FROM folders ORDER BY position,title,id')
      .all()
      .map((row) => ({
        ...row,
        version: createHash('sha256').update(JSON.stringify(row)).digest('hex'),
      }));
  const published = () =>
    db
      .prepare('SELECT published FROM documents WHERE published IS NOT NULL ORDER BY id')
      .all()
      .map((row) => JSON.parse(row.published))
      .sort((a, b) => a.title.localeCompare(b.title) || a.id.localeCompare(b.id));
  const settings = () => {
    const exists = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='site_settings'")
      .get();
    const row = exists ? db.prepare('SELECT * FROM site_settings WHERE id=1').get() : null;
    return {
      version: row?.version ?? 0,
      data: row ? validateSettings(JSON.parse(row.data)) : structuredClone(defaultSettings),
      updatedAt: row?.updatedAt ?? null,
    };
  };
  const saveSettings = (version, input) =>
    transaction(() => {
      if (version !== settings().version)
        throw problem(409, '设置已被其他入口修改，请重新加载后编辑。');
      const value = validateSettings(input);
      for (const id of settingsAssetIds(value)) {
        const asset = db.prepare('SELECT mime FROM assets WHERE id=?').get(id);
        if (!asset || !['image/png', 'image/jpeg', 'image/webp'].includes(asset.mime))
          throw problem(400, '站点标识必须使用已上传的 PNG、JPEG 或 WebP 图片。');
      }
      if (
        value.homeTranslationId &&
        !published().some((doc) => doc.translationId === value.homeTranslationId)
      )
        throw problem(400, '首页需要选择已发布的文档。');
      db.prepare(
        'INSERT INTO site_settings(id,version,data,updatedAt) VALUES(1,?,?,?) ON CONFLICT(id) DO UPDATE SET version=excluded.version,data=excluded.data,updatedAt=excluded.updatedAt'
      ).run(version + 1, JSON.stringify(value), new Date().toISOString());
      return settings();
    });
  const revision = () =>
    JSON.stringify({
      settings: settings().version,
      latest: db.prepare('SELECT max(id) AS id FROM revisions').get().id,
      pages: db.prepare('SELECT id FROM documents WHERE published IS NOT NULL ORDER BY id').all(),
      folders: folders(),
    });
  const bounded = (s, min, max, label) => {
    if (typeof s !== 'string' || s.trim().length < min || s.length > max)
      throw problem(400, `${label}无效。`);
    return s.trim();
  };
  const metadata = (input) => {
    const locale = input.locale;
    if (!['zh', 'en'].includes(locale)) throw problem(400, '语言无效。');
    const slug = bounded(input.slug, 1, 180, '路径');
    if (!/^[a-z0-9]+(?:[\/-][a-z0-9]+)*$/.test(slug))
      throw problem(400, '路径只能使用小写字母、数字、连字符及斜线。');
    if (input.folder && (typeof input.folder !== 'string' || !/^[a-f0-9-]{36}$/.test(input.folder)))
      throw problem(400, '目录标识无效。');
    const folder = input.folder || null;
    if (folder && !db.prepare('SELECT id FROM folders WHERE id=?').get(folder))
      throw problem(400, '目录不存在。');
    return {
      locale,
      slug,
      title: bounded(input.title, 1, 160, '标题'),
      description: bounded(input.description ?? '', 0, 500, '简介'),
      folder,
    };
  };
  const create = (input) => {
    if (
      input.translationId &&
      (typeof input.translationId !== 'string' || !/^[a-f0-9-]{36}$/.test(input.translationId))
    )
      throw problem(400, '翻译关联标识无效。');
    const value = metadata(input),
      id = randomUUID(),
      translationId = input.translationId || randomUUID();
    if (
      input.translationId &&
      !db.prepare('SELECT id FROM documents WHERE translationId=?').get(input.translationId)
    )
      throw problem(400, '关联文档不存在。');
    db.prepare(
      'INSERT INTO documents (id,translationId,locale,slug,title,description,folder,body,updatedAt) VALUES (?,?,?,?,?,?,?,?,?)'
    ).run(
      id,
      translationId,
      value.locale,
      value.slug,
      value.title,
      value.description,
      value.folder,
      '',
      new Date().toISOString()
    );
    return get(id);
  };
  const save = (id, input) =>
    transaction(() => {
      const current = get(id);
      if (input.version !== current.version)
        throw problem(409, '文档已被其他窗口修改，请重新加载后编辑。');
      if (typeof input.body !== 'string' || Buffer.byteLength(input.body) > 1024 * 1024)
        throw problem(400, '正文必须为不超过 1 MiB 的文本。');
      const value = metadata(input);
      if (value.locale !== current.locale) throw problem(400, '不能改变已有文档语言。');
      db.prepare(
        'UPDATE documents SET slug=?,title=?,description=?,folder=?,body=?,version=version+1,updatedAt=? WHERE id=?'
      ).run(
        value.slug,
        value.title,
        value.description,
        value.folder,
        input.body,
        new Date().toISOString(),
        id
      );
      return get(id);
    });
  const publish = (id, version) =>
    transaction(() => {
      const current = get(id);
      if (current.version !== version) throw problem(409, '发布前请保存最新草稿。');
      const snapshot = {
        id: current.id,
        translationId: current.translationId,
        locale: current.locale,
        slug: current.slug,
        title: current.title,
        description: current.description,
        body: current.body,
        folder: current.folder,
        updatedAt: current.updatedAt,
      };
      const other = published().find(
        (x) => x.id !== id && x.locale === snapshot.locale && x.slug === snapshot.slug
      );
      if (other) throw problem(409, '已发布路径被占用。');
      db.prepare('INSERT INTO revisions(documentId,snapshot,createdAt) VALUES(?,?,?)').run(
        id,
        JSON.stringify(snapshot),
        new Date().toISOString()
      );
      db.prepare('UPDATE documents SET published=? WHERE id=?').run(JSON.stringify(snapshot), id);
      return get(id);
    });
  const folderSave = (id, input) => {
    const title = bounded(input.title, 1, 100, '目录名称'),
      titleEn = bounded(input.titleEn ?? input.title, 1, 100, '英文目录名称'),
      parent = input.parent || null;
    if (parent && (typeof parent !== 'string' || !/^[a-f0-9-]{36}$/.test(parent)))
      throw problem(400, '父目录标识无效。');
    const all = folders();
    if (
      id &&
      input.version !== undefined &&
      input.version !== all.find((item) => item.id === id)?.version
    )
      throw problem(409, '目录已被其他入口修改，请重新加载。');
    if (parent && !all.some((x) => x.id === parent)) throw problem(400, '父目录不存在。');
    let cursor = parent;
    while (cursor) {
      if (cursor === id) throw problem(400, '目录不能循环嵌套。');
      cursor = all.find((x) => x.id === cursor)?.parent;
    }
    if (id && !all.some((x) => x.id === id)) throw problem(404, '目录不存在。');
    const key = id || randomUUID();
    db.prepare(
      'INSERT INTO folders(id,title,titleEn,parent) VALUES(?,?,?,?) ON CONFLICT(id) DO UPDATE SET title=excluded.title,titleEn=excluded.titleEn,parent=excluded.parent'
    ).run(key, title, titleEn, parent);
    return folders().find((x) => x.id === key);
  };
  const removeFolder = (id) => {
    if (
      list().some(
        (x) => x.folder === id || (x.published && JSON.parse(x.published).folder === id)
      ) ||
      folders().some((x) => x.parent === id)
    )
      throw problem(409, '请先移走目录内文档及子目录。');
    db.prepare('DELETE FROM folders WHERE id=?').run(id);
  };
  return {
    db,
    list,
    get,
    folders,
    published,
    revision,
    settings,
    saveSettings,
    create,
    save,
    publish,
    folderSave,
    removeFolder,
    transaction,
    close: () => db.close(),
  };
}
