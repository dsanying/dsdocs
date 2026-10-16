import { openContent } from '../../../packages/content/store.mjs';
import { request as httpRequest } from 'node:http';
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { startManagement } from '../server/start.mjs';
import { validateMarkdown } from '../server/markdown.mjs';
const origin = 'http://127.0.0.1:15283';
test('本地账号、内容、发布和附件边界', async (t) => {
  const root = await mkdtemp(path.join(tmpdir(), 'dsdocs-system-'));
  const app = await startManagement({
    ...process.env,
    DSDOCS_PORT: '15283',
    DSDOCS_URL: origin,
    DSDOCS_AUTH_DATA_DIR: path.join(root, 'accounts'),
    DSDOCS_DATA_DIR: path.join(root, 'content'),
  });
  t.after(async () => {
    await app.close();
    await rm(root, { recursive: true, force: true });
  });
  let cookie = '';
  const call = async (url, method = 'GET', data, session = cookie, extra = {}) => {
    const response = await fetch(origin + url, {
      method,
      headers: { origin, 'content-type': 'application/json', cookie: session, ...extra },
      body: data === undefined ? undefined : JSON.stringify(data),
      redirect: 'manual',
    });
    return {
      status: response.status,
      data: await response.json().catch(() => null),
      cookie: response.headers
        .getSetCookie()
        .map((x) => x.split(';')[0])
        .join('; '),
    };
  };
  const signIn = async (username, password) =>
    call('/__dsdocs_auth/sign-in/username', 'POST', { username, password }, '');
  await t.test('匿名不能读取内容和伪造来源', async () => {
    assert.equal((await call('/login')).status, 200);
    assert.equal((await call('/')).status, 302);
    assert.equal((await call('/__dsdocs_auth/sign-up/email', 'POST', {})).status, 404);
    assert.equal((await call('/__dsdocs_content')).status, 401);
    assert.equal(
      (
        await call('/__dsdocs_content/documents', 'POST', {}, '', {
          origin: 'https://evil.example',
        })
      ).status,
      403
    );
  });
  await t.test('默认登录及首次设置锁定', async () => {
    const login = await signIn('admin', 'admin');
    assert.equal(login.status, 200);
    cookie = login.cookie;
    assert.equal((await call('/')).status, 200);
    assert.equal((await call('/login')).status, 302);
    assert.equal((await call('/__dsdocs_content')).status, 403);
    assert.equal(
      (
        await call('/__dsdocs_accounts/me', 'PATCH', {
          username: 'admin',
          password: 'new-pass-123',
        })
      ).status,
      400
    );
    const setup = await call('/__dsdocs_accounts/me', 'PATCH', {
      username: 'owner',
      password: 'new-pass-123',
    });
    assert.equal(setup.status, 200);
    assert.equal((await call('/__dsdocs_content')).status, 401);
    const login2 = await signIn('owner', 'new-pass-123');
    assert.equal(login2.status, 200);
    cookie = login2.cookie;
    assert.notEqual((await signIn('admin', 'admin')).status, 200);
  });
  let member, memberCookie;
  await t.test('超管管理普通账号，普通管理员仅能看自己', async () => {
    const created = await call('/__dsdocs_accounts', 'POST', {
      username: 'writer',
      password: 'member-pass-123',
    });
    assert.equal(created.status, 201);
    member = created.data;
    await new Promise((resolve) => setTimeout(resolve, 11000));
    const login = await signIn('writer', 'member-pass-123');
    assert.equal(login.status, 200);
    memberCookie = login.cookie;
    const visible = await call('/__dsdocs_accounts', 'GET', undefined, memberCookie);
    assert.equal(visible.data.length, 1);
    assert.equal(visible.data[0].username, 'writer');
    assert.equal(
      (
        await call(
          '/__dsdocs_accounts',
          'POST',
          { username: 'other', password: 'member-pass-123' },
          memberCookie
        )
      ).status,
      403
    );
    assert.equal(
      (
        await call('/__dsdocs_accounts', 'POST', {
          username: 'other',
          password: 'member-pass-123',
          role: 'superadmin',
        })
      ).status,
      400
    );
    const owner = (await call('/__dsdocs_accounts')).data.find((x) => x.role === 'superadmin');
    assert.equal((await call(`/__dsdocs_accounts/${owner.id}`, 'DELETE', {})).status, 403);
  });
  await t.test('交错请求不能绕过发布正文校验', async () => {
    const created = (
      await call('/__dsdocs_content/documents', 'POST', {
        title: '并发校验',
        slug: 'concurrent-validation',
        locale: 'zh',
      })
    ).data;
    let request;
    const publishing = new Promise((resolve, reject) => {
      request = httpRequest(
        origin + `/__dsdocs_content/documents/${created.id}/publish`,
        {
          method: 'POST',
          headers: { origin, cookie, 'content-type': 'application/json' },
        },
        (response) => {
          response.resume();
          response.once('end', () => resolve(response.statusCode));
        }
      );
      request.once('error', reject);
      request.write('{"version":');
    });
    // Deliver a partial request first; another write must not change its validation snapshot.
    await new Promise((resolve) => setTimeout(resolve, 50));
    const saving = call(`/__dsdocs_content/documents/${created.id}`, 'PATCH', {
      version: created.version,
      title: created.title,
      slug: created.slug,
      locale: created.locale,
      body: '<script>unsafe</script>',
    });
    await new Promise((resolve) => setTimeout(resolve, 100));
    request.end(`${created.version + 1}}`);
    assert.equal(await publishing, 409);
    const saved = await saving;
    assert.equal(saved.status, 200);
    assert.equal(
      (
        await call(`/__dsdocs_content/documents/${created.id}/publish`, 'POST', {
          version: saved.data.version,
        })
      ).status,
      422
    );
    const data = (await call('/__dsdocs_content')).data;
    assert.equal(data.documents.find((item) => item.id === created.id).published, null);
    await call(`/__dsdocs_content/documents/${created.id}`, 'DELETE', {});
  });
  let folder, doc;
  await t.test('目录嵌套、重命名与循环保护', async () => {
    folder = (await call('/__dsdocs_content/folders', 'POST', { title: '指南', titleEn: 'Guide' }))
      .data;
    assert.ok(folder.id);
    const child = (
      await call('/__dsdocs_content/folders', 'POST', {
        title: '子目录',
        titleEn: 'Child',
        parent: folder.id,
      })
    ).data;
    assert.equal(
      (
        await call(`/__dsdocs_content/folders/${folder.id}`, 'PATCH', {
          title: '指南',
          titleEn: 'Guide',
          parent: child.id,
        })
      ).status,
      400
    );
    assert.equal(
      (
        await call(`/__dsdocs_content/folders/${folder.id}`, 'PATCH', {
          title: '使用指南',
          titleEn: 'Usage guide',
        })
      ).status,
      200
    );
    assert.equal((await call(`/__dsdocs_content/folders/${folder.id}`, 'DELETE', {})).status, 409);
  });
  await t.test('草稿保存不发布，旧版本冲突拒绝', async () => {
    doc = (
      await call('/__dsdocs_content/documents', 'POST', {
        title: '入门',
        slug: 'start',
        locale: 'zh',
        folder: folder.id,
      })
    ).data;
    assert.ok(doc.id);
    const saved = await call(`/__dsdocs_content/documents/${doc.id}`, 'PATCH', {
      ...{
        title: doc.title,
        slug: doc.slug,
        locale: doc.locale,
        folder: doc.folder,
        body: '## 准备\n\n:::tip\n说明\n:::\n\n```json\n{"hello": true}\n```',
        version: doc.version,
      },
    });
    assert.equal(saved.status, 200);
    assert.equal(saved.data.published, null);
    assert.equal(app.accounts !== null, true);
    assert.equal(
      (await call(`/__dsdocs_content/documents/${doc.id}`, 'PATCH', { ...doc, body: 'stale' }))
        .status,
      400
    );
    doc = saved.data;
    const stale = {
      version: 1,
      title: doc.title,
      slug: doc.slug,
      locale: doc.locale,
      folder: doc.folder,
      body: 'stale',
    };
    assert.equal((await call(`/__dsdocs_content/documents/${doc.id}`, 'PATCH', stale)).status, 409);
  });
  await t.test('发布生成快照和历史', async () => {
    const result = await call(`/__dsdocs_content/documents/${doc.id}/publish`, 'POST', {
      version: doc.version,
    });
    assert.equal(result.status, 200);
    doc = result.data;
    assert.match(JSON.parse(doc.published).body, /说明/);
    const history = await call(`/__dsdocs_content/documents/${doc.id}/revisions`);
    assert.equal(history.data.length, 1);
  });
  await t.test('不安全正文与未知指令拒绝，旧发布不变', async () => {
    for (const text of [
      '<script>alert(1)</script>',
      ':::tabs\nwrong\n:::',
      '[x](javascript:alert(1))',
    ])
      assert.throws(() => validateMarkdown(text));
    const original = doc.published;
    const snapshotStore = openContent(path.join(root, 'content'), true);
    const revision = snapshotStore.revision();
    const result = await call(`/__dsdocs_content/documents/${doc.id}`, 'PATCH', {
      version: doc.version,
      title: doc.title,
      slug: doc.slug,
      locale: doc.locale,
      folder: doc.folder,
      body: '<script>alert(1)</script>',
    });
    doc = result.data;
    assert.equal(snapshotStore.revision(), revision, '仅保存草稿不得改变已发布版本指纹');
    snapshotStore.close();
    assert.equal(
      (
        await call(`/__dsdocs_content/documents/${doc.id}/publish`, 'POST', {
          version: doc.version,
        })
      ).status,
      422
    );
    assert.equal(
      (await call('/__dsdocs_content')).data.documents.find((x) => x.id === doc.id).published,
      original
    );
  });
  await t.test('翻译关联与重复语言拒绝', async () => {
    const data = { title: 'Start', slug: 'start', locale: 'en', translationId: doc.translationId };
    assert.equal((await call('/__dsdocs_content/documents', 'POST', data)).status, 201);
    assert.equal(
      (await call('/__dsdocs_content/documents', 'POST', { ...data, slug: 'other' })).status,
      409
    );
  });
  await t.test('附件上传、类型限制、引用删除保护', async () => {
    const upload = await fetch(origin + '/__dsdocs_content/assets', {
      method: 'POST',
      headers: { origin, cookie, 'content-type': 'text/plain', 'x-filename': 'example.txt' },
      body: 'example attachment',
    });
    assert.equal(upload.status, 201);
    const asset = await upload.json();
    assert.equal((await call(`/__dsdocs_content/assets/${asset.id}`)).status, 200);
    const saved = await call(`/__dsdocs_content/documents/${doc.id}`, 'PATCH', {
      version: doc.version,
      title: doc.title,
      slug: doc.slug,
      locale: doc.locale,
      folder: doc.folder,
      body: `[附件](${asset.src})`,
    });
    doc = saved.data;
    assert.equal((await call(`/__dsdocs_content/assets/${asset.id}`, 'DELETE', {})).status, 409);
    assert.equal(
      (
        await call(`/__dsdocs_content/documents/${doc.id}/publish`, 'POST', {
          version: doc.version,
        })
      ).status,
      200
    );
    const cleared = await call(`/__dsdocs_content/documents/${doc.id}`, 'PATCH', {
      version: doc.version,
      title: doc.title,
      slug: doc.slug,
      locale: doc.locale,
      folder: doc.folder,
      body: '附件已移除',
    });
    doc = cleared.data;
    assert.equal((await call(`/__dsdocs_content/assets/${asset.id}`, 'DELETE', {})).status, 409);
    await call(`/__dsdocs_content/documents/${doc.id}/publish`, 'POST', { version: doc.version });
    assert.equal((await call(`/__dsdocs_content/assets/${asset.id}`, 'DELETE', {})).status, 200);
    const rejected = await fetch(origin + '/__dsdocs_content/assets', {
      method: 'POST',
      headers: { origin, cookie, 'content-type': 'image/svg+xml' },
      body: '<svg/>',
    });
    assert.equal(rejected.status, 415);
  });
  await t.test('中文与表情跨网络数据块保存后不损坏', async () => {
    const initial = (
      await call('/__dsdocs_content/documents', 'POST', {
        title: 'Unicode',
        slug: 'unicode',
        locale: 'zh',
      })
    ).data;
    const text = '中文内容🧪\n'.repeat(16000),
      payload = Buffer.from(
        JSON.stringify({ version: 1, title: 'Unicode', slug: 'unicode', locale: 'zh', body: text })
      );
    const split = payload.indexOf(Buffer.from('中')) + 1;
    const result = await new Promise((resolve, reject) => {
      const req = httpRequest(
        origin + `/__dsdocs_content/documents/${initial.id}`,
        { method: 'PATCH', headers: { origin, cookie, 'content-type': 'application/json' } },
        (res) => {
          const chunks = [];
          res.on('data', (chunk) => chunks.push(chunk));
          res.on('end', () =>
            resolve({
              status: res.statusCode,
              data: JSON.parse(Buffer.concat(chunks).toString('utf8')),
            })
          );
        }
      );
      req.on('error', reject);
      req.write(payload.subarray(0, split));
      setTimeout(() => req.end(payload.subarray(split)), 5);
    });
    assert.equal(result.status, 200);
    assert.equal(result.data.body === text, true, '中文及表情必须完整往返');
    assert.equal(
      (await call(`/__dsdocs_content/documents/${initial.id}`, 'DELETE', {})).status,
      200
    );
  });
  await t.test('普通管理员改名必须核验当前密码，成功后撤销会话', async () => {
    assert.equal(
      (
        await call(
          '/__dsdocs_accounts/me',
          'PATCH',
          { username: 'writer2', currentPassword: 'wrong-password' },
          memberCookie
        )
      ).status,
      400
    );
    assert.equal(
      (
        await call(
          '/__dsdocs_accounts/me',
          'PATCH',
          { username: 'writer2', currentPassword: 'member-pass-123' },
          memberCookie
        )
      ).status,
      200
    );
    assert.equal((await call('/__dsdocs_accounts', 'GET', undefined, memberCookie)).status, 401);
  });
  await t.test('历史恢复仅改变草稿，撤下后保留历史', async () => {
    const history = (await call(`/__dsdocs_content/documents/${doc.id}/revisions`)).data;
    const before = (await call('/__dsdocs_content')).data.documents.find((x) => x.id === doc.id);
    const restored = await call(`/__dsdocs_content/documents/${doc.id}/restore`, 'POST', {
      revision: history.at(-1).id,
      version: before.version,
    });
    assert.equal(restored.status, 200);
    assert.match(restored.data.body, /说明/);
    assert.equal(restored.data.published, before.published);
    assert.equal(
      (await call(`/__dsdocs_content/documents/${doc.id}/unpublish`, 'POST', {})).status,
      200
    );
    const after = (await call('/__dsdocs_content')).data.documents.find((x) => x.id === doc.id);
    assert.equal(after.published, null);
    assert.equal(
      (await call(`/__dsdocs_content/documents/${doc.id}/revisions`)).data.length,
      history.length
    );
  });
  await t.test('短图片及超大附件拒绝', async () => {
    const short = await fetch(origin + '/__dsdocs_content/assets', {
      method: 'POST',
      headers: { origin, cookie, 'content-type': 'image/jpeg' },
      body: new Uint8Array([1]),
    });
    assert.equal(short.status, 400);
    const large = await fetch(origin + '/__dsdocs_content/assets', {
      method: 'POST',
      headers: { origin, cookie, 'content-type': 'text/plain' },
      body: Buffer.alloc(5 * 1024 * 1024 + 1),
    });
    assert.equal(large.status, 413);
  });
  await t.test('重置密码撤销已有会话', async () => {
    assert.equal(
      (
        await call(`/__dsdocs_accounts/${member.id}`, 'PATCH', {
          username: 'writer',
          password: 'changed-pass-123',
        })
      ).status,
      200
    );
    assert.equal((await call('/__dsdocs_content', 'GET', undefined, memberCookie)).status, 401);
    assert.equal((await signIn('writer', 'changed-pass-123')).status, 200);
  });
  await t.test('注销后撤销会话并可重新登录', async () => {
    assert.equal((await call('/__dsdocs_accounts/logout', 'POST', {})).status, 200);
    assert.equal((await call('/__dsdocs_content')).status, 401);
    const login = await signIn('owner', 'new-pass-123');
    assert.equal(login.status, 200);
    cookie = login.cookie;
    assert.equal((await call(`/__dsdocs_accounts/${member.id}`, 'DELETE', {})).status, 200);
    assert.equal(
      (await call('/__dsdocs_accounts')).data.some((x) => x.id === member.id),
      false
    );
  });
  await t.test('生产入口不能读取服务端源码', async () => {
    assert.equal((await call('/server/accounts.mjs')).status, 404);
  });
});

test('可独立关闭账号模块，不创建账号数据库', async (t) => {
  const directory = await mkdtemp(path.join(tmpdir(), 'dsdocs-no-auth-'));
  const origin = 'http://127.0.0.1:15284';
  const app = await startManagement({
    ...process.env,
    DSDOCS_AUTH: 'none',
    DSDOCS_PORT: '15284',
    DSDOCS_URL: origin,
    DSDOCS_DATA_DIR: directory,
  });
  t.after(async () => {
    await app.close();
    await rm(directory, { recursive: true, force: true });
  });
  const response = await fetch(origin + '/__dsdocs_content');
  assert.equal(response.status, 200);
  assert.equal(app.accounts, null);
  const state = await (await fetch(origin + '/__dsdocs_accounts/capabilities')).json();
  assert.equal(state.enabled, false);
});
