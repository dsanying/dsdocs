import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { randomBytes, randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { setTimeout as delay } from 'node:timers/promises';
import { chromium, firefox, expect } from '../apps/admin/node_modules/@playwright/test/index.mjs';

const root = path.resolve(import.meta.dirname, '..');
const site = path.join(root, 'apps/site');
const temporary = await mkdtemp(path.join(tmpdir(), 'dsdocs-integration-'));
const port = Number(process.env.DSDOCS_TEST_PORT ?? 3210);
const origin = `http://localhost:${port}`;
const artifacts = process.env.DSDOCS_ARTIFACTS;
const password = randomBytes(24).toString('base64url');
const env = {
  ...process.env,
  DSDOCS_DATABASE: path.join(temporary, 'test.sqlite'),
  DSDOCS_ORIGIN: origin,
  DSDOCS_ADMIN_USERNAME: 'integration-admin',
  DSDOCS_ADMIN_PASSWORD: password,
};
let server;
function child(args) {
  return spawn(process.execPath, args, { cwd: site, env, stdio: ['ignore', 'pipe', 'pipe'] });
}
async function waitReady() {
  for (let i = 0; i < 150; i++) {
    if (server.exitCode !== null) throw new Error('Integration server exited');
    try {
      if ((await fetch(`${origin}/docs/api/v1/session`)).ok) return;
    } catch {}
    await delay(200);
  }
  throw new Error('Integration server did not become ready');
}
try {
  const init = child(['node_modules/tsx/dist/cli.mjs', 'scripts/init.ts']);
  const [code] = await once(init, 'exit');
  assert.equal(code, 0, 'Database initialization failed');
  server = child(['node_modules/next/dist/bin/next', 'start', '-p', String(port)]);
  let serverErrors = '';
  server.stderr.on('data', (chunk) => {
    serverErrors += chunk.toString();
  });
  await waitReady();
  if (artifacts) await mkdir(artifacts, { recursive: true });
  for (const [name, engine] of [
    ['chromium', chromium],
    ['firefox', firefox],
  ]) {
    const browser = await engine.launch(
      name === 'firefox' && process.env.PW_FIREFOX_EXECUTABLE
        ? { executablePath: process.env.PW_FIREFOX_EXECUTABLE }
        : {}
    );
    try {
      const context = await browser.newContext({
        locale: 'zh-CN',
        viewport: { width: 1440, height: 1000 },
      });
      const page = await context.newPage();
      page.setDefaultTimeout(10000);
      const diagnostics = [];
      const expectedHttpErrors = new Map();
      page.on('pageerror', (error) => diagnostics.push(error.message));
      page.on('console', (message) => {
        const expected = expectedHttpErrors.get(message.location().url);
        if (
          expected === 422 &&
          message.type() === 'error' &&
          message.text() ===
            'Failed to load resource: the server responded with a status of 422 (Unprocessable Entity)'
        )
          return;
        if (['warning', 'error'].includes(message.type())) diagnostics.push(message.text());
      });
      await page.addInitScript(() => localStorage.setItem('dsdocs-lang', 'zh-CN'));
      console.log(`${name}: opening admin`);
      await page.goto(`${origin}/docs/admin`);
      await page.getByLabel('用户名', { exact: true }).fill('integration-admin');
      await page.getByLabel('密码', { exact: true }).fill(password);
      await page.getByRole('button', { name: /登\s*录/ }).click();
      await expect(page.getByRole('heading', { level: 1 })).toHaveText('文档');
      console.log(`${name}: logged in`);
      const csrf = (await (await context.request.get(`${origin}/docs/api/v1/session`)).json()).csrf;
      async function api(route, method = 'GET', data) {
        const response = await context.request.fetch(`${origin}/docs/api/v1/${route}`, {
          method,
          headers: { Origin: origin, 'X-CSRF-Token': csrf },
          ...(data === undefined ? {} : { data }),
        });
        assert.ok(response.ok(), `${method} ${route} failed: ${response.status()}`);
        return response.json();
      }
      const imageUpload = {
        name: 'pixel.png',
        mime: 'image/png',
        data: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+ip1sAAAAASUVORK5CYII=',
      };
      const asset = await api('assets', 'POST', imageUpload);
      async function fillSource(source) {
        const editor = page.getByRole('group', { name: 'MDX 源码', exact: true });
        await editor.getByRole('tab', { name: 'MDX', exact: true }).click();
        await editor.locator('textarea').fill(source);
      }
      const title = `集成验收 ${name}`;
      const mdx =
        '## 连接服务\n\n公开正文。\n\n<Callout title="连接前检查">确认网络与权限。</Callout>\n\n<Tabs items={["配置", "验证"]}><Tab value="配置">使用平台地址。</Tab><Tab value="验证">发送短消息。</Tab></Tabs>\n\n| 参数 | 含义 |\n| --- | --- |\n| model | 模型编号 |\n\n```json\n{"model":"demo"}\n```\n\n公式：$E=mc^2$\n\n$$\na^2+b^2=c^2\n$$' +
        `\n\n![附件示例](${asset.url})`;
      await page.goto(`${origin}/docs/admin/documents/new`);
      await page.getByLabel('标题', { exact: true }).fill(title);
      await page.getByLabel('页面路径', { exact: true }).fill(`api/${name}-zh`);
      await page.getByLabel('目录', { exact: true }).fill('产品/API');
      await fillSource(mdx);
      await page.getByRole('button', { name: /保\s*存/ }).click();
      await expect(page.getByRole('heading', { level: 1 })).toHaveText(title);
      const id = page.url().split('/').at(-1);
      await page.getByRole('button', { name: /发\s*布/ }).click();
      await expect(page.getByText('已发布', { exact: true })).toBeVisible();
      console.log(`${name}: published Chinese document`);
      const doc = await api(`documents/${id}`);
      assert.equal(
        doc.draft.mdx,
        mdx,
        'Source edits must be saved exactly, including the final input'
      );
      // The publish notice overlaps the header actions and pauses while hovered.
      // Dismiss it with its real close control before starting the next action.
      for (const close of await page.locator('.ant-notification-notice-close').all())
        await close.click();
      await page.getByRole('button', { name: /新增翻译$/ }).click();
      await expect(page.getByRole('radio', { name: 'English', exact: true })).toBeChecked();
      await page.getByLabel('标题', { exact: true }).fill(`Integration ${name}`);
      await page.getByLabel('页面路径', { exact: true }).fill(`guide/${name}-en`);
      await page.getByLabel('目录', { exact: true }).fill('Product/API');
      await fillSource('## Connect\n\nEnglish translation.');
      await page.getByRole('button', { name: /保\s*存/ }).click();
      await expect(page.getByRole('heading', { level: 1 })).toHaveText(`Integration ${name}`);
      const english = { document: await api(`documents/${page.url().split('/').at(-1)}`) };
      assert.equal(english.document.draft.translationKey, doc.draft.translationKey);
      await api(`documents/${english.document.id}/publish`, 'POST', {
        expectedRevision: 1,
        operationId: randomUUID(),
      });
      await page.goto(`${origin}/docs/admin/documents/detail/${id}`);
      await page.getByRole('button', { name: /查看翻译$/ }).click();
      await expect(page).toHaveURL(new RegExp(english.document.id + '$'));
      console.log(`${name}: linked English translation`);
      const reader = await browser.newContext({
        locale: 'zh-CN',
        viewport: { width: 1440, height: 1000 },
      });
      const publicPage = await reader.newPage();
      publicPage.on('pageerror', (error) => diagnostics.push(error.message));
      await publicPage.goto(`${origin}/docs/zh/api/${name}-zh`);
      await expect(publicPage.getByRole('heading', { level: 1 })).toHaveText(title);
      await expect(publicPage.getByRole('link', { name: title, exact: true })).toHaveAttribute(
        'href',
        `/docs/zh/api/${name}-zh`
      );
      await expect(publicPage.getByText('确认网络与权限。', { exact: true })).toBeVisible();
      await expect(
        publicPage.getByRole('button', { name: '搜索文档', exact: false })
      ).toBeVisible();
      await publicPage.getByRole('button', { name: '搜索文档', exact: false }).click();
      await publicPage.getByRole('combobox').fill('公开正文');
      await publicPage.getByRole('option', { name: new RegExp(title) }).click();
      await expect(publicPage).toHaveURL(`${origin}/docs/zh/api/${name}-zh`);
      await publicPage.getByRole('tab', { name: '验证', exact: true }).click();
      await expect(publicPage.getByText('发送短消息。', { exact: true })).toBeVisible();
      assert.equal(await publicPage.locator('.katex').count(), 2);
      await expect
        .poll(() =>
          publicPage
            .getByAltText('附件示例')
            .evaluate((image) => image.complete && image.naturalWidth > 0)
        )
        .toBe(true);
      if (artifacts)
        await publicPage.screenshot({
          path: path.join(artifacts, `${name}-reader.png`),
          fullPage: true,
        });
      await publicPage.getByRole('button', { name: '选择语言', exact: true }).click();
      await publicPage.getByRole('button', { name: 'English', exact: true }).click();
      await expect(publicPage).toHaveURL(`${origin}/docs/en/guide/${name}-en`);
      assert.equal(await publicPage.evaluate(() => localStorage.getItem('dsdocs-language')), 'en');
      await publicPage.goto(`${origin}/docs`);
      await expect(publicPage).toHaveURL(/\/docs\/en\//);
      await api(`documents/${id}`, 'PUT', {
        expectedRevision: 1,
        operationId: randomUUID(),
        document: {
          ...doc.draft,
          number: undefined,
          actor: undefined,
          createdAt: undefined,
          title: '未发布标题',
          mdx: '未发布秘密',
        },
      });
      await publicPage.goto(`${origin}/docs/zh/api/${name}-zh`);
      await expect(publicPage.getByRole('heading', { level: 1 })).toHaveText(title);
      await expect(publicPage.getByText('未发布秘密', { exact: true })).toHaveCount(0);
      const anonymousSearch = await publicPage.request.get(
        `${origin}/docs/api/v1/search?locale=zh&query=${encodeURIComponent('未发布秘密')}`
      );
      assert.deepEqual(await anonymousSearch.json(), []);
      await page.goto(`${origin}/docs/admin/documents/detail/${id}/edit`);
      await page.getByLabel('标题', { exact: true }).fill('预览中的草稿');
      const privateAsset = await api('assets', 'POST', imageUpload);
      assert.equal((await publicPage.request.get(`${origin}${privateAsset.url}`)).status(), 404);
      await fillSource(`## 未发布预览\n\n![私人附件](${privateAsset.url})`);
      await page.getByRole('button', { name: /预览$/ }).click();
      await expect(page.frameLocator('iframe').getByRole('heading', { level: 1 })).toHaveText(
        '预览中的草稿'
      );
      await expect
        .poll(() =>
          page
            .frameLocator('iframe')
            .getByAltText('私人附件')
            .evaluate((image) => image.complete && image.naturalWidth > 0)
        )
        .toBe(true);
      const previewUrl = await page.locator('iframe').getAttribute('src');
      assert.equal((await publicPage.request.get(`${origin}${previewUrl}`)).status(), 404);
      if (artifacts)
        await page.screenshot({ path: path.join(artifacts, `${name}-admin.png`), fullPage: true });
      // Exercise visual editing, account lifecycle and the management pages through real HTTP/UI.
      await page.getByRole('button', { name: '取消', exact: true }).click();
      assert.equal(
        (await api(`documents/${id}`)).draft.mdx,
        '未发布秘密',
        'Cancel must not save the private preview'
      );
      await page.goto(`${origin}/docs/admin/documents/new`);
      await page.getByLabel('标题', { exact: true }).fill(`可视化 ${name}`);
      await page.getByLabel('页面路径', { exact: true }).fill(`visual-${name}`);
      const visual = page.getByRole('group', { name: 'MDX 源码', exact: true });
      await visual.locator('[contenteditable="true"]').first().fill('可视化编辑的正文');
      await page.getByRole('button', { name: '保存', exact: true }).click();
      await expect(page.getByRole('heading', { level: 1 })).toHaveText(`可视化 ${name}`);
      assert.match(
        (await api(`documents/${page.url().split('/').at(-1)}`)).draft.mdx,
        /可视化编辑的正文/
      );
      await page.goto(`${origin}/docs/admin/documents/new`);
      await page.getByLabel('标题', { exact: true }).fill(`非法草稿 ${name}`);
      await page.getByLabel('页面路径', { exact: true }).fill(`invalid-${name}`);
      await fillSource('<Tabs');
      await page.getByRole('button', { name: '保存', exact: true }).click();
      await expect(page.getByRole('heading', { level: 1 })).toHaveText(`非法草稿 ${name}`);
      const invalidId = page.url().split('/').at(-1);
      assert.equal(
        (await api(`documents/${invalidId}`)).draft.mdx,
        '<Tabs',
        'Malformed source must survive an immediate draft save'
      );
      expectedHttpErrors.set(`${origin}/docs/api/v1/documents/${invalidId}/publish`, 422);
      const rejection = page.waitForResponse((response) =>
        response.url().endsWith(`/documents/${invalidId}/publish`)
      );
      await page.getByRole('button', { name: '发布', exact: true }).click();
      assert.equal((await rejection).status(), 422);
      assert.equal((await api(`documents/${invalidId}`)).publishedRevision, null);
      await page.goto(`${origin}/docs/admin/documents/detail/${id}`);
      await page.getByRole('tab', { name: '历史版本', exact: true }).click();
      await page.getByRole('button', { name: /^1 ·/ }).click();
      await page.getByRole('button', { name: '恢复为草稿', exact: true }).click();
      await expect.poll(async () => (await api(`documents/${id}`)).revision).toBe(3);
      assert.equal((await api(`documents/${id}`)).draft.mdx, mdx);
      await page.goto(`${origin}/docs/admin/documents/detail/${invalidId}`);
      await page.getByRole('button', { name: '删除', exact: true }).click();
      await page.getByRole('button', { name: /确\s*定/ }).click();
      await expect(page.getByRole('heading', { level: 1 })).toHaveText('文档');
      await page.goto(`${origin}/docs/admin/users`);
      await page.getByRole('button', { name: '新增', exact: true }).click();
      const drawer = page.getByRole('dialog'),
        managerName = `manager-${name}`,
        managerPassword = randomBytes(24).toString('base64url');
      await drawer.getByLabel('用户名', { exact: true }).fill(managerName);
      await drawer.getByLabel('密码', { exact: true }).fill(managerPassword);
      await drawer.getByRole('button', { name: '保存', exact: true }).click();
      await expect(drawer).toHaveCount(0);
      const row = page.getByRole('row').filter({ hasText: managerName });
      await expect(row).toBeVisible();
      const managerContext = await browser.newContext();
      async function managerLogin(pass) {
        return managerContext.request.post(`${origin}/docs/api/v1/login`, {
          headers: { Origin: origin },
          data: { username: managerName, password: pass },
        });
      }
      assert.equal((await managerLogin(managerPassword)).status(), 200);
      assert.equal((await managerContext.request.get(`${origin}/docs/api/v1/users`)).status(), 200);
      assert.equal((await managerContext.request.get(`${origin}/docs/api/v1/audit`)).status(), 200);
      await row.getByRole('button', { name: '编辑', exact: true }).click();
      await expect(drawer.getByRole('radio', { name: '允许管理', exact: true })).toBeChecked();
      await expect(drawer.getByRole('button', { name: '保存', exact: true })).toHaveCount(0);
      await drawer.getByRole('radio', { name: '禁止进入', exact: true }).check();
      await drawer.getByRole('button', { name: '保存', exact: true }).click();
      await expect(drawer).toHaveCount(0);
      assert.equal(
        (await managerContext.request.get(`${origin}/docs/api/v1/documents`)).status(),
        401
      );
      assert.equal((await managerLogin(managerPassword)).status(), 401);
      await row.getByRole('button', { name: '编辑', exact: true }).click();
      await expect(drawer.getByRole('radio', { name: '禁止进入', exact: true })).toBeChecked();
      await drawer.getByRole('radio', { name: '允许管理', exact: true }).check();
      await drawer.getByRole('button', { name: '保存', exact: true }).click();
      await expect(drawer).toHaveCount(0);
      assert.equal((await managerLogin(managerPassword)).status(), 200);
      const replacement = randomBytes(24).toString('base64url');
      await row.getByRole('button', { name: '编辑', exact: true }).click();
      await drawer.getByLabel('密码', { exact: true }).fill(replacement);
      await drawer.getByRole('button', { name: '保存', exact: true }).click();
      await expect(drawer).toHaveCount(0);
      assert.equal((await managerContext.request.get(`${origin}/docs/api/v1/users`)).status(), 401);
      assert.equal((await managerLogin(managerPassword)).status(), 401);
      assert.equal((await managerLogin(replacement)).status(), 200);
      await managerContext.close();
      for (const route of ['assets', 'components', 'audit']) {
        await page.goto(`${origin}/docs/admin/${route}`);
        await expect(page.getByRole('table')).toBeVisible();
        if (route === 'assets') {
          const filename = `000-temporary-${name}.png`;
          await page.locator('input[type=file]').setInputFiles({
            name: filename,
            mimeType: 'image/png',
            buffer: Buffer.from(imageUpload.data, 'base64'),
          });
          const temporaryRow = page.getByRole('row').filter({ hasText: filename });
          await expect(temporaryRow).toBeVisible();
          await temporaryRow.getByRole('button', { name: '删除', exact: true }).click();
          await page.getByRole('button', { name: /确\s*定/ }).click();
          await expect(temporaryRow).toHaveCount(0);
        }

        const columns = await page.locator('.ant-table-thead th').evaluateAll((cells) =>
          cells.map((cell) => ({
            x: cell.getBoundingClientRect().x,
            width: cell.getBoundingClientRect().width,
          }))
        );
        const cells = await page
          .locator('.ant-table-tbody tr[data-row-key]')
          .first()
          .locator('td')
          .evaluateAll((cells) =>
            cells.map((cell) => ({
              x: cell.getBoundingClientRect().x,
              width: cell.getBoundingClientRect().width,
            }))
          );
        if (cells.length) {
          assert.equal(columns.length, cells.length);
          columns.forEach((column, index) => {
            assert.ok(Math.abs(column.x - cells[index].x) <= 1);
            assert.ok(Math.abs(column.width - cells[index].width) <= 1);
          });
        }
      }
      await page.getByRole('button', { name: '切换主题', exact: true }).click();
      await page.getByRole('menuitem', { name: '深色', exact: true }).click();
      assert.equal(await page.locator('html').getAttribute('data-theme'), 'dark');
      await page.setViewportSize({ width: 390, height: 844 });
      try {
        await expect
          .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
          .toBe(true);
      } catch {
        console.error(
          'OVERFLOW',
          await page.evaluate(() =>
            Array.from(document.querySelectorAll('body *'))
              .filter((el) => el.getBoundingClientRect().right > innerWidth + 1)
              .slice(0, 12)
              .map((el) => ({
                tag: el.tagName,
                class: el.className,
                width: el.getBoundingClientRect().width,
                right: el.getBoundingClientRect().right,
              }))
          )
        );
        if (artifacts)
          await page.screenshot({ path: path.join(artifacts, `${name}-overflow.png`) });
        throw new Error('Mobile management page overflow');
      }
      if (artifacts)
        await page.screenshot({
          path: path.join(artifacts, `${name}-admin-mobile.png`),
          fullPage: true,
        });
      await page.getByRole('button', { name: '选择语言', exact: true }).click();
      await page.getByRole('menuitem', { name: 'English', exact: true }).click();
      await expect(page.getByRole('heading', { level: 1 })).toHaveText('Audit log');
      console.log(
        `${name}: visual edit, exact source save, equal manager access, account disable/re-enable/password/session revocation, management tables, dark/mobile/English UI passed`
      );
      await publicPage.setViewportSize({ width: 390, height: 844 });
      await publicPage.reload();
      assert.ok(
        await publicPage.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
        'Mobile document overflow'
      );
      const englishReader = await browser.newContext({ locale: 'en-US' });
      const englishPage = await englishReader.newPage();
      await englishPage.goto(`${origin}/docs`);
      await expect(englishPage).toHaveURL(/\/docs\/en\//);
      const firefoxLayoutWarning = `[JavaScript Warning: "Layout was forced before the page was fully loaded. If stylesheets are not yet loaded this may cause a flash of unstyled content." {file: "${origin}${previewUrl}" line: 0}]`;
      // Firefox emits this engine warning for the freshly loaded, same-origin iframe.
      // Match only this engine, exact text and this run's exact preview document.
      const unexpected = diagnostics.filter(
        (message) => !(name === 'firefox' && message === firefoxLayoutWarning)
      );
      assert.deepEqual(unexpected, [], 'Unexpected browser diagnostics');
      await englishReader.close();
      await reader.close();
      await context.close();
      console.log(
        `PASS ${name}: login, MDX editing/publishing, native components, translation links, language preference, draft isolation, private preview, mobile layout`
      );
    } finally {
      await browser.close();
    }
  }
  assert.ok(!serverErrors.includes('[dsdocs] Request failed'), 'Server request failure');
} finally {
  if (server) {
    server.kill('SIGTERM');
    await once(server, 'exit');
  }
  await rm(temporary, { recursive: true, force: true });
}
