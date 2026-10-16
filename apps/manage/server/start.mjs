import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { createProxyServer, proxyUpgrade } from 'httpxy';
import { fromNodeHeaders } from 'better-auth/node';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { createAccounts } from './accounts.mjs';
import { accountPage } from './pages.mjs';
import { createContentAPI } from './content.mjs';
import { dataDirectory } from '../../../packages/content/store.mjs';
const fail = (status, message) => Object.assign(new Error(message), { status });
export async function startManagement(env = process.env) {
  const port = Number(env.DSDOCS_PORT ?? 5182),
    host = env.DSDOCS_HOST ?? '127.0.0.1';
  const origin = new URL(env.DSDOCS_URL ?? `http://127.0.0.1:${port}`).origin;
  const mode = env.DSDOCS_AUTH ?? 'local';
  if (!['local', 'none'].includes(mode)) throw new Error('DSDOCS_AUTH 只能为 local 或 none。');
  const accounts =
    mode === 'local'
      ? await createAccounts({
          directory: path.resolve(
            env.DSDOCS_AUTH_DATA_DIR ??
              path.join(env.DSDOCS_DATA_DIR ?? dataDirectory(), 'accounts')
          ),
          origin,
        })
      : null;
  const content = await createContentAPI(
    env.DSDOCS_DATA_DIR ?? dataDirectory(),
    env.DSDOCS_STARTER ?? 'guide'
  );
  const development = env.DSDOCS_DEV === '1';
  const vite = development
    ? await (
        await import('vite')
      ).createServer({
        root: fileURLToPath(new URL('../', import.meta.url)),
        configFile: fileURLToPath(new URL('../vite.config.ts', import.meta.url)),
        server: { host: '127.0.0.1', port: 0, strictPort: false },
      })
    : null;
  if (vite) await vite.listen();
  const target = vite ? `http://127.0.0.1:${vite.httpServer.address().port}` : null;
  const proxy = target ? createProxyServer({ target }) : null;
  const sockets = new Set();
  const closeUser = (id) => {
    for (const item of sockets)
      if (item.userId === id) {
        item.downstream.destroy();
        item.upstream?.destroy();
      }
  };
  const closeSession = (id) => {
    for (const item of sockets)
      if (item.sessionId === id) {
        item.downstream.destroy();
        item.upstream?.destroy();
      }
  };
  const session = async (req) =>
    accounts ? accounts.auth.api.getSession({ headers: fromNodeHeaders(req.headers) }) : null;
  let pending = Promise.resolve();
  function serial(action) {
    const next = pending.then(action);
    pending = next.catch(() => {});
    return next;
  }
  const json = (res, status, data) => {
    res.writeHead(status, {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
    });
    res.end(JSON.stringify(data));
  };
  const redirect = (res, location) => {
    res.writeHead(302, { Location: location, 'Cache-Control': 'no-store' });
    res.end();
  };
  async function body(req) {
    if (!req.headers['content-type']?.startsWith('application/json'))
      throw fail(415, '请使用 JSON 请求。');
    const chunks = [];
    let size = 0;
    for await (const part of req) {
      size += part.length;
      if (size > 1200000) throw fail(413, '请求过大。');
      chunks.push(part);
    }
    let data;
    try {
      data = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    } catch {
      throw fail(400, '请求内容无效。');
    }
    if (!data || typeof data !== 'object' || Array.isArray(data)) throw fail(400, '字段无效。');
    return data;
  }
  function fields(data, allowed) {
    if (Object.keys(data).some((k) => !allowed.includes(k))) throw fail(400, '存在不支持的字段。');
  }
  function username(value) {
    if (typeof value !== 'string' || !/^[A-Za-z0-9._-]{3,64}$/.test(value))
      throw fail(400, '用户名须为 3–64 位字母、数字、点、下划线或连字符。');
    return value.toLowerCase();
  }
  function password(value) {
    if (typeof value !== 'string' || value.length < 8 || value.length > 128)
      throw fail(400, '新密码须为 8–128 个字符。');
    return value;
  }
  const server = createServer(async (req, res) => {
    try {
      if (req.headers.host !== new URL(origin).host) throw fail(421, '请使用配置的管理入口。');
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.setHeader('X-Frame-Options', 'DENY');
      res.setHeader('Referrer-Policy', 'same-origin');
      res.setHeader(
        'Content-Security-Policy',
        "frame-ancestors 'none'; object-src 'none'; base-uri 'self'"
      );
      const pathname = new URL(req.url, origin).pathname;
      if (pathname === '/favicon.ico' && req.method === 'GET') {
        res.writeHead(204, { 'Cache-Control': 'no-store' });
        res.end();
        return;
      }
      if (!['GET', 'HEAD'].includes(req.method) && req.headers.origin !== origin)
        throw fail(403, '请求来源无效。');
      if (accounts && pathname === '/__dsdocs_auth/sign-in/username' && req.method === 'POST') {
        const data = await body(req);
        fields(data, ['username', 'password']);
        const result = await accounts.auth.handler(
          new Request(origin + pathname, {
            method: 'POST',
            headers: fromNodeHeaders(req.headers),
            body: JSON.stringify(data),
          })
        );
        res.setHeader('Set-Cookie', result.headers.getSetCookie());
        res.writeHead(
          result.status,
          Object.fromEntries([...result.headers].filter(([key]) => key !== 'set-cookie'))
        );
        res.end(await result.text());
        return;
      }
      if (pathname.startsWith('/__dsdocs_auth')) throw fail(404, '接口不存在。');
      const state = await session(req);
      if (pathname === '/__dsdocs_accounts/capabilities' && req.method === 'GET')
        return json(res, 200, {
          enabled: Boolean(accounts),
          user: state ? accounts.visible(state.user) : null,
        });
      if (accounts && pathname === '/login' && req.method === 'GET') {
        if (state) return redirect(res, '/');
        res.writeHead(200, {
          'Content-Type': 'text/html; charset=utf-8',
          'Cache-Control': 'no-store',
        });
        res.end(accountPage());
        return;
      }
      if (accounts && !state) {
        if (req.method === 'GET' && pathname === '/') return redirect(res, '/login');
        throw fail(401, '请先登录。');
      }
      if (accounts && pathname === '/__dsdocs_accounts/logout' && req.method === 'POST') {
        await body(req);
        closeSession(state.session.id);
        const result = await accounts.auth.handler(
          new Request(origin + '/__dsdocs_auth/sign-out', {
            method: 'POST',
            headers: fromNodeHeaders(req.headers),
            body: '{}',
          })
        );
        res.setHeader('Set-Cookie', result.headers.getSetCookie());
        return json(res, result.status, { saved: result.ok });
      }
      const actor = state ? accounts.userById(state.user.id) : null;
      if (accounts && pathname === '/__dsdocs_accounts/me' && req.method === 'PATCH') {
        const data = await body(req);
        fields(data, ['username', 'password', 'currentPassword']);
        return await serial(async () => {
          const current = accounts.userById(state.user.id);
          if (!current) throw fail(401, '账号不存在。');
          const nextUsername = username(data.username);
          const nextPassword = data.password ? password(data.password) : null;
          if (current.needsSetup && (!nextPassword || nextUsername === 'admin'))
            throw fail(400, '首次登录须修改默认用户名和密码。');
          const duplicate = accounts.db
            .prepare('SELECT id FROM user WHERE username = ? AND id != ?')
            .get(nextUsername, current.id);
          if (duplicate) throw fail(409, '用户名已存在。');
          const headers = fromNodeHeaders(req.headers);
          if (current.needsSetup) {
            await accounts.auth.api.setUserPassword({
              headers,
              body: { userId: current.id, newPassword: nextPassword },
            });
          } else {
            if (typeof data.currentPassword !== 'string') throw fail(400, '请输入当前密码。');
            await accounts.auth.api.verifyPassword({
              headers,
              body: { password: data.currentPassword },
            });
            if (nextPassword)
              await accounts.auth.api.changePassword({
                headers,
                body: {
                  currentPassword: data.currentPassword,
                  newPassword: nextPassword,
                  revokeOtherSessions: true,
                },
              });
          }
          if (nextUsername !== current.username)
            await accounts.auth.api.updateUser({
              headers,
              body: { username: nextUsername, displayUsername: nextUsername, name: nextUsername },
            });
          accounts.db.prepare('UPDATE user SET needsSetup = 0 WHERE id = ?').run(current.id);
          accounts.revoke(current.id);
          closeUser(current.id);
          return json(res, 200, { saved: true, relogin: true });
        });
      }
      if (accounts && (!actor || !['admin', 'superadmin'].includes(actor.role)))
        throw fail(401, '账号已失效。');
      if (accounts && actor.needsSetup) {
        if (req.method === 'GET' && pathname === '/') {
          res.writeHead(200, {
            'Content-Type': 'text/html; charset=utf-8',
            'Cache-Control': 'no-store',
          });
          res.end(accountPage(true));
          return;
        }
        throw fail(403, '请先修改默认用户名和密码。');
      }
      if (pathname.startsWith('/__dsdocs_accounts')) {
        if (!accounts) throw fail(503, '未启用账号模块。');
        if (pathname === '/__dsdocs_accounts' && req.method === 'GET') {
          const users =
            actor.role === 'superadmin'
              ? accounts.db
                  .prepare(
                    'SELECT id, username, role FROM user ORDER BY username COLLATE NOCASE, id'
                  )
                  .all()
              : [actor];
          return json(res, 200, users.map(accounts.visible));
        }
        if (actor.role !== 'superadmin') throw fail(403, '只有超级管理员可以管理其他账号。');
        return await serial(async () => {
          const data = await body(req),
            headers = fromNodeHeaders(req.headers);
          if (pathname === '/__dsdocs_accounts' && req.method === 'POST') {
            fields(data, ['username', 'password']);
            const name = username(data.username),
              pass = password(data.password);
            if (accounts.db.prepare('SELECT id FROM user WHERE username = ?').get(name))
              throw fail(409, '用户名已存在。');
            const result = await accounts.auth.api.createUser({
              headers,
              body: {
                email: `${name}@accounts.invalid`,
                password: pass,
                name,
                role: 'admin',
                data: { username: name },
              },
            });
            return json(res, 201, accounts.visible(result.user));
          }
          const match = pathname.match(/^\/__dsdocs_accounts\/([A-Za-z0-9_-]+)$/);
          if (!match) throw fail(404, '接口不存在。');
          const user = accounts.userById(match[1]);
          if (!user) throw fail(404, '账号不存在。');
          if (user.role === 'superadmin') throw fail(403, '超级管理员不能删除、降级或由他人修改。');
          if (req.method === 'DELETE') {
            fields(data, []);
            await accounts.auth.api.removeUser({ headers, body: { userId: user.id } });
          } else if (req.method === 'PATCH') {
            fields(data, ['username', 'password']);
            const name = username(data.username);
            const pass = data.password ? password(data.password) : null;
            if (
              accounts.db
                .prepare('SELECT id FROM user WHERE username = ? AND id != ?')
                .get(name, user.id)
            )
              throw fail(409, '用户名已存在。');
            if (pass)
              await accounts.auth.api.setUserPassword({
                headers,
                body: { userId: user.id, newPassword: pass },
              });
            if (name !== user.username)
              await accounts.auth.api.adminUpdateUser({
                headers,
                body: { userId: user.id, data: { username: name, displayUsername: name, name } },
              });
          } else throw fail(405, '不支持的请求方法。');
          accounts.revoke(user.id);
          closeUser(user.id);
          return json(res, 200, { saved: true });
        });
      }
      if (pathname.startsWith('/__dsdocs_content')) {
        const action = () => content.handle(req, res, pathname, json, body);
        return await (['GET', 'HEAD'].includes(req.method) ? action() : serial(action));
      }
      if (proxy) return await proxy.web(req, res);
      if (!['GET', 'HEAD'].includes(req.method)) throw fail(405, '不支持的请求方法。');
      const dist = fileURLToPath(new URL('../dist/', import.meta.url));
      const resource = pathname === '/' ? 'index.html' : pathname.slice(1);
      if (resource.includes('..') || !/^(?:index\.html|assets\/[A-Za-z0-9_.-]+)$/.test(resource))
        throw fail(404, '页面不存在。');
      const types = {
        '.html': 'text/html; charset=utf-8',
        '.js': 'text/javascript; charset=utf-8',
        '.css': 'text/css; charset=utf-8',
        '.woff2': 'font/woff2',
      };
      const data = await readFile(path.join(dist, resource)).catch(() => {
        throw fail(404, '文件不存在。');
      });
      res.writeHead(200, {
        'Content-Type': types[path.extname(resource)] ?? 'application/octet-stream',
        'Cache-Control':
          resource === 'index.html' ? 'no-store' : 'public,max-age=31536000,immutable',
        'X-Content-Type-Options': 'nosniff',
      });
      res.end(req.method === 'HEAD' ? undefined : data);
    } catch (error) {
      if (res.headersSent) {
        res.destroy();
        return;
      }
      const duplicate = String(error.message).includes('UNIQUE constraint failed');
      const status = duplicate
        ? 409
        : Number.isInteger(error.status)
          ? error.status
          : error.statusCode >= 400 && error.statusCode < 500
            ? error.statusCode
            : 500;
      json(res, status, {
        error: duplicate
          ? '名称、路径或语言关联已存在。'
          : error.status
            ? error.message
            : error.body?.code === 'INVALID_PASSWORD'
              ? '当前密码不正确。'
              : status < 500
                ? '账号操作失败，请检查输入。'
                : '服务暂不可用。',
      });
    }
  });
  server.requestTimeout = 30_000;
  server.headersTimeout = 15_000;
  server.on('upgrade', async (req, socket, head) => {
    try {
      if (!target || req.headers.host !== new URL(origin).host || req.headers.origin !== origin) {
        socket.end('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n');
        return;
      }
      const state = await session(req);
      if (accounts && (!state || accounts.userById(state.user.id)?.needsSetup)) {
        socket.end('HTTP/1.1 401 Unauthorized\r\nConnection: close\r\n\r\n');
        return;
      }
      const item = { userId: state?.user.id, sessionId: state?.session.id, downstream: socket };
      sockets.add(item);
      const timer = state
        ? setTimeout(
            () => socket.destroy(),
            Math.max(1, new Date(state.session.expiresAt).getTime() - Date.now())
          )
        : null;
      socket.once('close', () => {
        sockets.delete(item);
        if (timer) clearTimeout(timer);
        item.upstream?.destroy();
      });
      if (accounts) {
        const fresh = await session(req);
        if (!fresh || fresh.session.id !== state.session.id) {
          socket.destroy();
          return;
        }
      }
      if (socket.destroyed) return;
      item.upstream = await proxyUpgrade(target, req, socket, head);
      if (socket.destroyed) item.upstream.destroy();
    } catch {
      socket.destroy();
    }
  });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, host, resolve);
  });
  let closed = false;
  async function close() {
    if (closed) return;
    closed = true;
    for (const item of sockets) item.downstream.destroy();
    server.closeIdleConnections();
    await new Promise((resolve) => server.close(resolve));
    await vite?.close();
    accounts?.close();
    content.store.close();
  }
  return { server, accounts, close };
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const instance = await startManagement();
  console.log(
    `DSdocs 管理：http://${process.env.DSDOCS_HOST ?? '127.0.0.1'}:${process.env.DSDOCS_PORT ?? 5182}`
  );
  for (const signal of ['SIGTERM', 'SIGINT'])
    process.once(signal, () => void instance.close().then(() => process.exit(0)));
}
