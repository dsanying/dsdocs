import { chromium, firefox, expect } from '../apps/manage/node_modules/@playwright/test/index.mjs';
import { startManagement } from '../apps/manage/server/start.mjs';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
const root = await mkdtemp(path.join(tmpdir(), 'dsdocs-browser-'));
const artifacts = path.resolve(
  process.env.DSDOCS_ARTIFACTS ?? path.join(tmpdir(), 'dsdocs-browser-artifacts')
);
await mkdir(artifacts, { recursive: true, mode: 0o700 });
const env = {
  ...process.env,
  DSDOCS_STARTER: 'none',
  DSDOCS_DATA_DIR: path.join(root, 'content'),
  DSDOCS_AUTH_DATA_DIR: path.join(root, 'accounts'),
  DSDOCS_PORT: '15382',
  DSDOCS_URL: 'http://127.0.0.1:15382',
};
const admin = 'http://127.0.0.1:15382',
  reader = 'http://127.0.0.1:15300/docs';
const management = await startManagement(env);
const readerProcess = spawn(
  process.execPath,
  ['node_modules/next/dist/bin/next', 'start', '--port', '15300'],
  { cwd: path.resolve('apps/reader'), env, stdio: ['ignore', 'pipe', 'pipe'] }
);
let serverLog = '';
readerProcess.stdout.on('data', (x) => (serverLog += x));
readerProcess.stderr.on('data', (x) => (serverLog += x));
const report = { checks: [], diagnostics: [], searchMilliseconds: 0 };
async function ready(url) {
  const end = Date.now() + 30000;
  while (Date.now() < end) {
    try {
      if ((await fetch(url)).ok) return;
    } catch {}
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error('服务启动失败：' + serverLog);
}
let browser;
try {
  await ready(reader + '/zh');
  browser = await chromium.launch({
    channel: process.env.DSDOCS_CHROME_CHANNEL ?? 'chrome',
    headless: true,
  });
  const context = await browser.newContext({ locale: 'zh-CN' }),
    page = await context.newPage();
  const watch = (page) => {
    page.on('pageerror', (error) => report.diagnostics.push(error.message));
    page.on('console', (message) => {
      if (['warning', 'error'].includes(message.type())) report.diagnostics.push(message.text());
    });
  };
  watch(page);
  context.on('page', watch);
  await page.goto(admin);
  await page.getByLabel('用户名', { exact: true }).fill('admin');
  await page.getByLabel('密码', { exact: true }).fill('admin');
  await page.getByRole('button', { name: '登录', exact: true }).click();
  await expect(
    page.getByText('首次使用，请更改默认用户名和密码，完成后才能进入编辑后台。')
  ).toBeVisible();
  await page.getByLabel('新用户名', { exact: true }).fill('owner');
  await page.getByLabel('新密码', { exact: true }).fill('browser-pass-123');
  await page.getByLabel('确认新密码', { exact: true }).fill('browser-pass-123');
  await page.getByRole('button', { name: '保存' }).click();
  await page.getByLabel('用户名', { exact: true }).fill('owner');
  await page.getByLabel('密码', { exact: true }).fill('browser-pass-123');
  await page.getByRole('button', { name: '登录', exact: true }).click();
  await expect(page.getByRole('heading', { name: '文档', exact: true })).toBeVisible();
  report.checks.push('默认登录、首次强制更改、重新登录');
  const logoutEndpoint = '**/__dsdocs_accounts/logout';
  await page.route(logoutEndpoint, (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: 'incomplete response' })
  );
  await page.getByRole('button', { name: 'owner', exact: true }).hover();
  await page.getByRole('menuitem', { name: '退出登录', exact: true }).click();
  await expect(page.getByText('退出登录失败', { exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: '文档', exact: true })).toBeVisible();
  await page.locator('.ant-notification-notice-close').click();
  await page.unroute(logoutEndpoint);
  await page.getByRole('button', { name: 'owner', exact: true }).hover();
  await page.getByRole('menuitem', { name: '退出登录', exact: true }).click();
  await expect(page.getByLabel('用户名', { exact: true })).toBeVisible();
  await page.getByLabel('用户名', { exact: true }).fill('owner');
  await page.getByLabel('密码', { exact: true }).fill('browser-pass-123');
  await page.getByRole('button', { name: '登录', exact: true }).click();
  await expect(page.getByRole('heading', { name: '文档', exact: true })).toBeVisible();
  report.checks.push('退出响应异常保留登录并共享通知、成功退出后重新登录');
  await page.screenshot({ path: path.join(artifacts, 'management.png') });
  await page.getByRole('menuitem', { name: '目录', exact: true }).click();
  await expect(page.getByRole('heading', { name: '目录', exact: true })).toBeVisible();
  await page.getByRole('button', { name: '新增' }).click();
  await page.getByLabel('中文名称', { exact: true }).fill('指南');
  await page.getByLabel('英文名称', { exact: true }).fill('Guide');
  await page.getByRole('button', { name: '保存', exact: true }).click();
  await expect(page.getByRole('cell', { name: '指南', exact: true })).toBeVisible();
  await page.getByRole('button', { name: '编辑', exact: true }).click();
  await page.getByLabel('中文名称', { exact: true }).fill('使用指南');
  await page.getByRole('button', { name: '保存', exact: true }).click();
  await expect(page.getByRole('cell', { name: '使用指南', exact: true })).toBeVisible();
  report.checks.push('目录创建与重命名');
  await page.getByRole('button', { name: '新增', exact: true }).click();
  await page.getByLabel('中文名称', { exact: true }).fill('子目录');
  await page.getByLabel('英文名称', { exact: true }).fill('Child');
  await page.getByRole('combobox', { name: '父目录', exact: true }).click();
  await page.locator('.ant-select-item-option').filter({ hasText: '使用指南' }).click();
  await page.getByRole('button', { name: '保存', exact: true }).click();
  const childRow = page
    .getByRole('row')
    .filter({ has: page.getByRole('cell', { name: '子目录', exact: true }) });
  await expect(childRow.getByRole('cell', { name: '使用指南', exact: true })).toBeVisible();
  await childRow.getByRole('button', { name: '编辑', exact: true }).click();
  await page.getByRole('dialog').locator('.ant-select-clear').click();
  await page.getByRole('button', { name: '保存', exact: true }).click();
  await expect(childRow.getByRole('cell', { name: '—', exact: true })).toBeVisible();
  const folderState = await (await context.request.get(admin + '/__dsdocs_content')).json();
  expect(folderState.folders.find((folder) => folder.title === '子目录').parent).toBeNull();
  await childRow.getByRole('button', { name: '删除', exact: true }).click();
  await page.locator('.ant-popconfirm .ant-btn-primary').click();
  await expect(childRow).toHaveCount(0);
  report.checks.push('子目录创建、可视化清除父目录写入 null、删除空目录');

  await page.getByRole('menuitem', { name: '文档', exact: true }).click();
  await expect(page.getByRole('heading', { name: '文档', exact: true })).toBeVisible();
  await page.getByRole('button', { name: '新增' }).click();
  await page.getByRole('dialog').getByLabel('标题', { exact: true }).fill('接入指南');
  await page.getByRole('dialog').getByLabel('路径', { exact: true }).fill('getting-started');
  await page.getByRole('button', { name: '保存', exact: true }).click();
  await expect(page.getByRole('textbox', { name: '标题', exact: true })).toHaveValue('接入指南');
  await expect(page.getByRole('dialog')).toBeHidden();
  const publishButton = await page.getByRole('button', { name: '发布', exact: true }).boundingBox();
  if (!publishButton || publishButton.width > 160) throw new Error('编辑工具栏按钮布局异常');
  await page.getByRole('combobox', { name: '所属目录', exact: true }).click();
  await page.locator('.ant-select-item-option').filter({ hasText: '使用指南' }).click();
  await page.getByRole('textbox', { name: '标题', exact: true }).fill('暂存标题');
  await page.getByRole('menuitem', { name: '目录', exact: true }).click();
  await page.getByRole('menuitem', { name: '文档', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: '已保存' })).toBeVisible();
  await page.getByRole('textbox', { name: '标题', exact: true }).fill('接入指南');
  await expect(page.getByRole('status').filter({ hasText: '已保存' })).toBeVisible();
  report.checks.push('切换管理页不丢失待保存草稿、目录归属保存');
  const sourceToggle = page.getByRole('radio', { name: 'Source mode' });
  await sourceToggle.click();
  const source = page.locator('.cm-content[contenteditable="true"]:visible');
  await expect(source).toBeVisible();
  await source.fill(
    '## 连接准备\n\n检索验证词星河。\n\n:::tip\n这是提示框。\n:::\n\n```json\n{"ready": true}\n```\n\n| 名称 | 用途 |\n| --- | --- |\n| Key | 连接 |\n\n1. 申请账号\n2. 配置客户端\n'
  );
  await page.getByRole('radio', { name: 'Rich text' }).click();
  await expect(page.getByText('这是提示框。', { exact: true })).toBeVisible();
  await page.screenshot({ path: path.join(artifacts, 'editor-initial.png') });
  await expect(page.getByRole('status').filter({ hasText: '已保存' })).toBeVisible();
  const publicPage = await context.newPage();
  await publicPage.goto(reader + '/zh');
  await expect(publicPage.getByText('暂无已发布文档')).toBeVisible();
  report.checks.push('源码往返、提示框、代码、表格、列表与草稿隔离');
  await page.getByRole('button', { name: '发布', exact: true }).click();
  await expect(page.getByText('发布成功', { exact: true })).toBeVisible();
  await publicPage.goto(reader + '/zh/getting-started');
  await expect(publicPage.getByRole('heading', { name: '接入指南', exact: true })).toBeVisible();
  await expect(publicPage.getByText('这是提示框。', { exact: true })).toBeVisible();
  await expect(publicPage.getByRole('button', { name: '使用指南', exact: true })).toBeVisible();
  await expect(publicPage.locator('pre')).toContainText('ready');
  await publicPage.screenshot({ path: path.join(artifacts, 'reader.png') });
  report.checks.push('发布即时显示、正文提示框与代码渲染');
  await page.getByRole('radio', { name: 'Source mode' }).click();
  await page
    .locator('.cm-content[contenteditable="true"]:visible')
    .fill(
      '## 连接准备\n\n检索验证词星河。\n\n自动更新检查。\n\n:::tip\n这是提示框。\n:::\n\n```json\n{"ready":true}\n```'
    );
  await page.getByRole('radio', { name: 'Rich text' }).click();
  await expect(page.getByRole('status').filter({ hasText: '已保存' })).toBeVisible();
  await page.getByRole('button', { name: '发布', exact: true }).click();
  await publicPage.bringToFront();
  await expect(publicPage.getByText('自动更新检查。', { exact: true })).toBeVisible({
    timeout: 10000,
  });
  report.checks.push('已打开读者页自动更新，无需手动刷新或构建');
  await page.reload();
  await page.getByRole('menuitem', { name: '使用指南', exact: true }).click();
  await page.getByRole('menuitem', { name: '接入指南 · zh', exact: true }).click();
  await expect(page.getByText('这是提示框。', { exact: true })).toBeVisible();
  await page.screenshot({ path: path.join(artifacts, 'editor-initial.png') });
  report.checks.push('刷新后草稿与发布数据持久化');
  await page.getByRole('menuitem', { name: '附件', exact: true }).click();
  await page.locator('#asset-upload').setInputFiles({
    name: 'example.txt',
    mimeType: 'text/plain',
    buffer: Buffer.from('DSdocs attachment'),
  });
  await expect(page.getByRole('cell', { name: 'example.txt', exact: true })).toBeVisible();
  await page.getByRole('button', { name: '删除', exact: true }).click();
  await page.locator('.ant-popconfirm .ant-btn-primary').click();
  await expect(page.getByRole('cell', { name: 'example.txt', exact: true })).toHaveCount(0);
  report.checks.push('附件上传、列表保存、删除');
  await publicPage
    .getByRole('button', { name: /搜索|Search/ })
    .first()
    .click();
  const searchStarted = performance.now();
  await publicPage.getByRole('combobox').fill('星河');
  await expect(
    publicPage
      .getByRole('dialog')
      .getByText(/检索验证词星河/)
      .first()
  ).toBeVisible();
  report.searchMilliseconds = Math.round(performance.now() - searchStarted);
  report.checks.push('中文全文搜索命中');
  await publicPage.getByRole('combobox').fill('不存在的专有词y7k9');
  await expect(
    publicPage.getByRole('dialog').getByText('没有找到文档', { exact: true })
  ).toBeVisible();
  await publicPage.getByRole('combobox').fill('接入指南');
  await expect(
    publicPage.getByRole('dialog').getByText('接入指南', { exact: true }).first()
  ).toBeVisible();
  report.checks.push('搜索标题命中与不存在关键词零结果');
  await publicPage.keyboard.press('Escape');
  await publicPage.setViewportSize({ width: 375, height: 812 });
  await publicPage.screenshot({ path: path.join(artifacts, 'reader-mobile.png') });
  await page.getByRole('menuitem', { name: '账号管理', exact: true }).click();
  await expect(page.getByRole('heading', { name: '账号管理', exact: true })).toBeVisible();
  await page.getByRole('button', { name: '创建账号', exact: true }).click();
  await page.getByLabel('用户名', { exact: true }).fill('writer');
  await page.getByLabel('密码', { exact: true }).fill('writer-pass-123');
  await page.getByRole('button', { name: '保存', exact: true }).click();
  await expect(page.getByRole('cell', { name: 'writer', exact: true })).toBeVisible();
  report.checks.push('后台创建管理员');
  const writerContext = await browser.newContext({ locale: 'zh-CN' });
  const writerPage = await writerContext.newPage();
  watch(writerPage);
  await writerPage.goto(admin + '/login');
  await writerPage.getByLabel('用户名', { exact: true }).fill('writer');
  await writerPage.getByLabel('密码', { exact: true }).fill('writer-pass-123');
  await writerPage.getByRole('button', { name: '登录', exact: true }).click();
  await writerPage.getByRole('menuitem', { name: '我的账号', exact: true }).click();
  await expect(writerPage.getByRole('cell', { name: 'writer', exact: true })).toBeVisible();
  await expect(writerPage.getByRole('cell', { name: 'owner', exact: true })).toHaveCount(0);
  await expect(writerPage.getByRole('button', { name: '创建账号', exact: true })).toHaveCount(0);
  await writerPage.getByRole('button', { name: '编辑', exact: true }).click();
  await writerPage.getByLabel('用户名', { exact: true }).fill('writer_new');
  await writerPage.getByLabel('当前密码', { exact: true }).fill('writer-pass-123');
  await writerPage.getByLabel('新密码', { exact: true }).fill('writer-pass-456');
  await writerPage.getByRole('button', { name: '保存', exact: true }).click();
  await expect(writerPage).toHaveURL(admin + '/login');
  await writerPage.getByLabel('用户名', { exact: true }).fill('writer_new');
  await writerPage.getByLabel('密码', { exact: true }).fill('writer-pass-456');
  await writerPage.getByRole('button', { name: '登录', exact: true }).click();
  await expect(writerPage.getByRole('heading', { name: '文档', exact: true })).toBeVisible();
  await writerContext.close();
  report.checks.push('普通管理员只见自己、无创建入口，自行改账密后会话失效并可重新登录');

  await page.getByRole('menuitem', { name: '文档', exact: true }).click();
  await page.getByRole('menuitem', { name: '切换亮暗主题', exact: true }).click();
  await expect(page.locator('.mdxeditor.dark-theme')).toBeVisible();
  await page.screenshot({ path: path.join(artifacts, 'editor-dark.png') });
  await page.getByRole('button', { name: '历史版本', exact: true }).click();
  await page.getByRole('combobox', { name: /发布版本/ }).click();
  await page.locator('.ant-select-item-option').first().click();
  await page.getByRole('button', { name: '保存', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: '已保存' })).toBeVisible();
  report.checks.push('历史版本恢复到草稿、编辑器暗色主题');
  await page.getByRole('button', { name: '新增', exact: true }).click();
  await page.getByRole('dialog').getByLabel('标题', { exact: true }).fill('Getting started');
  await page.getByRole('dialog').getByLabel('路径', { exact: true }).fill('getting-started');
  await page.locator('#locale').click();
  await page.getByText('English', { exact: true }).click();
  await page.locator('#translationId').click();
  await page.locator('.ant-select-item-option').filter({ hasText: '接入指南 · zh' }).click();
  await page.getByRole('button', { name: '保存', exact: true }).click();
  await expect(page.getByRole('textbox', { name: '标题', exact: true })).toHaveValue(
    'Getting started'
  );
  await page.getByRole('radio', { name: 'Source mode' }).click();
  await page
    .locator('.cm-content[contenteditable="true"]:visible')
    .fill('## Connection\n\nEnglish translation.');
  await page.getByRole('radio', { name: 'Rich text' }).click();
  await expect(page.getByRole('status').filter({ hasText: '已保存' })).toBeVisible();
  await page.getByRole('button', { name: '发布', exact: true }).click();
  await expect(page.getByText('发布成功', { exact: true })).toBeVisible();
  await publicPage.setViewportSize({ width: 1280, height: 900 });
  await publicPage.goto(reader + '/zh/getting-started');
  await publicPage.getByRole('button', { name: /选择语言|Choose a language/ }).click();
  await publicPage.getByRole('button', { name: 'English', exact: true }).click();
  await expect(publicPage).toHaveURL(reader + '/en/getting-started');
  await expect(
    publicPage.getByRole('heading', { name: 'Getting started', exact: true })
  ).toBeVisible();
  await publicPage.goto(reader);
  await expect(publicPage).toHaveURL(new RegExp('/docs/en/?$'));
  report.checks.push('关联翻译与手动语言偏好持久化');
  await publicPage
    .getByRole('button', { name: /搜索|Search/ })
    .first()
    .click();
  await publicPage.getByRole('combobox').fill('星河');
  await expect(
    publicPage.getByRole('dialog').getByText('No results found', { exact: true })
  ).toBeVisible();
  await publicPage.getByRole('combobox').fill('English');
  await expect(
    publicPage
      .getByRole('dialog')
      .getByText(/English translation/)
      .first()
  ).toBeVisible();
  await publicPage.keyboard.press('Escape');
  report.checks.push('英文全文搜索与中英搜索隔离');
  await management.close();
  await publicPage.goto(reader + '/zh/getting-started');
  await expect(publicPage.getByRole('heading', { name: '接入指南', exact: true })).toBeVisible();
  report.checks.push('管理停止后读者仍可用');
  if (report.diagnostics.length) throw new Error(JSON.stringify(report.diagnostics));
  await browser.close();
  browser = null;
  if (process.env.DSDOCS_FIREFOX !== '0') {
    const ff = await firefox.launch({ headless: true });
    try {
      const p = await ff.newPage({ viewport: { width: 768, height: 900 } });
      await p.goto(reader + '/zh/getting-started');
      await expect(p.getByRole('heading', { name: '接入指南', exact: true })).toBeVisible();
      await expect(p.locator('pre')).toContainText('ready');
      await p.screenshot({ path: path.join(artifacts, 'reader-firefox.png') });
      report.checks.push('Firefox 读者布局与代码');
    } finally {
      await ff.close();
    }
  }
  console.log(JSON.stringify({ checks: report.checks, diagnostics: report.diagnostics }));
} finally {
  await writeFile(path.join(artifacts, 'browser-report.json'), JSON.stringify(report, null, 2));
  if (browser) await browser.close();
  await management.close().catch(() => {});
  readerProcess.kill('SIGTERM');
  await once(readerProcess, 'exit').catch(() => {});
  await rm(root, { recursive: true, force: true });
}
