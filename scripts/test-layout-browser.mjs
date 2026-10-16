import { chromium, firefox, expect } from '../apps/manage/node_modules/@playwright/test/index.mjs';
import { startManagement } from '../apps/manage/server/start.mjs';
import { openContent } from '../packages/content/store.mjs';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';
const directory = await mkdtemp(path.join(tmpdir(), 'dsdocs-layout-'));
const artifacts = path.resolve(
  process.env.DSDOCS_ARTIFACTS ?? path.join(tmpdir(), 'dsdocs-layout-evidence')
);
await mkdir(artifacts, { recursive: true });
const origin = 'http://127.0.0.1:15882';
const app = await startManagement({
  ...process.env,
  DSDOCS_PORT: '15882',
  DSDOCS_URL: origin,
  DSDOCS_DATA_DIR: directory,
  DSDOCS_AUTH_DATA_DIR: path.join(directory, 'accounts'),
});
const store = openContent(directory);
for (let i = 0; i < 35; i++)
  store.create({
    title: `布局测试文档 ${String(i).padStart(2, '0')}`,
    slug: `layout-${i}`,
    locale: 'zh',
  });
store.close();
const report = { checks: [], diagnostics: [] };
let initialized = false,
  browser;
const box = async (locator) => {
  const value = await locator.boundingBox();
  if (!value) throw new Error('区域不可见');
  return value;
};
const scrollTop = (locator) => locator.evaluate((el) => el.scrollTop);
async function wheel(page, locator, dy) {
  const b = await box(locator);
  await page.mouse.move(b.x + b.width / 2, b.y + Math.min(b.height / 2, 100));
  await page.mouse.wheel(0, dy);
}
async function rootStill(page) {
  expect(
    await page.evaluate(() => ({
      top: window.scrollY,
      overflow: document.documentElement.scrollHeight - document.documentElement.clientHeight,
      x: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    }))
  ).toEqual({ top: 0, overflow: 0, x: 0 });
}
try {
  for (const [name, engine] of [
    ['chrome', chromium],
    ['firefox', firefox],
  ]) {
    browser = await engine.launch(
      name === 'chrome' ? { channel: process.env.DSDOCS_CHROME_CHANNEL ?? 'chrome' } : {}
    );
    const context = await browser.newContext({
      viewport: { width: 1440, height: 900 },
      locale: 'zh-CN',
    });
    const page = await context.newPage();
    page.on('pageerror', (error) => report.diagnostics.push(String(error)));
    page.on('console', (message) => {
      if (['error', 'warning'].includes(message.type())) report.diagnostics.push(message.text());
    });
    await page.goto(origin + '/login');
    await page.getByLabel('用户名', { exact: true }).fill(initialized ? 'layout_owner' : 'admin');
    await page.getByLabel('密码', { exact: true }).fill(initialized ? 'layout-pass-123' : 'admin');
    await page.getByRole('button', { name: '登录', exact: true }).click();
    if (!initialized) {
      await page.getByLabel('新用户名', { exact: true }).fill('layout_owner');
      await page.getByLabel('新密码', { exact: true }).fill('layout-pass-123');
      await page.getByLabel('确认新密码', { exact: true }).fill('layout-pass-123');
      await page.getByRole('button', { name: '保存并重新登录', exact: true }).click();
      await page.getByLabel('用户名', { exact: true }).fill('layout_owner');
      await page.getByLabel('密码', { exact: true }).fill('layout-pass-123');
      await page.getByRole('button', { name: '登录', exact: true }).click();
      initialized = true;
    }
    await page.getByRole('menuitem', { name: '使用指南', exact: true }).click();
    await page.getByRole('menuitem', { name: '欢迎使用 DSdocs · zh', exact: true }).click();
    const body = page.getByRole('region', { name: '文档正文', exact: true }),
      tree = page.getByRole('region', { name: '文档目录列表', exact: true }),
      nav = page.getByRole('region', { name: '主导航', exact: true });
    for (const theme of ['light', 'dark']) {
      if (theme === 'dark')
        await page.getByRole('button', { name: '切换主题', exact: true }).click();
      await expect(page.locator('.mdxeditor')).toBeVisible();
      const footer = page.locator('.ds-sidebar-frame__footer');
      const before = await box(footer);
      expect(Math.abs(before.y + before.height - 900)).toBeLessThanOrEqual(2);
      const heading = await box(page.getByRole('heading', { name: '文档编辑', exact: true }));
      await wheel(page, body, 800);
      await expect.poll(() => scrollTop(body)).toBeGreaterThan(0);
      await rootStill(page);
      expect((await box(page.getByRole('heading', { name: '文档编辑', exact: true }))).y).toBe(
        heading.y
      );
      expect((await box(footer)).y).toBe(before.y);
      await wheel(page, body, 10000);
      await expect
        .poll(() =>
          page
            .locator('.mdxeditor img')
            .evaluateAll((images) => images.every((image) => image.complete))
        )
        .toBe(true);
      await wheel(page, body, 1000);
      await expect
        .poll(
          async () => await body.evaluate((el) => el.scrollHeight - el.clientHeight - el.scrollTop)
        )
        .toBeLessThanOrEqual(2);
      await wheel(page, body, 1000);
      await rootStill(page);
      await wheel(page, tree, 600);
      await expect.poll(() => scrollTop(tree)).toBeGreaterThan(0);
      expect(await scrollTop(nav)).toBe(0);
      await rootStill(page);
      await page.screenshot({ path: path.join(artifacts, `${name}-${theme}-desktop.png`) });
      await page.setViewportSize({ width: 1440, height: 400 });
      await expect
        .poll(async () => {
          const b = await box(footer);
          return Math.abs(b.y + b.height - 400);
        })
        .toBeLessThanOrEqual(2);
      await wheel(page, nav, 600);
      await expect.poll(() => scrollTop(nav)).toBeGreaterThan(0);
      await rootStill(page);
      await page.setViewportSize({ width: 320, height: 900 });
      await expect
        .poll(() =>
          page.locator('.ant-layout-sider').evaluate((el) => el.getBoundingClientRect().width)
        )
        .toBe(0);
      await wheel(page, page.locator('.editor-pane'), 800);
      await expect.poll(() => scrollTop(page.locator('.editor-pane'))).toBeGreaterThan(0);
      await rootStill(page);
      await page.screenshot({ path: path.join(artifacts, `${name}-${theme}-mobile.png`) });
      await page.setViewportSize({ width: 1440, height: 900 });
      await expect
        .poll(() =>
          page.locator('.ant-layout-sider').evaluate((el) => el.getBoundingClientRect().width)
        )
        .toBeGreaterThan(0);
      await wheel(page, nav, -2000);
      await wheel(page, tree, -4000);
      await wheel(page, body, -10000);
      report.checks.push(
        `${name} ${theme}：侧栏底部、长菜单、目录及编辑区独立滚动、边界不传递、短视口与320px窄屏`
      );
    }
    await page.getByRole('menuitem', { name: '网站设置', exact: true }).click();
    const settings = page.locator('.management-page--scroll:visible');
    await wheel(page, settings, 1500);
    await rootStill(page);
    await page.getByRole('menuitem', { name: '文档', exact: true }).click();
    await expect(page.locator('.mdxeditor')).toBeVisible();
    await context.close();
    await browser.close();
    browser = null;
  }
  if (report.diagnostics.length) throw new Error(JSON.stringify(report.diagnostics));
  console.log(JSON.stringify(report));
} catch (error) {
  console.error(error);
  throw error;
} finally {
  await writeFile(path.join(artifacts, 'layout-report.json'), JSON.stringify(report, null, 2));
  await browser?.close();
  await app.close();
  await rm(directory, { recursive: true, force: true });
}
