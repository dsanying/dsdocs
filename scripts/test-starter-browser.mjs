import { chromium, expect } from '../apps/manage/node_modules/@playwright/test/index.mjs';
import { startManagement } from '../apps/manage/server/start.mjs';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
const directory = await mkdtemp(path.join(tmpdir(), 'dsdocs-starter-browser-'));
const artifacts = path.resolve(
  process.env.DSDOCS_ARTIFACTS ?? path.join(tmpdir(), 'dsdocs-starter-evidence')
);
await mkdir(artifacts, { recursive: true, mode: 0o700 });
const env = {
  ...process.env,
  DSDOCS_DATA_DIR: directory,
  DSDOCS_AUTH: 'none',
  DSDOCS_STARTER: 'guide',
  DSDOCS_PORT: '15682',
  DSDOCS_URL: 'http://127.0.0.1:15682',
};
const app = await startManagement(env);
const child = spawn(
  process.execPath,
  ['node_modules/next/dist/bin/next', 'start', '--port', '15600'],
  { cwd: path.resolve('apps/reader'), env, stdio: ['ignore', 'pipe', 'pipe'] }
);
let logs = '',
  browser;
child.stdout.on('data', (part) => (logs += part));
child.stderr.on('data', (part) => (logs += part));
const report = { checks: [], diagnostics: [] };
const record = (text) => {
  report.checks.push(text);
  console.log(`[starter] ${text}`);
};
const reader = 'http://127.0.0.1:15600/docs';
try {
  const deadline = Date.now() + 30000;
  while (true) {
    try {
      if ((await fetch(reader + '/zh')).ok) break;
    } catch {}
    if (Date.now() > deadline) throw new Error(logs);
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  browser = await chromium.launch({
    channel: process.env.DSDOCS_CHROME_CHANNEL ?? 'chrome',
    headless: true,
  });
  const context = await browser.newContext({
    locale: 'zh-CN',
    viewport: { width: 1440, height: 1000 },
  });
  context.setDefaultTimeout(15000);
  context.on('page', (page) => {
    page.on('pageerror', (error) => report.diagnostics.push(error.message));
    page.on('console', (message) => {
      if (['error', 'warning'].includes(message.type())) report.diagnostics.push(message.text());
    });
  });
  const page = await context.newPage();
  await page.goto(reader + '/zh');
  await expect(page.getByRole('heading', { name: '欢迎使用 DSdocs', exact: true })).toBeVisible();
  await page.getByRole('link', { name: '编写与发布', exact: true }).last().click();
  await expect(page.getByRole('heading', { name: '编写与发布', exact: true })).toBeVisible();
  record('新站默认教程首页与站内教程链接');
  await page.goto(reader + '/zh/markdown');
  await expect(page.getByRole('heading', { name: 'Markdown 格式示例', exact: true })).toBeVisible();
  await expect(page.locator('.document-prose del')).toHaveText('删除线');
  await expect(page.locator('.document-prose table')).toHaveCount(1);
  await expect(page.locator('.document-prose input[type="checkbox"]')).toHaveCount(3);
  await expect(page.locator('.document-prose input[type="checkbox"]').first()).toBeChecked();
  await expect(page.locator('pre').filter({ hasText: 'publishAfterSaving' })).toBeVisible();
  await expect(page.getByText('重要操作', { exact: false }).last()).toBeVisible();
  const image = page.getByRole('img', { name: 'DSdocs 的草稿、发布与阅读流程' });
  await image.scrollIntoViewIfNeeded();
  await expect(image).toHaveJSProperty('naturalWidth', 960);
  const downloading = page.waitForEvent('download');
  await page.getByRole('link', { name: '下载示例文本', exact: true }).click();
  const download = await downloading;
  if (download.suggestedFilename() !== 'dsdocs-example.txt') throw new Error('附件下载名称错误');
  record('完整格式、图片加载与真实附件下载');
  await page.getByRole('button', { name: /选择语言|Choose a language/ }).click();
  await page.getByRole('button', { name: 'English', exact: true }).click();
  await expect(page).toHaveURL(reader + '/en/markdown');
  await expect(page.getByRole('heading', { name: 'Markdown examples', exact: true })).toBeVisible();
  record('初始中英文文档关联切换');
  await page.goto(reader + '/zh/markdown');
  await image.scrollIntoViewIfNeeded();
  await expect(image).toHaveJSProperty('naturalWidth', 960);
  await page
    .getByRole('heading', { name: 'Markdown 格式示例', exact: true })
    .scrollIntoViewIfNeeded();
  await page.screenshot({ path: path.join(artifacts, 'starter-reader.png'), fullPage: true });
  const admin = await context.newPage();
  await admin.goto('http://127.0.0.1:15682/');
  await admin.getByRole('menuitem', { name: '格式与部署', exact: true }).click();
  await admin.getByRole('menuitem', { name: 'Markdown 格式示例 · zh', exact: true }).click();
  await expect(admin.locator('.mdxeditor')).toBeVisible();
  await expect(admin.getByText('正文格式错误', { exact: false })).toHaveCount(0);
  await admin.getByRole('radio', { name: 'Source mode' }).click();
  const source = admin.locator('.cm-content[contenteditable="true"]:visible');
  await source.click();
  await source.press('ControlOrMeta+End');
  await source.press('Enter');
  await source.press('Enter');
  await source.pressSequentially('初始教程编辑验证。');
  await admin.getByRole('radio', { name: 'Rich text', exact: true }).click();
  await expect(admin.getByText('初始教程编辑验证。', { exact: true })).toBeVisible();
  await expect(admin.getByRole('status').filter({ hasText: '已保存' })).toBeVisible();
  await admin.getByRole('button', { name: '发布', exact: true }).click();
  await expect(admin.getByText('发布成功', { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByText('初始教程编辑验证。', { exact: true })).toBeVisible();
  await expect(page.locator('.document-prose table')).toHaveCount(1);
  await image.scrollIntoViewIfNeeded();
  await expect(image).toHaveJSProperty('naturalWidth', 960);
  await expect(page.locator('.document-prose del')).toHaveText('删除线');
  await expect(page.locator('.document-prose input[type="checkbox"]').first()).toBeChecked();
  await expect(page.locator('.document-prose input[type="checkbox"]')).toHaveCount(3);
  await expect(page.locator('pre')).toHaveCount(6);
  record('完整示例可视化载入、源码编辑、自动保存与发布往返');
  await admin.screenshot({ path: path.join(artifacts, 'starter-editor.png') });
  if (report.diagnostics.length) throw new Error(JSON.stringify(report.diagnostics));
} catch (error) {
  console.error(error);
  throw error;
} finally {
  await writeFile(
    path.join(artifacts, 'starter-browser-report.json'),
    JSON.stringify(report, null, 2)
  );
  await browser?.close();
  await app.close();
  const exited = once(child, 'exit');
  child.kill('SIGTERM');
  await exited;
  await rm(directory, { recursive: true, force: true });
}
