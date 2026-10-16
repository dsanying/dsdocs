import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createIdentityProvider, identityMiddleware } from '../server/identity.mjs';
import { createServer } from 'node:http';

test('account adapter limits scope and fails closed on incomplete creation', async () => {
  const calls = [];
  const fetcher = async (url, options) => {
    calls.push({
      path: url.pathname + url.search,
      method: options.method,
      body: options.body && JSON.parse(options.body),
    });
    let data = {};
    if (url.pathname.endsWith('/core/users/'))
      data = {
        results: [
          { pk: 1, username: 'local', path: 'dsdocs', type: 'internal', is_active: true },
          { pk: 2, username: 'other', path: 'external', type: 'internal' },
        ],
        pagination: { next: null },
      };
    if (url.pathname.endsWith('/core/users/2/'))
      data = { pk: 2, path: 'external', type: 'internal' };
    if (url.pathname.endsWith('/core/users/1/'))
      data = { pk: 1, username: 'local', path: 'dsdocs', type: 'internal' };
    if (url.pathname.endsWith('/core/groups/'))
      data = { results: [{ pk: 'editors-group', name: 'editors' }] };
    if (options.method === 'POST' && url.pathname.endsWith('/core/users/')) data = { pk: 3 };
    if (url.pathname.endsWith('/set_password/')) return new Response('{}', { status: 503 });
    return Response.json(data);
  };
  const api = createIdentityProvider({ url: 'http://identity.local', token: 'test-only', fetcher });
  assert.equal((await api.list()).length, 1);
  await assert.rejects(api.setActive(2, false, 'local'), /只能修改/);
  await assert.rejects(api.setActive('../x', false, 'local'), /标识/);
  await assert.rejects(api.setActive(1, false, 'local'), /当前登录/);
  await assert.rejects(
    api.create({
      username: 'test',
      name: 'Test',
      email: 'test@example.org',
      password: 'long-test-password',
    }),
    /账号服务请求失败/
  );
  const creation = calls.find((c) => c.method === 'POST' && c.path === '/api/v3/core/users/');
  assert.equal(creation.body.is_active, false);
  assert.ok(!calls.some((c) => c.path.endsWith('/add_user/')));
});

test('identity module can be absent; enabled endpoints reject anonymous, CSRF and malformed input', async () => {
  for (const enabled of [false, true]) {
    const env = enabled
      ? {
          DSDOCS_IDENTITY_API_URL: 'http://127.0.0.1:1',
          DSDOCS_IDENTITY_API_TOKEN: 'test-only',
          DSDOCS_MANAGEMENT_ORIGIN: 'http://allowed.local',
        }
      : {};
    const middleware = identityMiddleware(env);
    const server = createServer(
      (req, res) =>
        void middleware(req, res, () => {
          res.writeHead(404);
          res.end();
        })
    );
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    try {
      const url = `http://127.0.0.1:${server.address().port}/__dsdocs_accounts`;
      assert.deepEqual(await (await fetch(url + '/capabilities')).json(), { enabled });
      assert.equal((await fetch(url)).status, enabled ? 401 : 503);
      if (enabled) {
        assert.equal(
          (
            await fetch(url, {
              method: 'POST',
              headers: {
                'X-Authentik-Username': 'test',
                'Content-Type': 'application/json',
                Origin: 'http://allowed.local',
              },
              body: ' '.repeat(5000),
            })
          ).status,
          413
        );
        assert.equal(
          (
            await fetch(url, {
              method: 'POST',
              headers: {
                'X-Authentik-Username': 'test',
                'Content-Type': 'application/json',
                Origin: 'http://allowed.local',
              },
              body: 'null',
            })
          ).status,
          400
        );

        assert.equal(
          (
            await fetch(url, {
              method: 'POST',
              headers: {
                'X-Authentik-Username': 'test',
                'Content-Type': 'application/json',
                Origin: 'http://wrong.local',
              },
              body: '{}',
            })
          ).status,
          403
        );
        assert.equal(
          (
            await fetch(url, {
              method: 'POST',
              headers: {
                'X-Authentik-Username': 'test',
                'Content-Type': 'application/json',
                Origin: 'http://allowed.local',
              },
              body: '{',
            })
          ).status,
          400
        );
        assert.equal(
          (await fetch(url, { headers: { 'X-Authentik-Username': 'test' } })).status,
          502
        );
      }
    } finally {
      await new Promise((resolve) => server.close(resolve));
    }
  }
});

test('pagination reads later pages, excludes foreign accounts, and bounds traversal', async () => {
  const pages = [];
  const api = createIdentityProvider({
    url: 'https://identity.local',
    token: 'test-only',
    fetcher: async (url) => {
      const page = Number(url.searchParams.get('page'));
      pages.push(page);
      return Response.json({
        results: [
          { pk: page, username: `local${page}`, path: 'dsdocs', type: 'internal' },
          { pk: 99, path: 'dsdocs/other', type: 'internal' },
        ],
        pagination: { next: page < 3 ? page + 1 : null },
      });
    },
  });
  assert.equal((await api.list()).length, 3);
  assert.deepEqual(pages, [1, 2, 3]);
  const endless = createIdentityProvider({
    url: 'https://identity.local',
    token: 'test-only',
    fetcher: async () => Response.json({ results: [], pagination: { next: 1 } }),
  });
  await assert.rejects(endless.list(), /分页上限/);
});

test('enable restores editor membership before enabling and never enables after membership failure', async () => {
  const calls = [];
  const api = createIdentityProvider({
    url: 'https://identity.local',
    token: 'test-only',
    fetcher: async (url, options) => {
      calls.push([url.pathname, options.method]);
      if (url.pathname.endsWith('/core/groups/'))
        return Response.json({ results: [{ pk: 'group', name: 'editors' }] });
      if (url.pathname.endsWith('/add_user/')) return new Response(null, { status: 403 });
      return Response.json({ pk: 1, username: 'editor', path: 'dsdocs', type: 'internal' });
    },
  });
  await assert.rejects(api.setActive(1, true, 'other'), /账号服务请求失败/);
  assert.ok(!calls.some(([, method]) => method === 'PATCH'));
});
