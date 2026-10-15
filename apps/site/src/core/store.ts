import { DatabaseSync, type SQLInputValue } from 'node:sqlite';
import { mkdirSync, chmodSync, existsSync } from 'node:fs';
import path from 'node:path';
import { createHash, randomBytes, randomUUID, scryptSync, timingSafeEqual } from 'node:crypto';
import { schema } from './schema';
import { config, basePath } from './config';
import { DomainError, requireValue } from './errors';
import {
  documentSchema,
  userSchema,
  userUpdateSchema,
  type Actor,
  type Document,
  type DocumentInput,
  type Revision,
  type Role,
} from './model';
import { inspectMdx, splitSource } from '../content/validate';

type Row = Record<string, unknown>;
const now = () => new Date().toISOString();
export const hash = (text: string | Buffer) => createHash('sha256').update(text).digest('hex');
function hashPassword(password: string) {
  const salt = randomBytes(16).toString('hex');
  return `${salt}:${scryptSync(password, salt, 64).toString('hex')}`;
}
function verifyPassword(password: string, stored: string) {
  const [salt, key] = stored.split(':');
  const actual = scryptSync(password, salt, 64),
    expected = Buffer.from(key, 'hex');
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
export class Store {
  readonly db: DatabaseSync;
  constructor(filename: string) {
    if (filename !== ':memory:')
      mkdirSync(path.dirname(path.resolve(filename)), { recursive: true, mode: 0o700 });
    this.db = new DatabaseSync(filename);
    try {
      if (filename !== ':memory:') chmodSync(filename, 0o600);
      this.db.exec('PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000; PRAGMA journal_mode=WAL;');
      if (filename !== ':memory:')
        for (const companion of [filename + '-wal', filename + '-shm'])
          if (existsSync(companion)) chmodSync(companion, 0o600);
      const version = this.db.prepare('PRAGMA user_version').get() as { user_version: number };
      if (version.user_version > 2)
        throw new Error('Database schema is newer than this application');
      this.transaction(() => {
        this.db.exec(schema);
        if (version.user_version < 2) {
          this.db.exec(
            "UPDATE users SET disabled=1 WHERE role='reader'; UPDATE users SET role='admin'; INSERT OR IGNORE INTO schema_migrations VALUES(2,strftime('%Y-%m-%dT%H:%M:%fZ','now'));"
          );
        }
        this.db.exec('PRAGMA user_version=2');
      });
    } catch (error) {
      this.db.close();
      throw error;
    }
  }
  close() {
    this.db.close();
  }
  one(sql: string, ...args: SQLInputValue[]) {
    return this.db.prepare(sql).get(...args) as Row | undefined;
  }
  all(sql: string, ...args: SQLInputValue[]) {
    return this.db.prepare(sql).all(...args) as Row[];
  }
  run(sql: string, ...args: SQLInputValue[]) {
    return this.db.prepare(sql).run(...args);
  }
  transaction<T>(fn: () => T): T {
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const result = fn();
      this.db.exec('COMMIT');
      return result;
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }
  }
  authorize(actor: Actor, permission: 'read' | 'edit' | 'publish' | 'admin') {
    const user = this.one('SELECT role,disabled FROM users WHERE id=?', actor.id);
    // Permission names describe operations for audit; every enabled manager has the same access.
    void permission;
    if (!user || user.disabled || user.role !== 'admin')
      throw new DomainError(403, 'FORBIDDEN', 'Access denied');
  }
  audit(actor: Actor, action: string, target: string) {
    this.run(
      'INSERT INTO audit(actor,action,target,created_at) VALUES(?,?,?,?)',
      actor.username,
      action,
      target,
      now()
    );
  }
  bootstrap(username: string, password: string) {
    const input = userSchema.parse({ username, password, role: 'admin' });
    return this.transaction(() => {
      if (this.one('SELECT id FROM users LIMIT 1'))
        throw new DomainError(
          409,
          'ALREADY_INITIALIZED',
          'Use user management after initialization'
        );
      return this.insertUser(input);
    });
  }
  private insertUser(input: { username: string; password: string; role: Role }): Actor {
    if (this.one('SELECT id FROM users WHERE username=? COLLATE NOCASE', input.username))
      throw new DomainError(409, 'USERNAME_EXISTS', 'Username already exists');
    const id = randomUUID();
    this.run(
      'INSERT INTO users(id,username,password_hash,role,created_at) VALUES(?,?,?,?,?)',
      id,
      input.username,
      hashPassword(input.password),
      input.role,
      now()
    );
    return { id, username: input.username, role: input.role };
  }
  createUser(actor: Actor, input: unknown) {
    this.authorize(actor, 'admin');
    return this.transaction(() => {
      this.authorize(actor, 'admin');
      const user = this.insertUser(userSchema.parse(input));
      this.audit(actor, 'user.create', user.id);
      return user;
    });
  }
  users(actor: Actor) {
    this.authorize(actor, 'admin');
    return this.all(
      'SELECT id,username,role,disabled,created_at AS createdAt FROM users ORDER BY username COLLATE NOCASE,id'
    );
  }
  updateUser(actor: Actor, id: string, input: unknown) {
    this.authorize(actor, 'admin');
    const change = userUpdateSchema.parse(input);
    return this.transaction(() => {
      this.authorize(actor, 'admin');
      const target = requireValue(this.one('SELECT id,disabled FROM users WHERE id=?', id));
      if (
        change.disabled &&
        !target.disabled &&
        Number(this.one('SELECT count(*) AS count FROM users WHERE disabled=0')?.count) === 1
      )
        throw new DomainError(409, 'LAST_MANAGER', 'Keep at least one enabled manager');
      if (change.disabled !== undefined)
        this.run('UPDATE users SET disabled=? WHERE id=?', Number(change.disabled), id);
      if (change.password !== undefined)
        this.run('UPDATE users SET password_hash=? WHERE id=?', hashPassword(change.password), id);
      if (change.disabled !== undefined || change.password !== undefined)
        this.run('DELETE FROM sessions WHERE user_id=?', id);
      this.audit(actor, 'user.update', id);
      return this.one(
        'SELECT id,username,role,disabled,created_at AS createdAt FROM users WHERE id=?',
        id
      );
    });
  }
  login(username: string, password: string) {
    const bucket = hash(username.toLowerCase()),
      time = Date.now();
    this.run('DELETE FROM sessions WHERE expires_at<?', time);
    this.run('DELETE FROM login_attempts WHERE expires_at<?', time);
    if (
      Number(this.one('SELECT count FROM login_attempts WHERE username=?', bucket)?.count ?? 0) >=
      10
    )
      throw new DomainError(429, 'RATE_LIMIT', 'Too many attempts; retry after 15 minutes');
    this.run(
      'INSERT INTO login_attempts VALUES(?,1,?) ON CONFLICT(username) DO UPDATE SET count=count+1',
      bucket,
      time + 15 * 60 * 1000
    );
    const row = this.one('SELECT * FROM users WHERE username=? COLLATE NOCASE', username);
    // Always perform scrypt to avoid a fast user-enumeration path.
    const valid = verifyPassword(
      password,
      String(row?.password_hash ?? `${'0'.repeat(32)}:${'0'.repeat(128)}`)
    );
    if (!valid || !row || row.disabled)
      throw new DomainError(401, 'INVALID_LOGIN', 'Invalid username or password');
    this.run('DELETE FROM login_attempts WHERE username=?', bucket);
    const token = randomBytes(32).toString('base64url'),
      csrf = randomBytes(24).toString('base64url');
    this.run(
      'INSERT INTO sessions VALUES(?,?,?,?)',
      hash(token),
      String(row.id),
      csrf,
      time + config.sessionSeconds * 1000
    );
    return {
      token,
      csrf,
      user: { id: String(row.id), username: String(row.username), role: row.role as Role },
    };
  }
  session(token: string | undefined): { user: Actor; csrf: string } | undefined {
    if (!token || !/^[A-Za-z0-9_-]{43}$/.test(token)) return;
    const row = this.one(
      'SELECT u.id,u.username,u.role,s.csrf FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=? AND s.expires_at>? AND u.disabled=0',
      hash(token),
      Date.now()
    );
    if (row)
      return {
        user: { id: String(row.id), username: String(row.username), role: row.role as Role },
        csrf: String(row.csrf),
      };
  }
  logout(token: string) {
    this.run('DELETE FROM sessions WHERE token_hash=?', hash(token));
  }
  private revision(id: string, number: number): Revision {
    const row = requireValue(
      this.one(
        'SELECT snapshot,actor,created_at FROM revisions WHERE document_id=? AND number=?',
        id,
        number
      )
    );
    return {
      ...JSON.parse(String(row.snapshot)),
      number,
      actor: String(row.actor),
      createdAt: String(row.created_at),
    };
  }
  get(id: string, actor: Actor): Document {
    this.authorize(actor, 'read');
    return this.document(id);
  }
  private document(id: string): Document {
    const row = requireValue(this.one('SELECT * FROM documents WHERE id=?', id));
    return {
      id,
      revision: Number(row.head),
      publishedRevision: row.published === null ? null : Number(row.published),
      deleted: Boolean(row.deleted),
      draft: this.revision(id, Number(row.head)),
      published: row.published === null ? null : this.revision(id, Number(row.published)),
    };
  }
  list(actor: Actor, query: { page?: number; limit?: number; keyword?: string } = {}) {
    this.authorize(actor, 'read');
    const limit = Math.min(100, Math.max(1, query.limit ?? 10)),
      page = Math.max(1, query.page ?? 1);
    const rows = this.all(
      "SELECT d.id,json_extract(r.snapshot,'$.title') AS title,json_extract(r.snapshot,'$.path') AS path FROM documents d JOIN revisions r ON r.document_id=d.id AND r.number=d.head WHERE d.deleted=0"
    )
      .filter(
        (row) =>
          !query.keyword ||
          [row.title, row.path].some((value) =>
            String(value).toLowerCase().includes(query.keyword!.toLowerCase())
          )
      )
      .sort(
        (a, b) =>
          String(a.title).localeCompare(String(b.title), 'en', { numeric: true }) ||
          String(a.id).localeCompare(String(b.id))
      );

    return {
      data: rows
        .slice((page - 1) * limit, page * limit)
        .map((row) => this.document(String(row.id))),
      total: rows.length,
    };
  }
  translations(actor: Actor, id: string) {
    this.authorize(actor, 'read');
    const doc = this.document(id);
    return this.all(
      'SELECT id,locale FROM documents WHERE translation_key=? AND version=? AND deleted=0',
      doc.draft.translationKey,
      doc.draft.version
    ).map((row) => ({ id: String(row.id), locale: String(row.locale) }));
  }
  private replay<T>(
    actor: Actor,
    operationId: string,
    request: unknown
  ): { response: T } | undefined {
    const prior = this.one('SELECT * FROM operations WHERE id=?', operationId);
    if (!prior) return;
    if (prior.actor !== actor.id || prior.fingerprint !== hash(JSON.stringify(request)))
      throw new DomainError(
        409,
        'OPERATION_REUSED',
        'Operation ID already used with different input'
      );
    return { response: JSON.parse(String(prior.response)) as T };
  }
  replayPublish(actor: Actor, id: string, expected: number, operationId: string) {
    this.authorize(actor, 'publish');
    return this.replay<Document>(actor, operationId, { action: 'publish', id, expected });
  }
  private mutate<T>(actor: Actor, operationId: string, request: unknown, fn: () => T): T {
    const fingerprint = hash(JSON.stringify(request));
    return this.transaction(() => {
      this.authorize(actor, 'edit');
      const prior = this.replay<T>(actor, operationId, request);
      if (prior) return prior.response;
      const response = fn();
      this.run(
        'INSERT INTO operations VALUES(?,?,?,?,?)',
        operationId,
        actor.id,
        fingerprint,
        JSON.stringify(response),
        now()
      );
      return response;
    });
  }
  save(
    actor: Actor,
    id: string | undefined,
    input: DocumentInput,
    expected: number,
    operationId: string
  ) {
    this.authorize(actor, 'edit');
    const document = documentSchema.parse(input);
    return this.mutate(actor, operationId, { action: 'save', id, document, expected }, () => {
      const old = id ? this.document(id) : undefined;
      if ((old?.revision ?? 0) !== expected || old?.deleted)
        throw new DomainError(
          409,
          'REVISION_CONFLICT',
          'Document changed; compare with the latest revision'
        );
      if (
        old &&
        (old.draft.locale !== document.locale ||
          old.draft.version !== document.version ||
          old.draft.translationKey !== document.translationKey)
      )
        throw new DomainError(
          422,
          'IDENTITY_IMMUTABLE',
          'Locale, version and translation key are immutable'
        );
      if (
        !old &&
        this.one(
          'SELECT id FROM documents WHERE translation_key=? AND locale=? AND version=?',
          document.translationKey,
          document.locale,
          document.version
        )
      )
        throw new DomainError(409, 'TRANSLATION_EXISTS', 'This translation already exists');
      const currentId = id ?? randomUUID(),
        revision = expected + 1;
      if (!old)
        this.run(
          'INSERT INTO documents(id,translation_key,locale,version,created_at) VALUES(?,?,?,?,?)',
          currentId,
          document.translationKey,
          document.locale,
          document.version,
          now()
        );
      this.run(
        'INSERT INTO revisions VALUES(?,?,?,?,?)',
        currentId,
        revision,
        JSON.stringify(document),
        actor.id,
        now()
      );
      this.run('UPDATE documents SET head=? WHERE id=?', revision, currentId);
      const analysis = inspectMdx(document.mdx);
      for (const asset of analysis.assets)
        if (this.one('SELECT id FROM assets WHERE id=?', asset))
          this.run(
            'INSERT OR IGNORE INTO asset_references VALUES(?,?,?)',
            asset,
            currentId,
            revision
          );
      this.audit(actor, 'document.save', currentId);
      return { document: this.document(currentId), diagnostics: analysis.diagnostics };
    });
  }
  publish(
    actor: Actor,
    id: string,
    expected: number,
    operationId: string,
    validate?: (source: string) => void
  ) {
    this.authorize(actor, 'publish');
    return this.mutate(actor, operationId, { action: 'publish', id, expected }, () => {
      const doc = this.document(id);
      if (doc.revision !== expected || doc.deleted)
        throw new DomainError(409, 'REVISION_CONFLICT', 'Document changed');
      const analysis = inspectMdx(doc.draft.mdx);
      if (analysis.diagnostics.length)
        throw new DomainError(
          422,
          'INVALID_MDX',
          'Fix MDX errors before publishing',
          analysis.diagnostics
        );
      const frontmatter = splitSource(doc.draft.mdx).frontmatter;
      if (frontmatter.title !== undefined && frontmatter.title !== doc.draft.title)
        throw new DomainError(
          422,
          'FRONTMATTER_CONFLICT',
          'Frontmatter title must match the document title'
        );
      for (const asset of analysis.assets)
        if (!this.one('SELECT id FROM assets WHERE id=?', asset))
          throw new DomainError(422, 'MISSING_ASSET', 'Referenced attachment does not exist');
      validate?.(doc.draft.mdx);
      const collision = this.one(
        'SELECT document_id FROM routes WHERE locale=? AND version=? AND path=?',
        doc.draft.locale,
        doc.draft.version,
        doc.draft.path
      );
      if (collision && collision.document_id !== id)
        throw new DomainError(409, 'PATH_EXISTS', 'Another published document uses this path');
      this.run('DELETE FROM routes WHERE document_id=?', id);
      this.run(
        'INSERT INTO routes VALUES(?,?,?,?)',
        doc.draft.locale,
        doc.draft.version,
        doc.draft.path,
        id
      );
      this.run('UPDATE documents SET published=? WHERE id=?', expected, id);
      this.audit(actor, 'document.publish', id);
      return this.document(id);
    });
  }
  unpublish(actor: Actor, id: string, expected: number, operationId: string) {
    this.authorize(actor, 'publish');
    return this.mutate(actor, operationId, { action: 'unpublish', id, expected }, () => {
      const doc = this.document(id);
      if (doc.revision !== expected)
        throw new DomainError(409, 'REVISION_CONFLICT', 'Document changed');
      this.run('DELETE FROM routes WHERE document_id=?', id);
      this.run('UPDATE documents SET published=NULL WHERE id=?', id);
      this.audit(actor, 'document.unpublish', id);
      return this.document(id);
    });
  }
  remove(actor: Actor, id: string, expected: number, operationId: string) {
    this.authorize(actor, 'publish');
    return this.mutate(actor, operationId, { action: 'delete', id, expected }, () => {
      const doc = this.document(id);
      if (doc.revision !== expected)
        throw new DomainError(409, 'REVISION_CONFLICT', 'Document changed');
      this.run('DELETE FROM routes WHERE document_id=?', id);
      this.run('UPDATE documents SET deleted=1,published=NULL WHERE id=?', id);
      this.audit(actor, 'document.delete', id);
      return { deleted: true };
    });
  }
  history(actor: Actor, id: string) {
    this.authorize(actor, 'read');
    requireValue(this.one('SELECT id FROM documents WHERE id=?', id));
    return this.all(
      'SELECT number FROM revisions WHERE document_id=? ORDER BY number DESC',
      id
    ).map((row) => this.revision(id, Number(row.number)));
  }
  restore(actor: Actor, id: string, revision: number, expected: number, operationId: string) {
    this.authorize(actor, 'edit');
    const snapshot = this.revision(id, revision);
    const { number: _, actor: __, createdAt: ___, ...input } = snapshot;
    return this.save(actor, id, input, expected, operationId);
  }
  published(locale?: string) {
    return this.all(
      'SELECT d.id,d.published FROM documents d JOIN routes r ON r.document_id=d.id WHERE d.deleted=0 AND d.published IS NOT NULL'
    )
      .map((row) => ({
        id: String(row.id),
        ...this.revision(String(row.id), Number(row.published)),
      }))
      .filter((doc) => !locale || doc.locale === locale)
      .sort(
        (a, b) =>
          a.order - b.order ||
          a.title.localeCompare(b.title, 'en', { numeric: true }) ||
          a.id.localeCompare(b.id)
      );
  }
  publicPage(locale: string, route: string) {
    const row = this.one(
      'SELECT document_id FROM routes WHERE locale=? AND version=? AND path=?',
      locale,
      'latest',
      route
    );
    if (!row) return;
    const doc = this.document(String(row.document_id));
    return doc.published ? { id: doc.id, ...doc.published } : undefined;
  }
  upload(actor: Actor, name: string, mime: string, bytes: Buffer) {
    this.authorize(actor, 'edit');
    if (bytes.length > config.maxUploadBytes)
      throw new DomainError(413, 'UPLOAD_TOO_LARGE', 'Attachments are limited to 5 MiB');
    const png = bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
    const jpeg = bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
    const webp =
      bytes.subarray(0, 4).toString() === 'RIFF' && bytes.subarray(8, 12).toString() === 'WEBP';
    const pdf = bytes.subarray(0, 5).toString() === '%PDF-';
    if (!(
      (mime === 'image/png' && png) ||
      (mime === 'image/jpeg' && jpeg) ||
      (mime === 'image/webp' && webp) ||
      (mime === 'application/pdf' && pdf)
    ))
      throw new DomainError(422, 'UNSUPPORTED_MEDIA', 'Only PNG, JPEG, WebP and PDF are supported');
    const id = randomUUID(),
      filename =
        path
          .basename(name)
          .replace(/[\r\n\u0000-\u001f]/g, '')
          .slice(0, 180) || 'attachment';
    return this.transaction(() => {
      this.authorize(actor, 'edit');
      this.run(
        'INSERT INTO assets VALUES(?,?,?,?,?,?,?)',
        id,
        filename,
        mime,
        bytes,
        hash(bytes),
        actor.id,
        now()
      );
      this.audit(actor, 'asset.upload', id);
      return {
        id,
        name: filename,
        mime,
        size: bytes.length,
        url: `${basePath}/api/v1/assets/${id}`,
      };
    });
  }
  assets(actor: Actor) {
    this.authorize(actor, 'read');
    return this.all(
      'SELECT id,name,mime,length(bytes) AS size,created_at AS createdAt FROM assets ORDER BY created_at DESC,id'
    );
  }
  asset(id: string, actor?: Actor) {
    if (actor) this.authorize(actor, 'read');
    else if (
      !this.one(
        'SELECT r.asset_id FROM asset_references r JOIN documents d ON d.id=r.document_id AND d.published=r.revision WHERE r.asset_id=? AND d.deleted=0 LIMIT 1',
        id
      )
    )
      throw new DomainError(404, 'NOT_FOUND', 'Not found');
    return requireValue(this.one('SELECT * FROM assets WHERE id=?', id));
  }
  deleteAsset(actor: Actor, id: string) {
    this.authorize(actor, 'edit');
    return this.transaction(() => {
      this.authorize(actor, 'edit');
      if (this.one('SELECT asset_id FROM asset_references WHERE asset_id=? LIMIT 1', id))
        throw new DomainError(409, 'ASSET_IN_USE', 'Attachment is referenced by a saved revision');
      const result = this.run('DELETE FROM assets WHERE id=?', id);
      if (!result.changes) throw new DomainError(404, 'NOT_FOUND', 'Not found');
      this.audit(actor, 'asset.delete', id);
      return { deleted: true };
    });
  }
  preview(actor: Actor, source: string, title: string) {
    return this.transaction(() => {
      this.authorize(actor, 'read');
      this.run('DELETE FROM previews WHERE expires_at<?', Date.now());
      const id = randomUUID();
      this.run(
        'INSERT INTO previews VALUES(?,?,?,?,?)',
        id,
        actor.id,
        source,
        title,
        Date.now() + 10 * 60 * 1000
      );
      return { url: `${basePath}/preview/${id}` };
    });
  }
  readPreview(actor: Actor, id: string) {
    this.authorize(actor, 'read');
    return requireValue(
      this.one(
        'SELECT source,title FROM previews WHERE id=? AND actor=? AND expires_at>?',
        id,
        actor.id,
        Date.now()
      )
    );
  }
  auditLog(actor: Actor) {
    this.authorize(actor, 'admin');
    return this.all('SELECT * FROM audit ORDER BY id DESC LIMIT 200');
  }
  export(actor: Actor) {
    this.authorize(actor, 'read');
    return {
      format: 'dsdocs',
      version: 1,
      exportedAt: now(),
      documents: this.all('SELECT id FROM documents WHERE deleted=0').map((row) =>
        this.document(String(row.id))
      ),
    };
  }
}
let singleton: Store | undefined;
export function getStore() {
  return (singleton ??= new Store(config.database));
}
