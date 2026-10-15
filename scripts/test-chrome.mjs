import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, writeFile, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { setTimeout as delay } from 'node:timers/promises';
import { chromium, expect } from '../apps/admin/node_modules/@playwright/test/index.mjs';

// All business mutations in this suite are performed through actual UI controls.
// Response observation measures real requests; it does not replace UI actions.
const root = path.resolve(import.meta.dirname, '..');
const temporary = await mkdtemp(path.join(tmpdir(), 'dsdocs-chrome-'));
const output = process.env.DSDOCS_ARTIFACTS ?? path.join(temporary, 'evidence');
await mkdir(output, { recursive: true, mode: 0o700 });
const port = Number(process.env.DSDOCS_TEST_PORT ?? 14220);
const origin = `http://localhost:${port}`;
const password = randomBytes(24).toString('base64url');
const username = 'chrome-manager';
const env = {
  ...process.env,
  DSDOCS_DATABASE: path.join(temporary, 'test.sqlite'),
  DSDOCS_ORIGIN: origin,
  DSDOCS_ADMIN_USERNAME: username,
  DSDOCS_ADMIN_PASSWORD: password,
};
const uiEndpoints = [
  'GET session',
  'POST login',
  'POST logout',
  'GET assets/:id',
  'GET search',
  'GET components',
  'GET documents',
  'POST documents',
  'GET documents/:id',
  'PUT documents/:id',
  'DELETE documents/:id',
  'GET documents/:id/translations',
  'GET documents/:id/revisions',
  'POST documents/:id/restore',
  'POST documents/:id/publish',
  'POST documents/:id/unpublish',
  'POST preview',
  'GET users',
  'POST users',
  'PATCH users/:id',
  'GET audit',
  'GET export/files',
  'GET assets',
  'POST assets',
  'DELETE assets/:id',
];
const expectedErrors = new Set();
const coverageSnapshots = [];
const calls = [],
  cases = [],
  search = [],
  diagnostics = [],
  pending = [];
let server, browser, page, reader, readerContext;
const child = (args) =>
  spawn(process.execPath, args, {
    cwd: path.join(root, 'apps/site'),
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
const button = (name, target = page) => target.getByRole('button', { name, exact: true });
async function clearNotices(target = page) {
  for (const close of await target.locator('.ant-notification-notice-close').all())
    await close.click();
}
async function step(name, run) {
  const start = performance.now();
  try {
    const result = await run();
    cases.push({ name, passed: true, ms: Math.round(performance.now() - start) });
    coverageSnapshots.push(...(await page.coverage.stopJSCoverage()));
    await page.coverage.startJSCoverage({ resetOnNavigation: false });
    console.log(`PASS ${name}`);
    return result;
  } catch (error) {
    cases.push({ name, passed: false, error: error.message });
    throw error;
  }
}
function observe(context) {
  context.on('response', (response) => {
    const url = new URL(response.url());
    if (url.origin === origin && url.pathname.startsWith('/docs/api/v1/')) {
      const request = response.request();
      const item = {
        method: request.method(),
        path: url.pathname.replace(/\b[a-f0-9-]{36}\b/g, ':id'),
        query: url.search,
        status: response.status(),
        ms: null,
      };
      calls.push(item);
      pending.push(
        response.finished().then(
          () => {
            const timing = request.timing();
            item.ms = Math.round(timing.responseEnd);
          },
          (error) => {
            item.completionError = error.message;
          }
        )
      );
    }
  });
  context.on('page', (target) => {
    target.on('pageerror', (error) =>
      diagnostics.push({ kind: 'pageerror', message: error.message })
    );
    target.on('console', (message) => {
      if (['error', 'warning'].includes(message.type()))
        diagnostics.push({
          kind: message.type(),
          message: message.text(),
          url: message.location().url,
        });
    });
  });
}
async function navigate(route, target = page) {
  await target.goto(`${origin}/docs/${route}`);
}
async function mutate(method, suffix, action, status = 200) {
  if (status >= 400) expectedErrors.add(`${origin}/docs/api/v1/${suffix}|${status}`);
  const response = page.waitForResponse(
    (r) =>
      new URL(r.url()).pathname.endsWith(`/api/v1/${suffix}`) && r.request().method() === method
  );
  await clearNotices();
  await action();
  const result = await response;
  assert.equal(result.status(), status, `${method} ${suffix}`);
  return result;
}
async function login(target, name = username, pass = password, expected = 200) {
  if (expected >= 400) expectedErrors.add(`${origin}/docs/api/v1/login|${expected}`);
  await navigate('admin', target);
  await target.getByLabel('用户名', { exact: true }).fill(name);
  await target.getByLabel('密码', { exact: true }).fill(pass);
  const response = target.waitForResponse((r) => r.url().endsWith('/api/v1/login'));
  await target.getByRole('button', { name: /登\s*录/ }).click();
  assert.equal((await response).status(), expected);
  if (expected === 200) await expect(target.getByRole('heading', { level: 1 })).toHaveText('文档');
}
async function source(text) {
  const editor = page.getByRole('group', { name: 'MDX 源码', exact: true });
  await editor.getByRole('tab', { name: 'MDX', exact: true }).click();
  await editor.locator('textarea').fill(text);
}
async function save(id) {
  const response = await mutate(
    id ? 'PUT' : 'POST',
    id ? `documents/${id}` : 'documents',
    () => button('保存').click(),
    id ? 200 : 201
  );
  const result = (await response.json()).document;
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(result.draft.title);
  await expect(page).toHaveURL(new RegExp(`/detail/${result.id}$`));
  return result;
}
async function create(title, slug, text, group = '测试/入门') {
  await navigate('admin/documents/new');
  await page.getByLabel('标题', { exact: true }).fill(title);
  await page.getByLabel('页面路径', { exact: true }).fill(slug);
  await page.getByLabel('目录', { exact: true }).fill(group);
  await source(text);
  return save();
}
async function publish(doc) {
  await mutate('POST', `documents/${doc.id}/publish`, () => button('发布').click());
  await expect(page.getByText('已发布', { exact: true })).toBeVisible();
}
async function confirm(name, suffix, method = 'POST', status = 200) {
  return mutate(
    method,
    suffix,
    async () => {
      await button(name).click();
      await page.getByRole('button', { name: /确\s*定/ }).click();
    },
    status
  );
}
async function publicSearch(query, expected, locale = 'zh') {
  await reader.locator('button[data-search-full]').click();
  await reader.getByRole('combobox').fill('');
  await expect(reader.getByRole('option')).toHaveCount(0);
  let response;
  const capture = (result) => {
    const url = new URL(result.url());
    if (url.pathname.endsWith('/api/v1/search') && url.searchParams.get('query') === query)
      response = result;
  };
  reader.on('response', capture);
  const start = performance.now();
  try {
    await reader.getByRole('combobox').fill(query);
    await expect(reader.locator('svg.animate-pulse')).toHaveCount(0);
    const expectedTitles = [...expected].sort();
    await expect
      .poll(async () =>
        (await reader.getByRole('option').allTextContents()).map((x) => x.trim()).sort()
      )
      .toEqual(expectedTitles);
    const elapsed = Math.round(performance.now() - start);
    const actual = (await reader.getByRole('option').allTextContents()).map((x) => x.trim()).sort();
    if (response) {
      assert.equal(response.status(), 200);
      assert.deepEqual((await response.json()).map((x) => x.content).sort(), expectedTitles);
    }
    search.push({
      query,
      locale,
      expected: expectedTitles,
      actual,
      correct: true,
      visibleMs: elapsed,
      cacheHit: !response,
      requestMs: response ? Math.round(response.request().timing().responseEnd) : null,
    });
  } finally {
    reader.off('response', capture);
  }
  await reader.keyboard.press('Escape');
}
try {
  const init = child(['node_modules/tsx/dist/cli.mjs', 'scripts/init.ts']);
  assert.equal((await once(init, 'exit'))[0], 0);
  // Bootstrap credentials are not needed by the long-running server.
  delete env.DSDOCS_ADMIN_USERNAME;
  delete env.DSDOCS_ADMIN_PASSWORD;
  if (process.env.DSDOCS_SERVER_COVERAGE) {
    await mkdir(process.env.DSDOCS_SERVER_COVERAGE, { recursive: true });
    env.NODE_V8_COVERAGE = process.env.DSDOCS_SERVER_COVERAGE;
  }
  server = child(['node_modules/next/dist/bin/next', 'start', '-p', String(port)]);
  server.stderr.on('data', (chunk) => {
    if (chunk.toString().includes('[dsdocs] Request failed'))
      diagnostics.push({ kind: 'server', message: chunk.toString() });
  });
  for (let n = 0; n < 150; n++) {
    try {
      if ((await fetch(`${origin}/docs/api/v1/session`)).ok) break;
    } catch {}
    if (n === 149) throw new Error('Local environment startup timed out');
    await delay(200);
  }
  browser = await chromium.launch({
    channel: 'chrome',
    headless: process.env.DSDOCS_HEADLESS === '1',
  });
  console.log(`Chrome ${browser.version()} — ${origin}`);
  const context = await browser.newContext({
    locale: 'zh-CN',
    viewport: { width: 1440, height: 1000 },
    permissions: ['clipboard-write', 'clipboard-read'],
  });
  observe(context);
  page = await context.newPage();
  await page.coverage.startJSCoverage({ resetOnNavigation: false });
  readerContext = await browser.newContext({
    locale: 'zh-CN',
    viewport: { width: 1440, height: 1000 },
  });
  observe(readerContext);
  reader = await readerContext.newPage();
  let doc, assetUrl, uploadedId, translation, invalid, spare;
  await step('登录、匿名后台拦截与错误密码', async () => {
    await login(page, username, 'incorrect-test-password', 401);
    await login(page);
  });
  await step('附件上传、刷新持久化、复制地址', async () => {
    await page.getByRole('menuitem', { name: '附件', exact: true }).click();
    const response = await mutate(
      'POST',
      'assets',
      () =>
        page.locator('input[type=file]').setInputFiles({
          name: '附件测试.png',
          mimeType: 'image/png',
          buffer: Buffer.from(
            'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+ip1sAAAAASUVORK5CYII=',
            'base64'
          ),
        }),
      201
    );
    const asset = await response.json();
    assetUrl = asset.url;
    uploadedId = asset.id;
    await page.reload();
    const row = page.getByRole('row').filter({ hasText: '附件测试.png' });
    await expect(row).toBeVisible();
    await row.getByRole('button', { name: '复制', exact: true }).click();
    // Clipboard is inspected only for the known, non-sensitive attachment URL.
    assert.equal(await page.evaluate(() => navigator.clipboard.readText()), assetUrl);
  });
  const initial = `## 安装说明\n\n唯一词：星河校验；连接配置和权限检查。\n\n![附件图](${assetUrl})\n\n<Callout title="提示">保存发布后可见。</Callout>`;
  await step('创建MDX、立即保存与刷新读回原文', async () => {
    doc = await create('入门指南', 'guide/start', initial);
    assert.equal(doc.draft.mdx, initial);
    await page.reload();
    await expect(page.locator('.source-content')).toHaveText(initial);
  });
  await step('发布后无需构建即可出现在读者端、目录与图片', async () => {
    await publish(doc);
    await navigate('zh/guide/start', reader);
    await expect(reader.getByRole('heading', { level: 1 })).toHaveText('入门指南');
    await expect(reader.getByRole('button', { name: '测试', exact: true })).toBeVisible();
    await expect
      .poll(() =>
        reader.getByAltText('附件图').evaluate((img) => img.complete && img.naturalWidth > 0)
      )
      .toBe(true);
  });
  await step('前端新增关联译文、发布及读者语言切换', async () => {
    await clearNotices();
    await button('新增翻译').click();
    await expect(page.getByRole('radio', { name: 'English', exact: true })).toBeChecked();
    await page.getByLabel('标题', { exact: true }).fill('Getting started');
    await page.getByLabel('页面路径', { exact: true }).fill('guide/start');
    await page.getByLabel('目录', { exact: true }).fill('Guide');
    await source('## Setup\n\nUnique phrase: starlight verification.');
    translation = await save();
    await publish(translation);
    await reader.reload();
    await button('选择语言', reader).click();
    await button('English', reader).click();
    await expect(reader.getByRole('heading', { level: 1 })).toHaveText('Getting started');
    await publicSearch('STARLIGHT', ['Getting started'], 'en');
    await button('Choose a language', reader).click();
    await button('简体中文', reader).click();
    await expect(reader.getByRole('heading', { level: 1 })).toHaveText('入门指南');
  });
  await step('构建12篇独立搜索语料并验证分页、筛选', async () => {
    for (let i = 1; i <= 11; i++) {
      const d = await create(
        `样例 ${i}`,
        `samples/item-${i}`,
        `## 样例主题\n\n${i % 2 ? '蓝鲸索引' : '紫竹检索'}；独立编号 token${String(i).padStart(2, '0')}。`,
        '样例目录'
      );
      await publish(d);
    }
    await navigate('admin/documents');
    await expect(page.locator('tr[data-row-key]')).toHaveCount(10);
    await page.getByTitle('2', { exact: true }).click();
    await expect(page.locator('tr[data-row-key]')).toHaveCount(3);
    await page.getByLabel('关键词', { exact: true }).fill('样例 11');
    await button(/搜\s*索/).click();
    await expect(page.locator('tr[data-row-key]')).toHaveCount(1);
    await expect(page.getByRole('link', { name: '样例 11', exact: true })).toBeVisible();
  });
  await step('搜索准确集合、大小写、中英隔离与响应耗时', async () => {
    await reader.reload();
    for (const [q, expected] of [
      ['星河校验', ['入门指南']],
      ['  星河校验  ', ['入门指南']],
      ['蓝鲸索引', [1, 3, 5, 7, 9, 11].map((i) => `样例 ${i}`)],
      ['紫竹检索', [2, 4, 6, 8, 10].map((i) => `样例 ${i}`)],
      ['token01', ['样例 1']],
      ['TOKEN02', ['样例 2']],
      ['starlight', []],
      ['不存在的检索词', []],
    ])
      await publicSearch(q, expected);
    for (let i = 0; i < 5; i++) await publicSearch('星河校验', ['入门指南']);
  });
  await step('修改目录名、标题、路径、排序和正文：草稿不影响公开快照', async () => {
    await navigate(`admin/documents/detail/${doc.id}/edit`);
    await page.getByLabel('目录', { exact: true }).fill('帮助中心/快速开始');
    await page.getByLabel('标题', { exact: true }).fill('新的入门标题');
    await page.getByLabel('页面路径', { exact: true }).fill('guide/renamed');
    await page.getByLabel('排序', { exact: true }).fill('5');
    await source(`## 更新章节\n\n新版本正文，更新唯一词：银河更新。\n\n![附件图](${assetUrl})`);
    doc = await save(doc.id);
    await page.reload();
    await expect(page.getByText('帮助中心/快速开始', { exact: true })).toBeVisible();
    await reader.reload();
    await expect(reader.getByRole('heading', { level: 1 })).toHaveText('入门指南');
    await expect(reader.getByText('银河更新', { exact: false })).toHaveCount(0);
    await publicSearch('银河更新', []);
  });
  await step('发布改名后公开路由、目录、正文、搜索自动采用新快照', async () => {
    await publish(doc);
    await publicSearch('银河更新', ['新的入门标题']);
    await navigate('zh/guide/renamed', reader);
    await expect(reader.getByRole('heading', { level: 1 })).toHaveText('新的入门标题');
    await expect(reader.getByRole('button', { name: '帮助中心', exact: true })).toBeVisible();
    await expect(reader.getByRole('button', { name: '快速开始', exact: true })).toBeVisible();
    await expect(
      reader.getByText('新版本正文，更新唯一词：银河更新。', { exact: true })
    ).toBeVisible();
    expectedErrors.add(`${origin}/docs/zh/guide/start|404`);
    const response = await reader.goto(`${origin}/docs/zh/guide/start`);
    assert.equal(response.status(), 404);
    await navigate('zh/guide/renamed', reader);
    await publicSearch('银河更新', ['新的入门标题']);
    await publicSearch('星河校验', []);
    await reader.screenshot({
      path: path.join(output, 'chrome-reader-renamed.png'),
      fullPage: true,
    });
  });
  await step('历史恢复为新草稿、原发布版本保持不变', async () => {
    await page.getByRole('tab', { name: '历史版本', exact: true }).click();
    await button(/^1 ·/).click();
    const response = await mutate('POST', `documents/${doc.id}/restore`, () =>
      button('恢复为草稿').click()
    );
    doc = await response.json();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('入门指南');
    await reader.reload();
    await expect(reader.getByRole('heading', { level: 1 })).toHaveText('新的入门标题');
  });
  await step('已引用附件删除被阻止且刷新仍存在', async () => {
    await navigate('admin/assets');
    const row = page.getByRole('row').filter({ hasText: '附件测试.png' });
    await mutate(
      'DELETE',
      `assets/${uploadedId}`,
      async () => {
        await row.getByRole('button', { name: '删除', exact: true }).click();
        await page.getByRole('button', { name: /确\s*定/ }).click();
      },
      409
    );
    await page.reload();
    await expect(row).toBeVisible();
  });
  await step('未引用附件上传、删除确认取消、删除与刷新持久化', async () => {
    const upload = await mutate(
      'POST',
      'assets',
      () =>
        page.locator('input[type=file]').setInputFiles({
          name: '可删除.pdf',
          mimeType: 'application/pdf',
          buffer: Buffer.from('%PDF-1.4\n%%EOF'),
        }),
      201
    );
    const { id } = await upload.json();
    const row = page.getByRole('row').filter({ hasText: '可删除.pdf' });
    await expect(row).toBeVisible();
    await row.getByRole('button', { name: '删除', exact: true }).click();
    await page.getByRole('button', { name: /取\s*消/ }).click();
    await expect(row).toBeVisible();
    await mutate('DELETE', `assets/${id}`, async () => {
      await row.getByRole('button', { name: '删除', exact: true }).click();
      await page.getByRole('button', { name: /确\s*定/ }).click();
    });
    await page.reload();
    await expect(row).toHaveCount(0);
  });
  await step('可视化编辑立即保存、取消和未保存导航拦截', async () => {
    await navigate('admin/documents/new');
    await page.getByLabel('标题', { exact: true }).fill('可视化保存');
    await page.getByLabel('页面路径', { exact: true }).fill('visual-save');
    await page.locator('[contenteditable=true]').first().fill('可视化正文即时保存');
    spare = await save();
    assert.match(spare.draft.mdx, /可视化正文即时保存/);
    await button('编辑').click();
    await page.getByLabel('标题', { exact: true }).fill('不应保存');
    await page.getByRole('menuitem', { name: '附件', exact: true }).click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await button('继续编辑', page.getByRole('dialog')).click();
    await expect(page.getByLabel('标题', { exact: true })).toHaveValue('不应保存');
    await button('取消').click();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('可视化保存');
  });
  await step('私有预览与未完成语法草稿保存、非法发布拒绝', async () => {
    invalid = await create('非法草稿', 'invalid-source', '<Tabs');
    assert.equal(invalid.draft.mdx, '<Tabs');
    await mutate('POST', `documents/${invalid.id}/publish`, () => button('发布').click(), 422);
    await button('编辑').click();
    await source('## 私有草稿\n\n预览独有内容。');
    await button('预览').click();
    await expect(page.frameLocator('iframe').getByRole('heading', { level: 1 })).toHaveText(
      '非法草稿'
    );
    await expect(
      page.frameLocator('iframe').getByText('预览独有内容。', { exact: true })
    ).toBeVisible();
    const privateUrl = await page.locator('iframe').getAttribute('src');
    const outsider = await readerContext.newPage();
    expectedErrors.add(`${origin}${privateUrl}|404`);
    assert.equal((await outsider.goto(`${origin}${privateUrl}`)).status(), 404);
    await outsider.close();
    await button('取消').click();
    await expect(page.locator('.source-content')).toHaveText('<Tabs');
  });
  await step('发布、下线与删除同步移除读者页面和搜索', async () => {
    await navigate(`admin/documents/detail/${spare.id}`);
    await publish(spare);
    await navigate('zh/visual-save', reader);
    await expect(reader.getByRole('heading', { level: 1 })).toHaveText('可视化保存');
    await publicSearch('可视化正文', ['可视化保存']);
    await confirm('下线', `documents/${spare.id}/unpublish`);
    await publicSearch('可视化正文', []);
    expectedErrors.add(`${origin}/docs/zh/visual-save|404`);
    assert.equal((await reader.reload()).status(), 404);
    await navigate('zh/guide/renamed', reader);
    await publicSearch('可视化正文', []);
    await confirm('删除', `documents/${spare.id}`, 'DELETE');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('文档');
  });
  await step('导出下载包含已发布文件，不含草稿和账号', async () => {
    const waiting = page.waitForEvent('download');
    await button('导出').click();
    const download = await waiting;
    const destination = path.join(output, 'ui-export.zip');
    await download.saveAs(destination);
    const { unzipSync } = await import('../apps/site/node_modules/fflate/esm/index.mjs');
    const files = unzipSync(await readFile(destination));
    assert.ok(Object.keys(files).some((x) => x.includes('guide/renamed.mdx')));
    assert.ok(!Object.keys(files).some((x) => /invalid-source|visual-save|user|session/.test(x)));
  });
  await step('账号前端创建、同权限登录、禁用撤销会话、恢复和改密', async () => {
    await navigate('admin/users');
    await button('新增').click();
    const dialog = page.getByRole('dialog');
    const pass = randomBytes(24).toString('base64url');
    await dialog.getByLabel('用户名', { exact: true }).fill('second-manager');
    await dialog.getByLabel('密码', { exact: true }).fill(pass);
    await dialog.getByRole('button', { name: '保存', exact: true }).click();
    await expect(dialog).toHaveCount(0);
    const other = await browser.newContext({ locale: 'zh-CN' });
    observe(other);
    const otherPage = await other.newPage();
    await login(otherPage, 'second-manager', pass);
    await otherPage.getByRole('menuitem', { name: '用户', exact: true }).click();
    await expect(otherPage.getByRole('heading', { level: 1 })).toHaveText('用户');
    const row = page.getByRole('row').filter({ hasText: 'second-manager' });
    await row.getByRole('button', { name: '编辑', exact: true }).click();
    await dialog.getByRole('radio', { name: '禁止进入', exact: true }).check();
    await dialog.getByRole('button', { name: '保存', exact: true }).click();
    await expect(dialog).toHaveCount(0);
    await otherPage.reload();
    await expect(otherPage.getByLabel('用户名', { exact: true })).toBeVisible();
    await login(otherPage, 'second-manager', pass, 401);
    await row.getByRole('button', { name: '编辑', exact: true }).click();
    await dialog.getByRole('radio', { name: '允许管理', exact: true }).check();
    await dialog.getByRole('button', { name: '保存', exact: true }).click();
    await expect(dialog).toHaveCount(0);
    await login(otherPage, 'second-manager', pass);
    const replacement = randomBytes(24).toString('base64url');
    await row.getByRole('button', { name: '编辑', exact: true }).click();
    await dialog.getByLabel('密码', { exact: true }).fill(replacement);
    await dialog.getByRole('button', { name: '保存', exact: true }).click();
    await expect(dialog).toHaveCount(0);
    await otherPage.reload();
    await expect(otherPage.getByLabel('用户名', { exact: true })).toBeVisible();
    await login(otherPage, 'second-manager', pass, 401);
    await login(otherPage, 'second-manager', replacement);
    await other.close();
  });
  await step('所有菜单、暗色、英文、移动导航、审计和退出', async () => {
    for (const name of ['文档', '附件', '组件', '用户', '审计日志']) {
      await page.getByRole('menuitem', { name, exact: true }).click();
      await expect(page.getByRole('heading', { level: 1 })).toHaveText(name);
      await expect(page.getByRole('table')).toBeVisible();
    }
    await button('切换主题').click();
    await page.getByRole('menuitem', { name: '深色', exact: true }).click();
    await page.screenshot({ path: path.join(output, 'chrome-admin-audit.png'), fullPage: true });
    await page.setViewportSize({ width: 390, height: 844 });
    await expect
      .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
      .toBe(true);
    await button('打开导航').click();
    await page.getByRole('dialog').getByRole('menuitem', { name: '文档', exact: true }).click();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('文档');
    await button('选择语言').click();
    await page.getByRole('menuitem', { name: 'English', exact: true }).click();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Documents');
    await page.screenshot({ path: path.join(output, 'chrome-admin-mobile.png'), fullPage: true });
    await button('Sign out').click();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('dsdocs');
  });
  const coverage = [...coverageSnapshots, ...(await page.coverage.stopJSCoverage())];
  const unexpected = diagnostics.filter((item) => {
    const status = item.message.match(
      /^Failed to load resource: the server responded with a status of (\d+) \([^)]+\)$/
    )?.[1];
    return !status || !expectedErrors.has(`${item.url}|${status}`);
  });
  assert.deepEqual(unexpected, [], 'Unexpected browser/server diagnostics');
  const observed = new Set(
    calls.map((item) => `${item.method} ${item.path.replace('/docs/api/v1/', '')}`)
  );
  assert.deepEqual(
    uiEndpoints.filter((endpoint) => !observed.has(endpoint)),
    [],
    'Every existing UI endpoint must be exercised'
  );
  await writeFile(path.join(output, 'browser-v8-coverage.json'), JSON.stringify(coverage));
  await context.close();
  await readerContext.close();
} catch (error) {
  if (page)
    await page
      .screenshot({ path: path.join(output, 'failure.png'), fullPage: true })
      .catch(() => {});
  throw error;
} finally {
  await Promise.allSettled(pending);
  await writeFile(
    path.join(output, 'chrome-report.json'),
    JSON.stringify(
      {
        chrome: browser?.version(),
        cases,
        search,
        calls,
        diagnostics,
        limits: [
          'UI suite covers reachable business flows, not every source line or every failure branch.',
          'Existing open reader tabs do not have push updates; database mode reads new publication on navigation/reload.',
          'Standalone static reader still needs export and rebuild.',
        ],
      },
      null,
      2
    )
  );
  if (browser) await browser.close();
  if (server) {
    server.kill('SIGTERM');
    await once(server, 'exit');
  }
  await rm(temporary, { recursive: true, force: true });
}
