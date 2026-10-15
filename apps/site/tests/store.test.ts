import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { Store } from '../src/core/store';
import type { DocumentInput } from '../src/core/model';
import { DomainError } from '../src/core/errors';
const password = () => randomBytes(24).toString('base64url');
const document = (overrides: Partial<DocumentInput> = {}): DocumentInput => ({
  title: 'Getting started',
  description: 'Start here',
  path: 'start',
  locale: 'en',
  version: 'latest',
  translationKey: 'start',
  group: 'Guides/API',
  order: 0,
  mdx: '## Connect\n\nHello.',
  ...overrides,
});
function fixture() {
  const store = new Store(':memory:');
  const admin = store.bootstrap('administrator', password());
  return { store, admin };
}
const code = (value: string) => (error: unknown) =>
  error instanceof DomainError && error.code === value;
test('published snapshot does not change when saving a newer draft', () => {
  const { store, admin } = fixture();
  try {
    const first = store.save(admin, undefined, document(), 0, randomUUID()).document;
    store.publish(admin, first.id, 1, randomUUID());
    store.save(
      admin,
      first.id,
      document({ title: 'Secret draft', path: 'secret', mdx: 'Do not disclose' }),
      1,
      randomUUID()
    );
    assert.equal(store.publicPage('en', 'start')?.title, 'Getting started');
    assert.equal(store.publicPage('en', 'secret'), undefined);
    assert.equal(store.published()[0].mdx, '## Connect\n\nHello.');
  } finally {
    store.close();
  }
});
test('optimistic save rejects stale writes and idempotency returns the same result', () => {
  const { store, admin } = fixture();
  try {
    const op = randomUUID(),
      input = document();
    const first = store.save(admin, undefined, input, 0, op);
    assert.deepEqual(store.save(admin, undefined, input, 0, op), first);
    assert.throws(
      () => store.save(admin, undefined, document({ title: 'Different' }), 0, op),
      code('OPERATION_REUSED')
    );
    store.save(admin, first.document.id, input, 1, randomUUID());
    assert.throws(
      () => store.save(admin, first.document.id, input, 1, randomUUID()),
      code('REVISION_CONFLICT')
    );
  } finally {
    store.close();
  }
});
test('publish path collision is atomic; changing title does not change a stable path', () => {
  const { store, admin } = fixture();
  try {
    const a = store.save(admin, undefined, document(), 0, randomUUID()).document;
    store.publish(admin, a.id, 1, randomUUID());
    const b = store.save(
      admin,
      undefined,
      document({ translationKey: 'another' }),
      0,
      randomUUID()
    ).document;
    assert.throws(() => store.publish(admin, b.id, 1, randomUUID()), code('PATH_EXISTS'));
    assert.equal(store.get(b.id, admin).publishedRevision, null);
    store.save(admin, a.id, document({ title: 'Renamed' }), 1, randomUUID());
    store.publish(admin, a.id, 2, randomUUID());
    assert.equal(store.publicPage('en', 'start')?.title, 'Renamed');
  } finally {
    store.close();
  }
});
test('restoring history creates a new draft; it never silently republishes', () => {
  const { store, admin } = fixture();
  try {
    const first = store.save(admin, undefined, document(), 0, randomUUID()).document;
    store.publish(admin, first.id, 1, randomUUID());
    store.save(admin, first.id, document({ mdx: 'New' }), 1, randomUUID());
    store.publish(admin, first.id, 2, randomUUID());
    const restored = store.restore(admin, first.id, 1, 2, randomUUID());
    assert.equal(restored.document.revision, 3);
    assert.equal(store.publicPage('en', 'start')?.mdx, 'New');
    assert.equal(restored.document.draft.mdx, '## Connect\n\nHello.');
  } finally {
    store.close();
  }
});
test('enabled managers have equal access and forged identities fail', () => {
  const { store, admin } = fixture();
  try {
    const manager = store.createUser(admin, { username: 'manager', password: password() });
    const first = store.save(manager, undefined, document(), 0, randomUUID()).document;
    store.publish(manager, first.id, 1, randomUUID());
    assert.equal(store.users(manager).length, 2);
    assert.throws(
      () => store.save({ ...manager, id: randomUUID() }, first.id, document(), 1, randomUUID()),
      code('FORBIDDEN')
    );
  } finally {
    store.close();
  }
});
test('account access and password changes revoke all sessions; last manager is protected', () => {
  const { store, admin } = fixture();
  try {
    const pass = password(),
      other = store.createUser(admin, { username: 'another', password: pass });
    const old = store.login('another', pass);
    store.updateUser(admin, other.id, { disabled: true });
    assert.equal(store.session(old.token), undefined);
    assert.throws(() => store.login('another', pass), code('INVALID_LOGIN'));
    assert.throws(
      () => store.save(other, undefined, document(), 0, randomUUID()),
      code('FORBIDDEN')
    );
    assert.throws(
      () => store.updateUser(admin, admin.id, { disabled: true }),
      code('LAST_MANAGER')
    );
    store.updateUser(admin, other.id, { disabled: false });
    const next = store.login('another', pass),
      replacement = password();
    store.updateUser(admin, other.id, { password: replacement });
    assert.equal(store.session(next.token), undefined);
    assert.throws(() => store.login('another', pass), code('INVALID_LOGIN'));
    assert.equal(store.login('another', replacement).user.id, other.id);
    assert.throws(() => store.updateUser(admin, other.id, { role: 'reader' }));
  } finally {
    store.close();
  }
});

test('invalid MDX can be saved as draft but never published', () => {
  const { store, admin } = fixture();
  try {
    const saved = store.save(
      admin,
      undefined,
      document({ mdx: '{process.env.SECRET}' }),
      0,
      randomUUID()
    );
    assert.ok(saved.diagnostics.length);
    assert.throws(
      () => store.publish(admin, saved.document.id, 1, randomUUID()),
      code('INVALID_MDX')
    );
    assert.equal(store.published().length, 0);
  } finally {
    store.close();
  }
});
test('unpublish removes public routes and delete never leaks a previous snapshot', () => {
  const { store, admin } = fixture();
  try {
    const doc = store.save(admin, undefined, document(), 0, randomUUID()).document;
    store.publish(admin, doc.id, 1, randomUUID());
    store.unpublish(admin, doc.id, 1, randomUUID());
    assert.equal(store.publicPage('en', 'start'), undefined);
    store.publish(admin, doc.id, 1, randomUUID());
    store.remove(admin, doc.id, 1, randomUUID());
    assert.equal(store.published().length, 0);
    assert.equal(store.list(admin).total, 0);
  } finally {
    store.close();
  }
});
test('attachments are private until published; historical references prevent deletion', () => {
  const { store, admin } = fixture();
  try {
    const bytes = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
    const image = store.upload(admin, 'image.png', 'image/png', bytes);
    assert.throws(() => store.asset(image.id), code('NOT_FOUND'));
    const doc = store.save(
      admin,
      undefined,
      document({ mdx: `![Example](${image.url})` }),
      0,
      randomUUID()
    ).document;
    store.publish(admin, doc.id, 1, randomUUID());
    assert.equal(store.asset(image.id).id, image.id);
    assert.throws(() => store.deleteAsset(admin, image.id), code('ASSET_IN_USE'));
    store.unpublish(admin, doc.id, 1, randomUUID());
    assert.throws(() => store.asset(image.id), code('NOT_FOUND'));
    assert.throws(
      () => store.upload(admin, 'x.png', 'image/png', Buffer.from('<script>')),
      code('UNSUPPORTED_MEDIA')
    );
  } finally {
    store.close();
  }
});
test('sessions expire on logout, credentials are hashed, login throttling persists in DB', () => {
  const store = new Store(':memory:'),
    pass = password();
  try {
    store.bootstrap('administrator', pass);
    const login = store.login('administrator', pass);
    assert.equal(store.session(login.token)?.user.username, 'administrator');
    assert.ok(!JSON.stringify(store.all('SELECT * FROM users')).includes(pass));
    store.logout(login.token);
    assert.equal(store.session(login.token), undefined);
    for (let i = 0; i < 10; i++)
      assert.throws(() => store.login('missing', 'wrong'), code('INVALID_LOGIN'));
    assert.throws(() => store.login('missing', 'wrong'), code('RATE_LIMIT'));
  } finally {
    store.close();
  }
});

test('translation lookup links different paths and excludes deleted translations', () => {
  const { store, admin } = fixture();
  try {
    const zh = store.save(
      admin,
      undefined,
      document({ locale: 'zh', path: 'kai-shi', translationKey: 'pair' }),
      0,
      randomUUID()
    ).document;
    const en = store.save(
      admin,
      undefined,
      document({ locale: 'en', path: 'start-here', translationKey: 'pair' }),
      0,
      randomUUID()
    ).document;
    assert.deepEqual(
      store
        .translations(admin, zh.id)
        .map((item) => item.id)
        .sort(),
      [zh.id, en.id].sort()
    );
    store.remove(admin, en.id, 1, randomUUID());
    assert.deepEqual(store.translations(admin, zh.id), [{ id: zh.id, locale: 'zh' }]);
    assert.throws(
      () => store.translations({ ...admin, id: randomUUID() }, zh.id),
      code('FORBIDDEN')
    );
  } finally {
    store.close();
  }
});

test('v1 migration preserves managers and disables legacy readers without elevating their access', async () => {
  const { mkdtempSync, rmSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const path = await import('node:path');
  const directory = mkdtempSync(path.join(tmpdir(), 'dsdocs-migration-')),
    file = path.join(directory, 'db.sqlite');
  let store = new Store(file);
  try {
    const admin = store.bootstrap('administrator', password()),
      reader = store.createUser(admin, { username: 'legacy-reader', password: password() }),
      editor = store.createUser(admin, { username: 'legacy-editor', password: password() });
    store.run("UPDATE users SET role='reader' WHERE id=?", reader.id);
    store.run("UPDATE users SET role='editor' WHERE id=?", editor.id);
    store.db.exec('PRAGMA user_version=1');
    store.close();
    store = new Store(file);
    assert.equal(store.one('SELECT role FROM users WHERE id=?', editor.id)?.role, 'admin');
    assert.equal(store.one('SELECT disabled FROM users WHERE id=?', reader.id)?.disabled, 1);
    assert.throws(() => store.authorize(reader, 'read'), code('FORBIDDEN'));
    assert.doesNotThrow(() => store.authorize(editor, 'admin'));
    assert.doesNotThrow(() => store.authorize(admin, 'admin'));
  } finally {
    store.close();
    rmSync(directory, { recursive: true, force: true });
  }
});

test('list paginates naturally sorted metadata before loading document bodies', () => {
  const { store, admin } = fixture();
  try {
    for (let index = 12; index >= 1; index--)
      store.save(
        admin,
        undefined,
        document({
          title: `Document ${index}`,
          path: `page-${index}`,
          translationKey: `page-${index}`,
          mdx: 'Large body. '.repeat(1000),
        }),
        0,
        randomUUID()
      );
    const original = store.one.bind(store);
    let snapshotReads = 0;
    store.one = (sql, ...args) => {
      if (sql.includes('snapshot')) snapshotReads++;
      return original(sql, ...args);
    };
    const result = store.list(admin, { page: 2, limit: 5 });
    assert.equal(result.total, 12);
    assert.deepEqual(
      result.data.map((doc) => doc.draft.title),
      ['Document 6', 'Document 7', 'Document 8', 'Document 9', 'Document 10']
    );
    assert.equal(snapshotReads, 5);
    assert.equal(store.list(admin, { keyword: 'page-12' }).data[0].draft.title, 'Document 12');
  } finally {
    store.close();
  }
});
test('preview source is owner-bound, expires, and requires current account access', () => {
  const { store, admin } = fixture();
  try {
    const other = store.createUser(admin, { username: 'another', password: password() }),
      preview = store.preview(admin, 'Private source', 'Preview'),
      id = preview.url.split('/').at(-1)!;
    assert.equal(store.readPreview(admin, id).source, 'Private source');
    assert.throws(() => store.readPreview(other, id), code('NOT_FOUND'));
    store.run('UPDATE previews SET expires_at=0 WHERE id=?', id);
    assert.throws(() => store.readPreview(admin, id), code('NOT_FOUND'));
    store.updateUser(other, admin.id, { disabled: true });
    assert.throws(() => store.preview(admin, 'Private', 'Disabled'), code('FORBIDDEN'));
  } finally {
    store.close();
  }
});
