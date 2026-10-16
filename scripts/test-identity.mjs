// Runs against an isolated authentik deployment with an existing editor fixture.
// The credential file is supplied outside the repository and is never logged.
import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import path from 'node:path';
import { chromium, expect } from '../apps/studio/node_modules/@playwright/test/index.mjs';
const origin = process.env.DSDOCS_TEST_EDITOR_URL ?? 'http://editor.localhost:5181';
if (!process.env.DSDOCS_IDENTITY_TEST_CREDENTIALS || !process.env.DSDOCS_ARTIFACTS)
  throw new Error(
    'Set private test credentials path and DSDOCS_ARTIFACTS; use an isolated identity instance.'
  );
const credentials = JSON.parse(
  await readFile(process.env.DSDOCS_IDENTITY_TEST_CREDENTIALS, 'utf8')
);
if (
  !Number.isInteger(credentials.id) ||
  !Number.isInteger(credentials.foreignId) ||
  credentials.id === credentials.foreignId
)
  throw new Error('Provide distinct isolated editor and foreign identity IDs.');
const secrets = new Set([credentials.password, credentials.nonEditor?.password].filter(Boolean));
const sanitize = (text) =>
  [...secrets].reduce((value, secret) => value.split(secret).join('[redacted]'), text);
const artifacts = process.env.DSDOCS_ARTIFACTS;
await mkdir(artifacts, { recursive: true });
const browser = await chromium.launch({
  channel: process.env.DSDOCS_CHROME_CHANNEL === 'chromium' ? undefined : 'chrome',
  headless: process.env.DSDOCS_HEADLESS === '1',
});
const results = [],
  errors = [];
async function check(name, action) {
  await action();
  results.push(name);
  console.log('PASS ' + name);
}
async function login(context, username, password) {
  const p = await context.newPage();
  await p.goto(origin);
  await p.getByRole('textbox', { name: /Email or Username|邮箱或用户名/ }).fill(username);
  await p.getByRole('button', { name: /^(Log in|登录)$/ }).click();
  await expect(p.getByRole('textbox', { name: /^(Password|密码)$/ })).toBeVisible();
  await p.getByRole('textbox', { name: /^(Password|密码)$/ }).fill(password);
  await p.getByRole('button', { name: /^(Continue|继续)$/ }).click();
  return p;
}
try {
  const anonymous = await browser.newContext();
  await check('anonymous HTTP, resources and spoofed identity header denied', async () => {
    for (const url of ['/', '/__dsdocs_accounts', '/__fde_asset/assets/example.png']) {
      const r = await anonymous.request.get(origin + url, {
        maxRedirects: 0,
        headers: { 'X-Authentik-Username': credentials.username },
      });
      assert.ok([302, 303, 401, 403].includes(r.status()), `anonymous ${url}: ${r.status()}`);
    }
  });
  await anonymous.close();
  await check('valid local user without editor group cannot enter backend', async () => {
    if (!credentials.nonEditor)
      throw new Error('Provide isolated nonEditor fixture without editors group.');
    const c = await browser.newContext({ locale: 'zh-CN' });
    try {
      const q = await login(c, credentials.nonEditor.username, credentials.nonEditor.password);
      await expect(
        q
          .getByText(/Access denied|Permission denied|访问被拒绝|访问被拒|访问遭拒|无权|拒绝访问/i)
          .first()
      ).toBeVisible({ timeout: 30000 });
      await expect(q.getByRole('button', { name: '文档', exact: true })).toBeHidden();
    } finally {
      await c.close();
    }
  });
  const context = await browser.newContext({ locale: 'zh-CN' });
  const p = await login(context, credentials.username, credentials.password);
  p.on('pageerror', (e) => errors.push(sanitize(e.message)));
  await expect(p.getByRole('button', { name: '账号', exact: true })).toBeVisible({
    timeout: 30000,
  });
  await p.getByRole('button', { name: '账号', exact: true }).click();
  const self = p.getByRole('row').filter({ hasText: credentials.username });
  await expect(self).toBeVisible();
  await check('self-disable rejected and identity remains enabled', async () => {
    await self.getByRole('button', { name: '停用', exact: true }).click();
    await expect(
      p.getByRole('status').filter({ hasText: '不能在此停用当前登录账号' })
    ).toBeVisible();
    await expect(self.getByRole('cell', { name: '已启用', exact: true })).toBeVisible();
  });
  const username = 'browser-' + Date.now();
  const password = randomBytes(24).toString('base64url');
  const replacement = randomBytes(24).toString('base64url');
  secrets.add(password);
  secrets.add(replacement);
  await check('create cancel discards fields', async () => {
    await p.getByRole('button', { name: '创建账号' }).click();
    await p.getByLabel('用户名', { exact: true }).fill('discarded');
    await p.getByRole('button', { name: '取消', exact: true }).click();
    await p.getByRole('button', { name: '创建账号' }).click();
    await expect(p.getByLabel('用户名', { exact: true })).toHaveValue('');
  });
  await check('create through UI persists and is searchable after reload', async () => {
    await p.getByLabel('用户名', { exact: true }).fill(username);
    await p.getByLabel('姓名', { exact: true }).fill('中文验证账号');
    await p.getByLabel('密码', { exact: true }).fill(password);
    await p.getByRole('button', { name: '保存', exact: true }).click();
    await expect(p.getByRole('dialog')).toBeHidden();
    await p.reload();
    await p.getByRole('button', { name: '账号', exact: true }).click();
    await p.getByLabel('搜索账号', { exact: true }).fill(username);
    await expect(p.getByRole('row').filter({ hasText: username })).toBeVisible();
  });
  const target = p.getByRole('row').filter({ hasText: username });
  await check('native login accepts account created in unified UI', async () => {
    const c = await browser.newContext({ locale: 'zh-CN' });
    try {
      const q = await login(c, username, password);
      await expect(q.getByRole('button', { name: '文档', exact: true })).toBeVisible({
        timeout: 30000,
      });
    } finally {
      await c.close();
    }
  });
  await check('reset password, disable, enable, and reload persisted state', async () => {
    await target.getByRole('button', { name: '重置密码' }).click();
    await p.getByLabel('密码', { exact: true }).fill(replacement);
    await p.getByRole('button', { name: '保存', exact: true }).click();
    await expect(p.getByRole('dialog')).toBeHidden();
    await target.getByRole('button', { name: '停用', exact: true }).click();
    await expect(target.getByRole('cell', { name: '已停用', exact: true })).toBeVisible();
    const c = await browser.newContext({ locale: 'zh-CN' });
    try {
      const q = await login(c, username, replacement);
      await expect(q.getByText(/无效|凭据|凭证|密码.*错误|Invalid/i).first()).toBeVisible({
        timeout: 15000,
      });
      await expect(q.getByRole('button', { name: '文档', exact: true })).toBeHidden();
      assert.notEqual(new URL(q.url()).origin, origin);
    } finally {
      await c.close();
    }
    await target.getByRole('button', { name: '启用', exact: true }).click();
    await expect(target.getByRole('cell', { name: '已启用', exact: true })).toBeVisible();
    const d = await browser.newContext({ locale: 'zh-CN' });
    try {
      const q = await login(d, username, replacement);
      await expect(q.getByRole('button', { name: '文档', exact: true })).toBeVisible({
        timeout: 30000,
      });
    } finally {
      await d.close();
    }
  });
  await check('foreign identity mutations, CSRF and unsupported fields denied', async () => {
    assert.equal(
      (
        await context.request.patch(origin + `/__dsdocs_accounts/${credentials.foreignId}`, {
          data: { active: false },
          headers: { Origin: origin },
        })
      ).status(),
      403
    );
    assert.equal(
      (
        await context.request.post(origin + '/__dsdocs_accounts', {
          data: {},
          headers: { Origin: 'https://invalid.example' },
        })
      ).status(),
      403
    );
    assert.equal(
      (
        await context.request.patch(origin + `/__dsdocs_accounts/${credentials.id}`, {
          data: { active: true, roles: ['admin'] },
          headers: { Origin: origin },
        })
      ).status(),
      400
    );
  });
  await p.screenshot({ path: path.join(artifacts, 'identity-accounts-desktop.png') });
  await p.setViewportSize({ width: 390, height: 844 });
  await p.getByRole('button', { name: '切换主题' }).click();
  await p.screenshot({ path: path.join(artifacts, 'identity-accounts-mobile.png') });
  await check('disabled account loses existing proxy session access', async () => {
    const c = await browser.newContext({ locale: 'zh-CN' });
    try {
      const sockets = [];
      c.on('page', (page) =>
        page.on('websocket', (socket) => {
          if (socket.url().endsWith('/__fde_sync')) {
            const tracked = { closed: false };
            sockets.push(tracked);
            socket.on('close', () => (tracked.closed = true));
          }
        })
      );
      const q = await login(c, username, replacement);
      await expect(q.getByRole('button', { name: '文档', exact: true })).toBeVisible({
        timeout: 30000,
      });
      await expect(q.getByText('已保存', { exact: true })).toBeVisible();
      assert.ok(sockets.length > 0, 'official editor socket was not opened');
      const connected = sockets.at(-1);
      await target.getByRole('button', { name: '停用', exact: true }).click();
      await expect(target.getByRole('cell', { name: '已停用', exact: true })).toBeVisible();
      const start = Date.now();
      await expect
        .poll(
          async () =>
            [302, 303, 401, 403].includes(
              (await c.request.get(origin + '/__dsdocs_accounts', { maxRedirects: 0 })).status()
            ),
          { timeout: 90000, intervals: [1000, 3000, 5000] }
        )
        .toBe(true);
      await expect.poll(() => connected.closed, { timeout: 45000 }).toBe(true);
      await writeFile(
        path.join(artifacts, 'revocation-timing.json'),
        JSON.stringify({
          observedMilliseconds: Date.now() - start,
          note: 'One local deployment observation, not a guaranteed upper bound.',
        })
      );
    } finally {
      await c.close();
    }
  });
  assert.deepEqual(errors, []);
} catch (error) {
  // Playwright failure snapshots may include filled password values.
  throw new Error(sanitize(String(error.stack ?? error)));
} finally {
  await browser.close();
  await writeFile(
    path.join(artifacts, 'identity-result.json'),
    JSON.stringify({ results, errors }, null, 2)
  );
}
