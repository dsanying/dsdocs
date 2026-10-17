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
const report = { checks: [], diagnostics: [], upstreamAdvisories: [] };
// CodeMirror 维护者确认虚拟化需要此行为，保留原文与依据，不视作应用错误。
// 仅限 Firefox 源码往返阶段的精确消息，其他阶段/消息仍进 diagnostics。
const codeMirrorScrollAdvisory = `[JavaScript Warning: "This site appears to use a scroll-linked positioning effect. This may not work well with asynchronous panning; see https://firefox-source-docs.mozilla.org/performance/scroll-linked_effects.html for further details and to join the discussion on related tools and features!" {file: "${origin}/" line: 0}]`;
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
    let phase = '登录';
    const page = await context.newPage();
    page.on('pageerror', (error) => report.diagnostics.push(String(error)));
    page.on('console', (message) => {
      if (!['error', 'warning'].includes(message.type())) return;
      if (
        name === 'firefox' &&
        phase === 'light 390px 源码往返' &&
        message.type() === 'warning' &&
        message.text() === codeMirrorScrollAdvisory
      ) {
        report.upstreamAdvisories.push({
          browser: name,
          phase,
          message: message.text(),
          source: 'https://github.com/codemirror/dev/issues/1678#issuecomment-4002869521',
        });
      } else report.diagnostics.push(`${name} ${phase}: ${message.text()}`);
    });
    await page.goto(origin + '/login');
    await page.getByLabel('用户名', { exact: true }).fill(initialized ? 'layout_owner' : 'admin');
    await page.getByLabel('密码', { exact: true }).fill(initialized ? 'layout-pass-123' : 'admin');
    await page.getByRole('button', { name: '登录', exact: true }).click();
    if (!initialized) {
      await page.getByLabel('新用户名', { exact: true }).fill('layout_owner');
      await page.getByLabel('新密码', { exact: true }).fill('layout-pass-123');
      await page.getByLabel('确认新密码', { exact: true }).fill('layout-pass-123');
      await page.getByRole('button', { name: '保存', exact: true }).click();
      await page.getByLabel('用户名', { exact: true }).fill('layout_owner');
      await page.getByLabel('密码', { exact: true }).fill('layout-pass-123');
      await page.getByRole('button', { name: '登录', exact: true }).click();
      initialized = true;
    }
    await page.getByRole('menuitem', { name: '使用指南', exact: true }).click();
    await page.getByRole('menuitem', { name: '欢迎使用 DSdocs · zh', exact: true }).click();
    const body = page.getByRole('region', { name: '文档正文', exact: true }),
      tree = page.getByRole('region', { name: '文档目录列表', exact: true }),
      nav = page.getByRole('region', { name: '菜单', exact: true });
    await expect(page.locator('html')).toHaveCSS('overflow-anchor', 'none');
    await expect(page.locator('body')).toHaveCSS('overflow-anchor', 'none');
    for (const region of [body, tree, nav])
      await expect(region).toHaveCSS('overflow-anchor', 'none');
    for (const theme of ['light', 'dark']) {
      phase = `${theme} 桌面滚动`;
      if (theme === 'dark')
        await page.getByRole('menuitem', { name: '切换亮暗主题', exact: true }).click();
      await expect(page.locator('.mdxeditor')).toBeVisible();
      const footer = page.locator('.ds-sidebar-frame__footer');
      const before = await box(footer);
      expect(Math.abs(before.y + before.height - 900)).toBeLessThanOrEqual(2);
      const heading = await box(page.getByRole('heading', { name: '文档', exact: true }));
      await wheel(page, body, 800);
      await expect.poll(() => scrollTop(body)).toBeGreaterThan(0);
      await rootStill(page);
      expect((await box(page.getByRole('heading', { name: '文档', exact: true }))).y).toBe(
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
      // 编辑器在图片及源码切换后可能再排版一行；以真实滚轮追到最终边界。
      for (let attempt = 0; attempt < 8; attempt++) {
        await wheel(page, body, 1000);
        let previous = -1,
          stable = 0;
        await expect
          .poll(
            async () => {
              const next = await scrollTop(body);
              stable = next === previous ? stable + 1 : 0;
              previous = next;
              return stable;
            },
            { intervals: [50, 100, 100] }
          )
          .toBeGreaterThanOrEqual(2);
        if ((await body.evaluate((el) => el.scrollHeight - el.clientHeight - el.scrollTop)) <= 2)
          break;
      }
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
      await expect(page.locator('.ds-basic-layout__sider')).toHaveCount(0);
      await expect(page.getByRole('button', { name: '菜单', exact: true })).toBeVisible();
      await expect(page.getByLabel('标题', { exact: true })).toBeHidden();
      await page.getByRole('button', { name: '更多操作', exact: true }).click();
      for (const action of ['历史版本', '插入附件', '下线', '删除'])
        await expect(
          page.getByRole('button', { name: new RegExp('^' + action.split('').join('\\s*') + '$') })
        ).toBeVisible();
      await page.getByRole('button', { name: '历史版本', exact: true }).click();
      const revision = page.getByRole('dialog', { name: '恢复历史到草稿', exact: true });
      await expect(revision).toBeVisible();
      await revision.getByRole('button', { name: '关闭', exact: true }).click();
      await expect(page.locator('.ant-drawer-mask:visible')).toHaveCount(0);
      await page.getByRole('button', { name: '文档列表', exact: true }).click();
      await expect(page.getByRole('dialog', { name: '文档列表', exact: true })).toBeVisible();
      await page
        .getByRole('dialog', { name: '文档列表', exact: true })
        .getByRole('button', { name: '关闭', exact: true })
        .click();
      await page.getByRole('button', { name: '文档信息', exact: true }).click();
      await expect(page.getByLabel('标题', { exact: true })).toBeVisible();
      await wheel(page, page.locator('.editor-pane'), 800);
      await expect.poll(() => scrollTop(page.locator('.editor-pane'))).toBeGreaterThan(0);
      await page.getByRole('button', { name: '文档信息', exact: true }).click();
      await rootStill(page);
      await page.screenshot({ path: path.join(artifacts, `${name}-${theme}-mobile.png`) });
      for (const viewport of [
        { width: 390, height: 844 },
        { width: 768, height: 1024 },
        { width: 990, height: 800 },
        { width: 844, height: 390 },
      ]) {
        phase = `${theme} ${viewport.width}x${viewport.height}`;
        await page.setViewportSize(viewport);
        const shellMobile = viewport.width < 768;
        await expect(page.getByRole('button', { name: '菜单', exact: true }))[
          shellMobile ? 'toBeVisible' : 'toBeHidden'
        ]();
        await rootStill(page);
        // 等待 ResizeObserver 根据本轮实际容器宽度完成响应式切换，再选择对应入口。
        await expect
          .poll(async () => {
            const workspace = await box(page.locator('.documents'));
            const compact = (await page.locator('.documents--compact').count()) > 0;
            return compact === workspace.width < 640;
          })
          .toBe(true);
        const compactEditor = (await page.locator('.documents--compact').count()) > 0;
        if (compactEditor) {
          await page.getByRole('button', { name: '文档列表', exact: true }).click();
          const list = page.getByRole('dialog', { name: '文档列表', exact: true });
          await expect(list).toBeVisible();
          await list.getByRole('menuitem', { name: '使用指南', exact: true }).click();
          await list.getByRole('menuitem', { name: '欢迎使用 DSdocs · zh', exact: true }).click();
          await expect(list).toBeHidden();
        } else {
          await expect(
            page.getByRole('region', { name: '文档目录列表', exact: true })
          ).toBeVisible();
        }
        await expect(page.locator('.mdxeditor')).toBeVisible();
        // 工具栏组件不得挤成零宽；横滚到末端仍可触达源码入口。
        const toolbar = page.locator('.document-toolbar');
        expect(
          await toolbar.locator('button').evaluateAll((buttons) =>
            buttons
              .filter((button) => button.getBoundingClientRect().width < 20)
              .map((button) => ({
                label: button.getAttribute('aria-label') ?? button.textContent,
                width: button.getBoundingClientRect().width,
              }))
          )
        ).toEqual([]);
        if (viewport.width === 390 && theme === 'light') {
          await page.getByRole('button', { name: '文档信息', exact: true }).click();
          const title = page.getByLabel('标题', { exact: true });
          const originalTitle = await title.inputValue();
          await title.fill(originalTitle + ' · 窄屏测试');
          await expect(page.getByRole('status')).toHaveText('已保存');
          await title.fill(originalTitle);
          await expect(page.getByRole('status')).toHaveText('已保存');
          await page.getByRole('button', { name: '文档信息', exact: true }).click();
          phase = `${theme} 390px 源码往返`;
          await page.getByRole('radio', { name: 'Source mode', exact: true }).click();
          const source = page.locator('.cm-content[contenteditable="true"]:visible');
          await source.click();
          await source.press('ControlOrMeta+End');
          await page.keyboard.insertText('\n\n窄屏源码保存测试');
          await page.getByRole('radio', { name: 'Rich text', exact: true }).click();
          await expect(page.getByRole('status')).toHaveText('已保存');
          await page.getByRole('radio', { name: 'Source mode', exact: true }).click();
          await source.click();
          await source.press('ControlOrMeta+End');
          await expect(source).toContainText('窄屏源码保存测试');
          await source.press('Shift+Home');
          await source.press('Backspace');
          await source.press('Backspace');
          await source.press('Backspace');
          await page.getByRole('radio', { name: 'Rich text', exact: true }).click();
          await expect(page.getByRole('status')).toHaveText('已保存');
        }
        if (shellMobile) {
          await page.getByRole('button', { name: '菜单', exact: true }).click();
          const navigation = page.getByRole('dialog', { name: 'DSdocs', exact: true });
          await expect(navigation).toBeVisible();
          const account = await box(navigation.locator('.ant-drawer-footer'));
          expect(Math.abs(account.y + account.height - viewport.height)).toBeLessThanOrEqual(2);
          await navigation.getByRole('menuitem', { name: '网站设置', exact: true }).click();
          await expect(navigation).toBeHidden();
          await expect(page.locator('.ds-basic-layout__content')).toBeVisible();
          await page.getByRole('button', { name: '菜单', exact: true }).click();
          await navigation.getByRole('menuitem', { name: '文档', exact: true }).click();
        } else {
          await page.getByRole('menuitem', { name: '网站设置', exact: true }).click();
          await expect(page.getByLabel('网站名称', { exact: true })).toBeVisible();
          await page.getByRole('menuitem', { name: '文档', exact: true }).click();
        }
        await expect(page.locator('.ant-drawer-mask:visible')).toHaveCount(0);
        await expect(page.locator('.mdxeditor')).toBeVisible();
        await rootStill(page);
        await page.screenshot({
          path: path.join(artifacts, `${name}-${theme}-${viewport.width}x${viewport.height}.png`),
        });
      }
      for (const width of [992, 1024]) {
        await page.setViewportSize({ width, height: 800 });
        await expect(page.getByRole('button', { name: '菜单', exact: true })).toBeHidden();
        await expect(page.getByRole('region', { name: '文档目录列表', exact: true })).toBeVisible();
        const pane = await box(page.locator('.editor-pane'));
        const workspace = await box(page.locator('.documents'));
        const documentTree = await box(page.locator('.document-tree'));
        expect(Math.abs(pane.width + documentTree.width - workspace.width)).toBeLessThanOrEqual(2);
        expect(pane.width).toBeGreaterThanOrEqual(640 - documentTree.width);
        await rootStill(page);
      }
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
        `${name} ${theme}：桌面分区滚动；320/390/768/990px及横屏按主导航与文档容器分别适配，验证文档选择、信息展开、工具栏宽度与账号区；390px元数据和源码保存往返`
      );
    }
    await page.getByRole('menuitem', { name: '网站设置', exact: true }).click();
    const settings = page.locator('.ds-basic-layout__content');
    await wheel(page, settings, 1500);
    await rootStill(page);
    await page.getByRole('menuitem', { name: '文档', exact: true }).click();
    await expect(page.locator('.mdxeditor')).toBeVisible();
    await context.close();
    phase = '触摸模式';
    const touchContext = await browser.newContext({
      viewport: { width: 390, height: 844 },
      hasTouch: true,
      locale: 'zh-CN',
      ...(name === 'chrome' ? { isMobile: true } : {}),
    });
    const touchPage = await touchContext.newPage();
    touchPage.on('pageerror', (error) => report.diagnostics.push(String(error)));
    touchPage.on('console', (message) => {
      if (['error', 'warning'].includes(message.type()))
        report.diagnostics.push(`${name} ${phase}: ${message.text()}`);
    });
    await touchPage.goto(origin + '/login');
    await touchPage.getByLabel('用户名', { exact: true }).fill('layout_owner');
    await touchPage.getByLabel('密码', { exact: true }).fill('layout-pass-123');
    await touchPage.getByRole('button', { name: '登录', exact: true }).tap();
    await touchPage.getByRole('button', { name: '文档列表', exact: true }).tap();
    const touchList = touchPage.getByRole('dialog', { name: '文档列表', exact: true });
    await touchList.getByRole('menuitem', { name: '使用指南', exact: true }).tap();
    await touchList.getByRole('menuitem', { name: '欢迎使用 DSdocs · zh', exact: true }).tap();
    await expect(touchPage.locator('.ant-drawer-mask:visible')).toHaveCount(0);
    await expect(touchPage.locator('.mdxeditor')).toBeVisible();
    await touchPage.getByRole('button', { name: '文档信息', exact: true }).tap();
    await expect(touchPage.getByLabel('标题', { exact: true })).toBeVisible();
    await touchPage.getByRole('button', { name: '文档信息', exact: true }).tap();
    await rootStill(touchPage);
    await touchPage.screenshot({ path: path.join(artifacts, `${name}-touch.png`) });
    report.checks.push(`${name}：390px触摸模式登录、文档选择和信息切换`);
    await touchContext.close();
    await browser.close();
    browser = null;
  }
  if (report.upstreamAdvisories.length > 1) throw new Error('上游提示出现次数异常');
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
