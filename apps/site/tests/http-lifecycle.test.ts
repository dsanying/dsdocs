import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { Store } from '../src/core/store';
import { handleApi } from '../src/core/http';

const origin = 'http://localhost:3200';
test('HTTP lifecycle dispatches every management endpoint and preserves publication boundaries', async () => {
  const store = new Store(':memory:');
  const password = randomBytes(24).toString('base64url');
  store.bootstrap('administrator', password);
  let headers: Record<string, string> = {};
  const call = (route: string, method = 'GET', body?: unknown) =>
    handleApi(
      new Request(`${origin}/docs/api/v1/${route}`, {
        method,
        headers: { Origin: origin, 'Content-Type': 'application/json', ...headers },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      }),
      route.split('?')[0].split('/'),
      store
    );
  const mutation = (expectedRevision: number) => ({ expectedRevision, operationId: randomUUID() });
  try {
    assert.deepEqual(await (await call('session')).json(), { user: null });
    const login = await call('login', 'POST', { username: 'administrator', password });
    headers = {
      cookie: login.headers.get('set-cookie')!.split(';')[0],
      'x-csrf-token': (await login.json()).csrf,
    };
    assert.equal((await (await call('session')).json()).user.username, 'administrator');
    assert.ok(Object.keys(await (await call('components')).json()).includes('Tabs'));
    assert.deepEqual(await (await call('search')).json(), []);
    assert.equal((await call('validate', 'POST', { source: '## Valid\n\nContent.' })).status, 200);
    const preview = await call('preview', 'POST', {
      source: '## Private\n\nPreview.',
      title: 'Preview',
    });
    assert.equal(preview.status, 200);
    assert.match((await preview.json()).url, /\/preview\//);
    const input = {
      title: 'Page',
      path: 'old-path',
      description: 'Unique description',
      locale: 'en',
      version: 'latest',
      translationKey: 'page',
      group: 'Guide',
      order: 0,
      mdx: '## Content\n\nPublished token.',
    };
    const created = await call('documents', 'POST', { ...mutation(0), document: input });
    assert.equal(created.status, 201);
    const id = (await created.json()).document.id;
    assert.equal((await (await call('documents?page=1&limit=1&keyword=old-path')).json()).total, 1);
    assert.equal((await (await call(`documents/${id}`)).json()).draft.title, 'Page');
    assert.equal((await (await call(`documents/${id}/translations`)).json()).length, 1);
    assert.equal((await (await call(`documents/${id}/revisions`)).json()).length, 1);
    const publication = mutation(1);
    assert.equal((await call(`documents/${id}/publish`, 'POST', publication)).status, 200);
    const update = await call(`documents/${id}`, 'PUT', {
      ...mutation(1),
      document: { ...input, path: 'new-path', group: 'Renamed', mdx: '## New\n\nPrivate token.' },
    });
    assert.equal(update.status, 200);
    assert.equal((await call(`documents/${id}/publish`, 'POST', mutation(1))).status, 409);
    assert.equal((await call(`documents/${id}/publish`, 'POST', publication)).status, 200);
    assert.equal((await (await call('search?locale=en&query=Published')).json()).length, 1);
    assert.equal(
      (await (await call('search?locale=en&query=%20%20Published%20%20')).json()).length,
      1,
      'Search ignores surrounding whitespace'
    );
    assert.deepEqual(await (await call('search?locale=en&query=%20%20')).json(), []);
    assert.deepEqual(await (await call('search?locale=en&query=Private')).json(), []);
    assert.equal(
      (await call(`documents/${id}/restore`, 'POST', { ...mutation(2), revision: 1 })).status,
      200
    );
    assert.equal((await (await call(`documents/${id}/revisions`)).json()).length, 3);
    assert.equal((await call(`documents/${id}/unpublish`, 'POST', mutation(3))).status, 200);
    assert.deepEqual(await (await call('search?locale=en&query=Published')).json(), []);
    assert.equal((await call(`documents/${id}`, 'DELETE', mutation(3))).status, 200);
    assert.equal((await (await call('documents')).json()).total, 0);
    const asset = await call('assets', 'POST', {
      name: 'sample.pdf',
      mime: 'application/pdf',
      data: Buffer.from('%PDF-1.4\n%%EOF').toString('base64'),
    });
    const assetId = (await asset.json()).id;
    assert.equal((await (await call('assets')).json()).length, 1);
    assert.match(
      (await call(`assets/${assetId}`)).headers.get('content-disposition')!,
      /^attachment;/
    );
    assert.equal((await call(`assets/${assetId}`, 'DELETE')).status, 200);
    assert.deepEqual(await (await call('assets')).json(), []);
    const user = await call('users', 'POST', { username: 'second-manager', password });
    assert.equal(user.status, 201);
    const userId = (await user.json()).id;
    assert.equal((await (await call('users')).json()).length, 2);
    assert.equal((await call(`users/${userId}`, 'PATCH', { disabled: true })).status, 200);
    assert.ok((await (await call('audit')).json()).length > 0);
    assert.equal((await call('export')).status, 200);
    assert.equal((await call('not-an-endpoint')).status, 404);
    assert.equal((await call(`documents/${id}`, 'PATCH', {})).status, 404);
    assert.equal((await call('logout', 'POST', {})).status, 200);
    assert.equal((await call('users')).status, 401);
  } finally {
    store.close();
  }
});

test('HTTP rejects malformed formats and oversized streams without persistence or secret exposure', async () => {
  const store = new Store(':memory:');
  const request = (body: string | undefined, contentType: string) =>
    handleApi(
      new Request(`${origin}/docs/api/v1/login`, {
        method: 'POST',
        headers: { Origin: origin, 'Content-Type': contentType },
        body,
      }),
      ['login'],
      store
    );
  try {
    assert.equal((await request('{}', 'text/plain')).status, 415);
    assert.equal((await request(undefined, 'application/json')).status, 400);
    assert.equal((await request('{malformed', 'application/json')).status, 400);
    assert.equal((await request(' '.repeat(512 * 1024 + 1), 'application/json')).status, 413);
    assert.equal(store.one('SELECT count(*) AS total FROM users')!.total, 0);
    assert.equal(
      (
        await handleApi(
          new Request(`${origin}/docs/api/v1/search?locale=unknown`),
          ['search'],
          store
        )
      ).status,
      422
    );
  } finally {
    store.close();
  }
});
