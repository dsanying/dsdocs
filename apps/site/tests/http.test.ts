import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { Store } from '../src/core/store';
import { unzipSync } from 'fflate';
import { handleApi } from '../src/core/http';
const origin = 'http://localhost:3200';
test('HTTP enforces same origin, CSRF, limits and authenticated draft access', async () => {
  const store = new Store(':memory:'),
    password = randomBytes(24).toString('base64url');
  store.bootstrap('administrator', password);
  const call = (
    route: string,
    method = 'GET',
    body?: unknown,
    headers: Record<string, string> = {}
  ) =>
    handleApi(
      new Request(`${origin}/docs/api/v1/${route}`, {
        method,
        headers: { 'Content-Type': 'application/json', origin, ...headers },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      }),
      route.split('?')[0].split('/'),
      store
    );
  try {
    assert.equal((await call('documents')).status, 401);
    const cross = await call(
      'login',
      'POST',
      { username: 'administrator', password },
      { origin: 'https://evil.example' }
    );
    assert.equal(cross.status, 403);
    const login = await call('login', 'POST', { username: 'administrator', password });
    assert.equal(login.status, 200);
    const cookie = login.headers.get('set-cookie')!.split(';')[0],
      session = await login.json();
    assert.match(login.headers.get('set-cookie')!, /HttpOnly; SameSite=Strict/);
    const headers = { cookie, 'x-csrf-token': session.csrf };
    assert.equal((await call('logout', 'POST', {}, { cookie })).status, 403);
    const attachment = await call(
      'assets',
      'POST',
      {
        name: "note's.png",
        mime: 'image/png',
        data: Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]).toString('base64'),
      },
      headers
    );
    assert.equal(attachment.status, 201);
    const attachmentId = (await attachment.json()).id;
    const download = await call(`assets/${attachmentId}`, 'GET', undefined, headers);
    assert.equal(
      download.headers.get('content-disposition'),
      "inline; filename*=UTF-8''note%27s.png"
    );

    const document = {
      title: 'Page',
      description: '',
      path: 'page',
      locale: 'en',
      version: 'latest',
      translationKey: 'page',
      group: '',
      order: 0,
      mdx: '## Heading\n\nContent.',
    };
    const saved = await call(
      'documents',
      'POST',
      { document, expectedRevision: 0, operationId: randomUUID() },
      headers
    );
    assert.equal(saved.status, 201);
    const id = (await saved.json()).document.id;
    assert.equal((await call(`documents/${id}`)).status, 401);
    assert.deepEqual(await (await call('search?locale=en&query=Content')).json(), []);
    const publication = { expectedRevision: 1, operationId: randomUUID() };
    assert.equal((await call(`documents/${id}/publish`, 'POST', publication, headers)).status, 200);
    assert.equal(
      (
        await call(
          `documents/${id}`,
          'PUT',
          {
            document: { ...document, mdx: '{process.env.SECRET}' },
            expectedRevision: 1,
            operationId: randomUUID(),
          },
          headers
        )
      ).status,
      200
    );
    // A retry must return the successful publication even after a newer invalid draft exists.
    const replay = await call(`documents/${id}/publish`, 'POST', publication, headers);
    assert.equal(replay.status, 200);
    assert.equal((await replay.json()).publishedRevision, 1);
    assert.equal((await (await call('search?locale=en&query=Content')).json()).length, 1);
    assert.equal((await call('export/files')).status, 401);
    const archive = await call('export/files', 'GET', undefined, headers);
    assert.equal(archive.status, 200);
    assert.equal(archive.headers.get('content-type'), 'application/zip');
    const exported = unzipSync(new Uint8Array(await archive.arrayBuffer())),
      exportedSource = Buffer.from(exported['content/docs/en/page.mdx']).toString();
    assert.match(exportedSource, /title: Page/);
    assert.ok(!exportedSource.includes('process.env.SECRET'));
    const validate = await call('validate', 'POST', { source: '{process.env.SECRET}' }, headers);
    assert.equal(validate.status, 200);
    assert.ok((await validate.json()).diagnostics.length);
    const bad = await call(
      'documents',
      'POST',
      { document: { ...document, role: 'admin' }, expectedRevision: 0, operationId: randomUUID() },
      headers
    );
    assert.equal(bad.status, 422);
    assert.equal((await call('logout', 'POST', {}, headers)).status, 200);
    assert.equal((await call('documents', 'GET', undefined, headers)).status, 401);
  } finally {
    store.close();
  }
});

test('HTTPS origin normalization always produces Secure session cookies', async () => {
  const { config } = await import('../src/core/config');
  const previous = config.origin,
    store = new Store(':memory:'),
    password = randomBytes(24).toString('hex');
  try {
    config.origin = 'HTTPS://EXAMPLE.COM';
    store.bootstrap('administrator', password);
    const response = await handleApi(
      new Request('https://example.com/docs/api/v1/login', {
        method: 'POST',
        headers: { Origin: 'https://example.com', 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: 'administrator', password }),
      }),
      ['login'],
      store
    );
    assert.equal(response.status, 200);
    assert.match(response.headers.get('set-cookie')!, /; Secure/);
  } finally {
    config.origin = previous;
    store.close();
  }
});
