import assert from 'node:assert/strict';
import { mkdtemp, cp, readFile, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { spawn } from 'node:child_process';
import { chromium, expect } from '../apps/studio/node_modules/@playwright/test/index.mjs';

const root = path.resolve(import.meta.dirname, '..');
const temporary = await mkdtemp(path.join(tmpdir(), 'dsdocs-manage-'));
const docs = path.join(temporary, 'docs');
await cp(path.join(root, 'apps/reader/content/docs'), docs, { recursive: true });
const artifacts = process.env.DSDOCS_ARTIFACTS ?? temporary;
await mkdir(artifacts, { recursive: true });
const port = Number(process.env.DSDOCS_TEST_PORT ?? 15182);
const origin = `http://127.0.0.1:${port}`;
const env = { ...process.env, DSDOCS_CONTENT_ROOT: docs };
for (const key of [
  'DSDOCS_IDENTITY_API_URL',
  'DSDOCS_IDENTITY_API_TOKEN',
  'DSDOCS_MANAGEMENT_ORIGIN',
])
  delete env[key];
const child = spawn(
  process.execPath,
  ['node_modules/vite/bin/vite.js', '--host', '127.0.0.1', '--port', String(port)],
  { cwd: path.join(root, 'apps/manage'), env, stdio: ['ignore', 'pipe', 'pipe'] }
);
let log = '',
  browser;
const errors = [];
child.stdout.on('data', (d) => {
  log += d;
});
child.stderr.on('data', (d) => {
  log += d;
});
try {
  await expect
    .poll(
      () =>
        fetch(origin)
          .then((r) => r.ok)
          .catch(() => false),
      { timeout: 30000 }
    )
    .toBe(true);
  browser = await chromium.launch({
    channel: process.env.DSDOCS_CHROME_CHANNEL === 'chromium' ? undefined : 'chrome',
    headless: process.env.DSDOCS_HEADLESS === '1',
  });
  const page = await browser.newPage();
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(origin);
  await expect(page.getByText('已保存', { exact: true })).toBeVisible();
  assert.equal(await page.getByRole('button', { name: '账号', exact: true }).count(), 0);
  await page.getByRole('tab', { name: 'MDX', exact: true }).click();
  const original = await readFile(path.join(docs, 'en/getting-started.mdx'), 'utf8');
  await page.locator('textarea').fill(original + '\n\nDSdocs shell verification.\n');
  await expect
    .poll(() => readFile(path.join(docs, 'en/getting-started.mdx'), 'utf8'))
    .toContain('DSdocs shell verification.');
  await page.reload();
  await expect(page.getByText('DSdocs shell verification.', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: '切换主题' }).click();
  await expect
    .poll(() => page.locator('.shell').evaluate((e) => getComputedStyle(e).backgroundColor))
    .toBe('rgb(22, 22, 22)');
  assert.equal(
    await page.locator('.shell').evaluate((e) => getComputedStyle(e).color),
    'rgb(238, 238, 238)'
  );
  await page.screenshot({ path: path.join(artifacts, 'management-desktop.png') });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.reload();
  await expect(page.getByRole('button', { name: '切换目录' })).toBeVisible();
  await page.getByRole('button', { name: '切换目录' }).click();
  await expect(page.getByRole('complementary', { name: '文档目录' })).toBeVisible();
  await page.getByRole('button', { name: '切换目录' }).click();
  await expect(page.getByRole('complementary', { name: '文档目录' })).toBeHidden();
  assert.ok(
    await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
    'mobile layout overflows'
  );
  await page.screenshot({ path: path.join(artifacts, 'management-mobile.png') });
  for (const pathname of [
    '/server/identity.mjs',
    '/@fs' + path.join(root, 'apps/manage/server/identity.mjs'),
  ]) {
    const response = await page.request.get(origin + pathname);
    assert.ok(!response.ok(), 'server adapter exposed by Vite');
  }
  // Synthetic list responses verify the shell's table behavior separately from real identity E2E.
  const accountPage = await browser.newPage();
  accountPage.on('pageerror', (e) => errors.push(e.message));
  await accountPage.route('**/__dsdocs_accounts/capabilities', (route) =>
    route.fulfill({ json: { enabled: true } })
  );
  let firstLoad = true;
  await accountPage.route('**/__dsdocs_accounts', (route) => {
    if (firstLoad) {
      firstLoad = false;
      return route.fulfill({ status: 503, json: { error: '账号服务暂不可用。' } });
    }
    return route.fulfill({
      json: Array.from({ length: 21 }, (_, i) => ({
        id: i + 1,
        username: `member-${String(i + 1).padStart(2, '0')}`,
        name: i === 20 ? '中文匹配' : '测试成员',
        email: '',
        active: true,
      })),
    });
  });
  await accountPage.goto(origin);
  await expect(accountPage.getByText('已保存', { exact: true })).toBeVisible();
  await accountPage.getByRole('tab', { name: 'MDX', exact: true }).click();
  await accountPage.locator('textarea').fill(original + '\n\nSaved while switching panels.\n');
  await accountPage.getByRole('button', { name: '账号', exact: true }).click();
  await expect
    .poll(() => readFile(path.join(docs, 'en/getting-started.mdx'), 'utf8'))
    .toContain('Saved while switching panels.');
  await expect(accountPage.getByRole('alert')).toContainText('账号服务暂不可用');
  await accountPage.getByRole('button', { name: '重试', exact: true }).click();
  await expect(accountPage.getByRole('row')).toHaveCount(11);
  await accountPage.getByRole('button', { name: '下一页', exact: true }).click();
  await expect(accountPage.getByRole('cell', { name: 'member-11', exact: true })).toBeVisible();
  await accountPage.getByLabel('搜索账号', { exact: true }).fill('中文匹配');
  await expect(accountPage.getByRole('row')).toHaveCount(2);
  await expect(accountPage.getByRole('cell', { name: 'member-21', exact: true })).toBeVisible();
  await accountPage.getByLabel('搜索账号', { exact: true }).fill('no-matching-account');
  await expect(accountPage.getByText('没有匹配的账号。', { exact: true })).toBeVisible();
  await accountPage.close();
  assert.deepEqual(errors, []);
  await writeFile(
    path.join(artifacts, 'management-result.json'),
    JSON.stringify(
      {
        passed: [
          'no identity dependency',
          'native source editor disk save and reload',
          'theme',
          'mobile navigation',
          'private adapter denied',
          'synthetic list retry, pagination, Chinese match and no-match',
          'editor saves while account panel is selected',
        ],
        errors,
      },
      null,
      2
    )
  );
  console.log(
    'PASS optional management shell: independent editing, save, theme, mobile, server source protection'
  );
} finally {
  await browser?.close();
  child.kill('SIGTERM');
  await writeFile(path.join(artifacts, 'management-server.log'), log);
}
