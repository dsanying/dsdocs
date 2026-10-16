import { mkdir, lstat, readFile, writeFile, rename, unlink, readdir } from 'node:fs/promises';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { problem } from '../../../packages/content/store.mjs';
const hash = (text) => createHash('sha256').update(text).digest('hex');
const json = (value) => JSON.stringify(value, null, 2) + '\n';
const uuid = (value) => typeof value === 'string' && /^[a-f0-9-]{36}$/.test(value);
export async function createFileWorkspace(store, directory) {
  const root = path.join(directory, 'workspace');
  for (const name of ['', 'documents', 'folders', '.history']) {
    const folder = path.join(root, name);
    await mkdir(folder, { recursive: name === '', mode: 0o700 }).catch((error) => {
      if (error.code !== 'EEXIST') throw error;
    });
    if ((await lstat(folder)).isSymbolicLink()) throw problem(400, '文件工作区不能是符号链接。');
  }
  const issues = new Map();
  const states = () => store.db.prepare('SELECT * FROM file_state').all();
  const state = (key) => store.db.prepare('SELECT * FROM file_state WHERE key=?').get(key);
  const remember = (key, filename, text, version) =>
    store.db
      .prepare(
        'INSERT INTO file_state(key,path,hash,version) VALUES(?,?,?,?) ON CONFLICT(key) DO UPDATE SET path=excluded.path,hash=excluded.hash,version=excluded.version'
      )
      .run(key, filename, hash(text), String(version));
  const fullPath = (filename) => {
    if (
      !/^(?:site\.json|(?:documents\/[a-zA-Z0-9_.-]+\.md|folders\/[a-zA-Z0-9_.-]+\.json))$/.test(
        filename
      ) ||
      filename.includes('..')
    )
      throw problem(400, '工作区文件路径无效。');
    return path.join(root, filename);
  };
  async function guard() {
    for (const name of ['', 'documents', 'folders', '.history']) {
      const info = await lstat(path.join(root, name));
      if (!info.isDirectory() || info.isSymbolicLink())
        throw problem(400, '工作区目录不能是符号链接。');
    }
  }
  async function disk(filename) {
    await guard();
    const full = fullPath(filename);
    try {
      const info = await lstat(full);
      if (!info.isFile() || info.isSymbolicLink() || info.size > 1200000)
        throw problem(400, '文件必须为不超过 1.2 MB 的普通文件，不能使用符号链接。');
      const text = await readFile(full, 'utf8');
      return { text, hash: hash(text) };
    } catch (error) {
      if (error.code === 'ENOENT') return { text: null, hash: null };
      throw error;
    }
  }
  async function archive(key, text, source) {
    if (text === null) return;
    await guard();
    const name = `${Date.now()}-${key.replace(/[^a-z0-9-]/gi, '-')}-${source}-${randomUUID()}.txt`;
    await writeFile(path.join(root, '.history', name), text, { mode: 0o600, flag: 'wx' });
  }
  async function write(filename, text, expected, key) {
    const current = await disk(filename);
    if (current.hash !== expected)
      throw problem(409, '文件已被其他编辑器修改，双方改动已保留，请处理冲突。');
    if (current.text === text) return;
    await archive(key, current.text, 'file');
    const temporary = path.join(root, `.tmp-${randomUUID()}`);
    try {
      await writeFile(temporary, text, { mode: 0o600, flag: 'wx' });
      if ((await disk(filename)).hash !== expected)
        throw problem(409, '文件在保存期间发生变化，请处理冲突。');
      await rename(temporary, fullPath(filename));
    } finally {
      await unlink(temporary).catch((error) => {
        if (error.code !== 'ENOENT') throw error;
      });
    }
  }
  const resources = () => {
    const value = store.settings();
    const all = [
      {
        key: 'site',
        filename: 'site.json',
        version: String(value.version),
        text: json(value.data),
      },
    ];
    for (const row of store.list()) {
      const { id, title, slug, locale, description, folder, translationId } = row;
      all.push({
        key: `document:${id}`,
        filename: `documents/${id}.md`,
        version: String(row.version),
        text: `---\n${JSON.stringify({ id, title, slug, locale, description, folder, translationId }, null, 2)}\n---\n${row.body}`,
      });
    }
    for (const row of store.folders()) {
      const { id, title, titleEn, parent } = row;
      all.push({
        key: `folder:${id}`,
        filename: `folders/${id}.json`,
        version: row.version,
        text: json({ id, title, titleEn, parent }),
      });
    }
    return all;
  };
  const resource = (key) => resources().find((item) => item.key === key);
  function parse(filename, text) {
    if (filename === 'site.json') return { kind: 'site', data: JSON.parse(text), body: null };
    if (filename.startsWith('folders/'))
      return { kind: 'folder', data: JSON.parse(text), body: null };
    const match = text.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
    if (!match) throw problem(400, 'Markdown 文件需以 JSON 格式的 front matter 开头。');
    return { kind: 'document', data: JSON.parse(match[1]), body: text.slice(match[0].length) };
  }
  function apply(parsed, key) {
    const data = parsed.data;
    if (!data || typeof data !== 'object' || Array.isArray(data))
      throw problem(400, '文件元数据必须为对象。');
    if (parsed.kind === 'site')
      return {
        key: 'site',
        value: store.saveSettings(store.settings().version, data),
        deleted: false,
      };
    const allowed =
      parsed.kind === 'document'
        ? ['id', 'title', 'slug', 'locale', 'description', 'folder', 'translationId', 'deleted']
        : ['id', 'title', 'titleEn', 'parent', 'deleted'];
    if (
      Object.keys(data).some((field) => !allowed.includes(field)) ||
      (data.id !== undefined && !uuid(data.id)) ||
      (data.deleted !== undefined && typeof data.deleted !== 'boolean')
    )
      throw problem(400, '文件元数据包含无效字段。');
    const id = key?.split(':')[1] ?? data.id;
    if (id && data.id && id !== data.id) throw problem(409, '不能修改已有文件的文档或目录 ID。');
    if (parsed.kind === 'document') {
      const current = id ? store.list().find((item) => item.id === id) : null;
      if (id && !current) throw problem(409, '文档已在面板删除；如需新建文件，请移除 id。');
      if (data.deleted) {
        if (!current) throw problem(400, '删除标记必须指向已有文档。');
        store.db.prepare('DELETE FROM documents WHERE id=?').run(id);
        return { key: `document:${id}`, deleted: true };
      }
      if (
        current &&
        (data.locale !== current.locale ||
          (data.translationId && data.translationId !== current.translationId))
      )
        throw problem(400, '不能通过文件改变已有文档的语言或翻译关联。');
      const created = current ?? store.create(data);
      try {
        const value = store.save(created.id, {
          ...data,
          body: parsed.body,
          version: created.version,
        });
        return { key: `document:${value.id}`, value, deleted: false };
      } catch (error) {
        if (!current) store.db.prepare('DELETE FROM documents WHERE id=?').run(created.id);
        throw error;
      }
    }
    if (data.deleted) {
      if (!id) throw problem(400, '删除标记必须指向已有目录。');
      store.removeFolder(id);
      return { key: `folder:${id}`, deleted: true };
    }
    const value = store.folderSave(id ?? null, data);
    return { key: `folder:${value.id}`, value, deleted: false };
  }
  async function filenames() {
    const names = ['site.json'];
    for (const [folder, extension] of [
      ['folders', '.json'],
      ['documents', '.md'],
    ]) {
      const entries = await readdir(path.join(root, folder));
      if (entries.length > 10000) throw problem(400, '工作区文件数量过多。');
      for (const name of entries) if (name.endsWith(extension)) names.push(`${folder}/${name}`);
    }
    return names;
  }
  function fail(key, filename, error, file) {
    const identityError = /多个文件|ID 不能|符号链接/.test(error.message);
    issues.set(key, {
      key,
      path: filename,
      message: error.status
        ? error.message
        : error instanceof SyntaxError
          ? '文件 JSON 格式有误，请检查引号和逗号。'
          : '文件同步失败，请检查文件权限及格式。',
      fileHash: file?.hash ?? null,
      version: resource(key)?.version ?? null,
      canUsePanel: !identityError && Boolean(resource(key)),
      canUseFile: !identityError && !(error instanceof SyntaxError) && Boolean(file?.text),
    });
  }
  async function pull() {
    await guard();
    const snapshots = new Map(resources().map((item) => [item.key, item]));
    const paths = new Map(states().map((item) => [item.path, item]));
    const seen = new Map();
    for (const [key, issue] of issues) {
      if ((await disk(issue.path).catch(() => ({ text: 'unsafe' }))).text === null)
        issues.delete(key);
    }
    const duplicates = new Set(),
      identities = new Map();
    for (const filename of await filenames()) {
      try {
        const file = await disk(filename);
        if (!file.text) continue;
        const parsed = parse(filename, file.text);
        if (!parsed.data?.id) continue;
        const key = `${parsed.kind}:${parsed.data.id}`;
        if (identities.has(key)) duplicates.add(key);
        identities.set(key, filename);
      } catch {}
    }
    // Load folders before documents so a newly authored document can refer to them.
    for (const filename of await filenames()) {
      let key = paths.get(filename)?.key ?? `new:${filename}`,
        file;
      try {
        file = await disk(filename);
        if (file.text === null) continue;
        issues.delete(`new:${filename}`);
        const parsed = parse(filename, file.text);
        const originalKey = key;
        if (parsed.kind === 'site') key = 'site';
        else if (parsed.data?.id) key = `${parsed.kind}:${parsed.data.id}`;
        if (!originalKey.startsWith('new:') && key !== originalKey) {
          key = originalKey;
          throw problem(409, '已有文件的 ID 不能修改。');
        }
        if (duplicates.has(key)) throw problem(409, '同一个 ID 出现在多个文件，请保留一个文件。');
        const existing = state(key);
        if (existing && existing.path !== filename && (await disk(existing.path)).text !== null)
          throw problem(409, '同一个 ID 出现在多个文件，请保留一个文件。');
        if (seen.has(key)) throw problem(409, '同一个 ID 出现在多个文件。');
        seen.set(key, filename);
        const current = snapshots.get(key);
        if (existing && existing.hash === file.hash) {
          if (existing.path !== filename) remember(key, filename, file.text, existing.version);
          issues.delete(key);
          continue;
        }
        if (existing && current?.version !== existing.version) {
          issues.set(key, {
            key,
            path: filename,
            message: '文件与面板均有修改，请比较后选择保留的版本。',
            fileHash: file.hash,
            version: current?.version ?? null,
            canUsePanel: Boolean(current),
            canUseFile: Boolean(current),
          });
          continue;
        }
        const previousIssue = issues.get(key);
        if (
          current &&
          (previousIssue?.fileHash !== file.hash || previousIssue?.version !== current.version)
        )
          await archive(key, current.text, 'panel');
        if ((await disk(filename)).hash !== file.hash)
          throw problem(409, '同步期间文件发生变化，请重试。');
        if ((resource(key)?.version ?? null) !== (current?.version ?? null))
          throw problem(409, '同步期间面板版本发生变化，双方内容已保留。');
        const result = apply(parsed, key.startsWith('new:') ? null : key);
        if (result.deleted) {
          await archive(result.key, file.text, 'deleted');
          if ((await disk(filename)).hash !== file.hash)
            throw problem(409, '删除期间文件发生变化，已保留文件。');
          await unlink(fullPath(filename));
          store.db.prepare('DELETE FROM file_state WHERE key=?').run(result.key);
        } else {
          const next = resource(result.key);
          remember(result.key, filename, file.text, next.version);
          // Assign an ID once to new files, so renaming them keeps their identity.
          if (parsed.kind !== 'site' && !parsed.data.id) {
            await write(filename, next.text, file.hash, result.key);
            remember(result.key, filename, next.text, next.version);
          }
        }
        issues.delete(key);
        issues.delete(result.key);
      } catch (error) {
        fail(key, filename, error, file);
      }
    }
  }
  async function push() {
    for (const item of resources()) {
      if (issues.has(item.key)) continue;
      const previous = state(item.key),
        filename = previous?.path ?? item.filename;
      try {
        const file = await disk(filename);
        if (previous && previous.version === item.version && file.text !== null) continue;
        await write(
          filename,
          item.text,
          file.text === null ? null : (previous?.hash ?? null),
          item.key
        );
        remember(item.key, filename, item.text, item.version);
      } catch (error) {
        fail(item.key, filename, error, await disk(filename).catch(() => null));
      }
    }
    const currentKeys = new Set(resources().map((item) => item.key));
    for (const previous of states()) {
      if (currentKeys.has(previous.key)) continue;
      try {
        const file = await disk(previous.path);
        if (file.text !== null) {
          if (file.hash !== previous.hash)
            throw problem(409, '面板已删除该项目，但文件还有修改，请检查并保留需要的内容。');
          await archive(previous.key, file.text, 'deleted');
          await unlink(fullPath(previous.path));
        }
        store.db.prepare('DELETE FROM file_state WHERE key=?').run(previous.key);
      } catch (error) {
        fail(previous.key, previous.path, error, await disk(previous.path).catch(() => null));
      }
    }
  }
  const status = () => ({ directory: root, issues: [...issues.values()] });
  const sync = async () => {
    await pull();
    await push();
    return status();
  };
  const assertWritable = (key) => {
    if (issues.has(key)) throw problem(409, '文件与面板存在未解决的问题，请先在“文件同步”中处理。');
  };
  const compare = async (key) => {
    const issue = issues.get(key);
    if (!issue) throw problem(404, '同步问题已不存在，请刷新。');
    const file = await disk(issue.path),
      current = resource(key);
    return { ...issue, fileText: file.text, panelText: current?.text ?? null };
  };
  async function resolve({ key, source, fileHash, version }) {
    if (!['file', 'panel'].includes(source)) throw problem(400, '请选择文件或面板版本。');
    const issue = issues.get(key);
    if (!issue) throw problem(409, '同步状态已变化，请重新加载。');
    if (source === 'file' ? !issue.canUseFile : !issue.canUsePanel)
      throw problem(400, '请先手动修复文件格式、标识或路径问题。');
    const file = await disk(issue.path),
      current = resource(key);
    if (file.hash !== fileHash || (current?.version ?? null) !== version)
      throw problem(409, '比较期间又有修改，请重新比较。');
    await archive(key, current?.text ?? null, 'panel');
    await archive(key, file.text, 'file');
    if (source === 'file') {
      if (!file.text) throw problem(400, '文件不存在。');
      const result = apply(parse(issue.path, file.text), key.startsWith('new:') ? null : key);
      if (result.deleted) {
        await unlink(fullPath(issue.path));
        store.db.prepare('DELETE FROM file_state WHERE key=?').run(key);
      } else {
        const next = resource(result.key);
        await write(issue.path, next.text, file.hash, result.key);
        remember(result.key, issue.path, next.text, next.version);
      }
    } else {
      if (!current) throw problem(400, '面板项目已不存在，请手动检查文件。');
      await write(issue.path, current.text, file.hash, key);
      remember(key, issue.path, current.text, current.version);
    }
    issues.delete(key);
    return status();
  }
  await sync();
  return { root, sync, pull, push, status, assertWritable, compare, resolve };
}
