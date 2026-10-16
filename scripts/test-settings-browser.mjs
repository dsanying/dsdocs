import { chromium, expect } from '../apps/manage/node_modules/@playwright/test/index.mjs';
import { readFileSync, writeFileSync } from 'node:fs';
import { openContent } from '../packages/content/store.mjs';
import { startManagement } from '../apps/manage/server/start.mjs';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
const directory = await mkdtemp(path.join(tmpdir(), 'dsdocs-settings-browser-'));
const artifacts = path.resolve(
  process.env.DSDOCS_ARTIFACTS ?? path.join(tmpdir(), 'dsdocs-settings-evidence')
);
await mkdir(artifacts, { recursive: true, mode: 0o700 });
const env = {
  ...process.env,
  DSDOCS_DATA_DIR: directory,
  DSDOCS_AUTH: 'none',
  DSDOCS_STARTER: 'guide',
  DSDOCS_PORT: '15782',
  DSDOCS_URL: 'http://127.0.0.1:15782',
};
const app = await startManagement(env);
const child = spawn(
  process.execPath,
  ['node_modules/next/dist/bin/next', 'start', '--port', '15700'],
  { cwd: path.resolve('apps/reader'), env, stdio: ['ignore', 'pipe', 'pipe'] }
);
let logs = '',
  browser;
child.stdout.on('data', (part) => (logs += part));
child.stderr.on('data', (part) => (logs += part));
const report = { checks: [], diagnostics: [] };
const record = (text) => {
  report.checks.push(text);
  console.log(`[settings] ${text}`);
};
const reader = 'http://127.0.0.1:15700/docs';
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
      if (
        message.type() === 'error' &&
        message.text().includes('409') &&
        message.location().url.endsWith('/__dsdocs_content/settings')
      )
        return;
      if (['error', 'warning'].includes(message.type())) report.diagnostics.push(message.text());
    });
  });
  const page = await context.newPage();
  await page.goto(reader + '/zh/markdown');
  const admin = await context.newPage();
  await admin.goto('http://127.0.0.1:15782/?page=settings');
  const save = admin.getByRole('button', { name: '保存', exact: true });
  const name = admin.getByLabel('网站名称', { exact: true });
  await expect(name).toHaveValue('DSdocs');
  await expect(save).toHaveCount(0);
  await name.fill('未保存的名字');
  await expect(save).toBeVisible();
  await admin.getByRole('button', { name: '取消', exact: true }).click();
  await expect(name).toHaveValue('DSdocs');
  await name.fill('可视化文档');
  await admin.getByRole('tab', { name: '阅读外观' }).click();
  await admin.getByLabel('基准字号', { exact: true }).fill('18');
  await admin.getByLabel('正文行高', { exact: true }).fill('1.9');
  await save.click();
  await expect(admin.getByText('保存成功', { exact: true })).toBeVisible();
  await expect
    .poll(() => page.locator('html').evaluate((el) => getComputedStyle(el).fontSize), {
      timeout: 15000,
    })
    .toBe('18px');
  await expect(page.getByRole('link', { name: '可视化文档', exact: true })).toBeVisible();
  await expect(page).toHaveTitle('可视化文档');
  const settingsFile = path.join(directory, 'workspace/site.json');
  let settings = JSON.parse(await readFile(settingsFile, 'utf8'));
  if (settings.siteName !== '可视化文档') throw new Error('面板保存未写回设置文件');
  record('真实表单取消、保存、文件写回、读者自动刷新字号及名称');
  await admin.screenshot({ path: path.join(artifacts, 'settings-appearance.png') });
  settings = {
    ...settings,
    siteName: '文件编辑文档',
    baseFontSize: 16,
    showToc: false,
    showBreadcrumb: false,
    showPreviousNext: false,
    searchEnabled: false,
    footerText: '文件配置页脚',
    defaultLanguage: 'en',
  };
  await writeFile(settingsFile, JSON.stringify(settings, null, 2));
  await expect(page.getByRole('link', { name: '文件编辑文档', exact: true })).toBeVisible({
    timeout: 15000,
  });
  await expect(page.getByText('文件配置页脚', { exact: true })).toBeVisible();
  await expect
    .poll(() => page.locator('html').evaluate((el) => getComputedStyle(el).fontSize))
    .toBe('16px');
  await expect(page.getByRole('button', { name: '搜索文档' })).toHaveCount(0);
  await admin.getByRole('button', { name: '重新加载', exact: true }).click();
  await admin.getByRole('tab', { name: '基本信息' }).click();
  await expect(name).toHaveValue('文件编辑文档');
  const fresh = await browser.newContext({ locale: 'zh-CN' });
  const entry = await fresh.newPage();
  await entry.goto(reader);
  await expect(entry).toHaveURL(/\/docs\/en$/);
  await fresh.close();
  record('直接改 JSON 导入后台、读者页脚/目录/搜索开关和初始语言');
  const docs = await (await context.request.get('http://127.0.0.1:15782/__dsdocs_content')).json();
  const document = docs.documents.find(
    (item) => item.locale === 'zh' && item.slug === 'getting-started'
  );
  const mdFile = path.join(directory, 'workspace/documents', document.id + '.md');
  const text = await readFile(mdFile, 'utf8');
  await writeFile(mdFile, text + '\n\n文件编辑浏览器验证。\n');
  await admin.getByRole('menuitem', { name: '文档', exact: true }).click();
  await admin.getByRole('menuitem', { name: '使用指南', exact: true }).click();
  await admin.getByRole('menuitem', { name: '欢迎使用 DSdocs · zh', exact: true }).click();
  await expect(admin.getByText('文件编辑浏览器验证。', { exact: true })).toBeVisible();
  await page.goto(reader + '/zh/getting-started');
  await expect(page.getByText('文件编辑浏览器验证。', { exact: true })).toHaveCount(0);
  await admin.getByRole('button', { name: '发布', exact: true }).click();
  await expect(page.getByText('文件编辑浏览器验证。', { exact: true })).toBeVisible({
    timeout: 15000,
  });
  record('直接改 Markdown 后可视化可读、草稿不公开、点击发布自动更新读者');
  await admin.getByRole('menuitem', { name: '网站设置', exact: true }).click();
  await admin.getByRole('button', { name: '重新加载', exact: true }).click();
  await expect(admin.getByRole('button', { name: '重新加载', exact: true })).toBeEnabled();
  await name.fill('保留的未保存设置');
  await writeFile(settingsFile, JSON.stringify({ ...settings, siteName: '另一入口修改' }));
  await save.click();
  await expect(admin.getByText(/设置已被其他入口修改/)).toBeVisible();
  await expect(name).toHaveValue('保留的未保存设置');
  await admin.getByRole('button', { name: '取消', exact: true }).click();
  await admin.locator('.ant-notification-notice-close').last().click();
  await admin.getByRole('button', { name: '重新加载', exact: true }).click();
  await expect(name).toHaveValue('另一入口修改');
  await admin.getByRole('button', { name: '恢复默认值', exact: true }).click();
  await save.click();
  await expect(name).toHaveValue('DSdocs');
  await admin.setViewportSize({ width: 760, height: 900 });
  await expect
    .poll(() =>
      admin.locator('.ant-layout-sider').evaluate((el) => el.getBoundingClientRect().width)
    )
    .toBe(0);
  await admin.screenshot({ path: path.join(artifacts, 'settings-narrow.png') });
  record('旧表单写入冲突保留输入、重新加载与恢复默认值、窄屏截图');
  await admin.setViewportSize({ width: 1440, height: 1000 });
  await admin
    .locator('.ant-upload input[type=file]')
    .first()
    .setInputFiles(path.resolve('apps/manage/starter/assets/workflow.png'));
  await expect(admin.getByAltText('当前图片').first()).toBeVisible();
  await admin
    .locator('.ant-upload input[type=file]')
    .last()
    .setInputFiles(path.resolve('apps/manage/starter/assets/workflow.png'));
  await expect(admin.getByAltText('当前图片')).toHaveCount(2);
  await save.click();
  await expect
    .poll(async () => JSON.parse(await readFile(settingsFile, 'utf8')).logoAssetId)
    .toBeTruthy();
  await page.reload();
  await expect(
    page.getByRole('link', { name: 'DSdocs', exact: true }).locator('img')
  ).toBeVisible();
  const withImages = JSON.parse(await readFile(settingsFile, 'utf8'));
  await expect(
    page.locator(`link[rel=icon][href="/docs/assets/${withImages.faviconAssetId}"]`)
  ).toHaveCount(1);
  record('可视化上传站点标识和浏览器图标、保存及读者显示');
  const store = openContent(directory);
  const row = store.get(document.id);
  store.save(document.id, { ...row, body: row.body + '\n\n面板冲突版本' });
  store.close();
  writeFileSync(mdFile, readFileSync(mdFile, 'utf8') + '\n\n文件冲突版本');
  await admin.getByRole('menuitem', { name: '文件同步', exact: true }).click();
  const conflicts = await (
    await context.request.get('http://127.0.0.1:15782/__dsdocs_content/files')
  ).json();
  await writeFile(path.join(artifacts, 'conflict-status.json'), JSON.stringify(conflicts, null, 2));
  await admin.screenshot({ path: path.join(artifacts, 'conflict-before.png') });
  if (!conflicts.issues.length) throw new Error('冲突夹具未产生冲突');
  await admin.getByRole('button', { name: '重新检查', exact: true }).click();
  await expect(admin.getByText(conflicts.directory, { exact: true }).last()).toBeVisible();
  await admin.getByRole('button', { name: '比较', exact: true }).click();
  await expect(admin.getByRole('textbox').first()).toHaveValue(/文件冲突版本/);
  await expect(admin.getByRole('textbox').last()).toHaveValue(/面板冲突版本/);
  await admin.getByRole('button', { name: '采用文件版本', exact: true }).click();
  await expect(admin.getByText('文件与面板已同步', { exact: true })).toBeVisible();
  await admin.screenshot({ path: path.join(artifacts, 'files-synced.png') });
  record('真实文件同步面板比较双方内容、显式采用文件版本并解除冲突');
  if (report.diagnostics.length) throw new Error(JSON.stringify(report.diagnostics));
} catch (error) {
  await writeFile(
    path.join(artifacts, 'failure.json'),
    JSON.stringify({ error: String(error), diagnostics: report.diagnostics }, null, 2)
  );
  console.error(error);
  throw error;
} finally {
  await writeFile(
    path.join(artifacts, 'settings-browser-report.json'),
    JSON.stringify(report, null, 2)
  );
  await browser?.close();
  await app.close();
  const exited = once(child, 'exit');
  child.kill('SIGTERM');
  await exited;
  await rm(directory, { recursive: true, force: true });
}
