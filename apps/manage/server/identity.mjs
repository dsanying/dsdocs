const accountPath = 'dsdocs';
const groupName = 'editors';
const prefix = '/__dsdocs_accounts';
const failure = (status, message) => Object.assign(new Error(message), { status });

/** Small API-v3 adapter, not an identity database or session implementation. */
export function createIdentityProvider({ url, token, fetcher = fetch }) {
  const origin = new URL(url);
  if (!['http:', 'https:'].includes(origin.protocol)) throw new Error('Invalid identity URL');
  async function api(path, method = 'GET', data) {
    const response = await fetcher(new URL(`/api/v3/${path}`, origin), {
      method,
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: data === undefined ? undefined : JSON.stringify(data),
      signal: AbortSignal.timeout(10000),
      redirect: 'error',
    });
    if (!response.ok) throw failure(502, '账号服务请求失败，请检查账号模块配置。');
    return response.status === 204 ? undefined : response.json();
  }
  async function group() {
    const result = await api(`core/groups/?name=${encodeURIComponent(groupName)}`);
    const found = result.results.filter((g) => g.name === groupName);
    if (found.length !== 1) throw failure(503, '未找到唯一的编辑权限组。');
    return found[0];
  }
  async function owned(id) {
    if (!/^\d+$/.test(String(id))) throw failure(400, '账号标识无效。');
    const user = await api(`core/users/${id}/`);
    if (user.path !== accountPath || user.type !== 'internal')
      throw failure(403, '只能修改 DSdocs 创建的本地账号。');
    return user;
  }
  function visible(user) {
    return {
      id: user.pk,
      username: user.username,
      name: user.name,
      email: user.email,
      active: user.is_active,
    };
  }
  return {
    async list() {
      const users = [];
      // Consume every page; never assume the first API page is the complete dataset.
      let page = 1,
        next = true;
      while (next) {
        const result = await api(`core/users/?path=${accountPath}&page_size=100&page=${page++}`);
        users.push(
          ...result.results
            .filter((u) => u.path === accountPath && u.type === 'internal')
            .map(visible)
        );
        next = Boolean(result.pagination.next);
        if (next && page > 100) throw failure(502, '账号列表超过当前适配器的分页上限。');
      }
      return users.sort((a, b) => a.username.localeCompare(b.username));
    },
    async create(data) {
      if (
        !data ||
        Object.keys(data).some((k) => !['username', 'name', 'email', 'password'].includes(k))
      )
        throw failure(400, '账号字段无效。');
      for (const key of ['username', 'name', 'email', 'password'])
        if (typeof data[key] !== 'string') throw failure(400, '账号字段无效。');
      if (
        !/^[a-zA-Z0-9._-]{3,64}$/.test(data.username) ||
        !data.name.trim() ||
        data.name.length > 150 ||
        data.email.length > 254 ||
        (data.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email))
      )
        throw failure(400, '请检查用户名、姓名和邮箱。');
      if (data.password.length < 12 || data.password.length > 128)
        throw failure(400, '密码长度须为 12–128 个字符。');
      const editors = await group();
      // Start disabled and without editor access: a partial failure must not grant access.
      const user = await api('core/users/', 'POST', {
        username: data.username,
        name: data.name,
        email: data.email,
        path: accountPath,
        type: 'internal',
        is_active: false,
      });
      await api(`core/users/${user.pk}/set_password/`, 'POST', { password: data.password });
      await api(`core/groups/${editors.pk}/add_user/`, 'POST', { pk: user.pk });
      return visible(await api(`core/users/${user.pk}/`, 'PATCH', { is_active: true }));
    },
    async setActive(id, active, actor) {
      const user = await owned(id);
      if (typeof active !== 'boolean') throw failure(400, '状态无效。');
      if (!active && user.username === actor) throw failure(409, '不能在此停用当前登录账号。');
      if (active) {
        const editors = await group();
        await api(`core/groups/${editors.pk}/add_user/`, 'POST', { pk: user.pk });
      }
      return visible(await api(`core/users/${id}/`, 'PATCH', { is_active: active }));
    },
    async setPassword(id, password) {
      await owned(id);
      if (typeof password !== 'string' || password.length < 12 || password.length > 128)
        throw failure(400, '密码长度须为 12–128 个字符。');
      await api(`core/users/${id}/set_password/`, 'POST', { password });
    },
  };
}

export function identityMiddleware(env = process.env) {
  const enabled = Boolean(env.DSDOCS_IDENTITY_API_URL && env.DSDOCS_IDENTITY_API_TOKEN);
  const provider = enabled
    ? createIdentityProvider({
        url: env.DSDOCS_IDENTITY_API_URL,
        token: env.DSDOCS_IDENTITY_API_TOKEN,
      })
    : null;
  return async (request, response, next) => {
    const path = new URL(request.url ?? '/', 'http://localhost').pathname;
    if (!path.startsWith(prefix)) return next();
    const send = (status, data) => {
      response.writeHead(status, {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store',
      });
      response.end(JSON.stringify(data));
    };
    try {
      if (path === `${prefix}/capabilities` && request.method === 'GET')
        return send(200, { enabled });
      if (!provider) throw failure(503, '未启用账号模块。');
      const actor = request.headers['x-authentik-username'];
      if (typeof actor !== 'string' || !actor) throw failure(401, '需要从认证入口访问账号管理。');
      if (request.method === 'GET' && path === prefix) return send(200, await provider.list());
      if (!['POST', 'PATCH'].includes(request.method ?? ''))
        throw failure(405, '不支持的请求方法。');
      if (
        !env.DSDOCS_MANAGEMENT_ORIGIN ||
        request.headers.origin !== env.DSDOCS_MANAGEMENT_ORIGIN ||
        request.headers['content-type']?.split(';')[0] !== 'application/json'
      )
        throw failure(403, '请求来源或格式无效。');
      let body = '',
        size = 0;
      for await (const chunk of request) {
        size += chunk.length;
        if (size > 4096) throw failure(413, '请求过大。');
        body += chunk;
      }
      let data;
      try {
        data = JSON.parse(body);
      } catch {
        throw failure(400, '请求内容无效。');
      }
      if (path === prefix && request.method === 'POST')
        return send(201, await provider.create(data));
      const match = path.match(/^\/__dsdocs_accounts\/(\d+)(\/password)?$/);
      if (!match) throw failure(404, '未找到账号操作。');
      if (!data || typeof data !== 'object' || Array.isArray(data))
        throw failure(400, '账号字段无效。');
      if (
        match[2] &&
        request.method === 'POST' &&
        Object.keys(data).length === 1 &&
        'password' in data
      ) {
        await provider.setPassword(match[1], data.password);
        return send(200, { saved: true });
      }
      if (
        !match[2] &&
        request.method === 'PATCH' &&
        Object.keys(data).length === 1 &&
        'active' in data
      )
        return send(200, await provider.setActive(match[1], data.active, actor));
      throw failure(400, '账号操作字段无效。');
    } catch (error) {
      send(error.status ?? 502, { error: error.status ? error.message : '账号服务暂不可用。' });
    }
  };
}
