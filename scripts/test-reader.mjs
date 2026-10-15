import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, stat, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { chromium, firefox, expect } from '../apps/admin/node_modules/@playwright/test/index.mjs';
const directory = path.resolve(process.env.DSDOCS_READER_OUT ?? 'apps/reader/out');
const prefix = (process.env.DSDOCS_BASE_PATH ?? '/docs').replace(/\/$/, '');
const artifacts = process.env.DSDOCS_ARTIFACTS;
const types = {
  '.html': 'text/html',
  '.css': 'text/css',
  '.js': 'application/javascript',
  '.json': 'application/json',
  '.txt': 'text/plain',
  '.woff2': 'font/woff2',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
};
const server = createServer(async (request, response) => {
  try {
    const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
    if (!(pathname === prefix || pathname.startsWith(`${prefix}/`))) throw new Error('Not found');
    let file = path.resolve(directory, `.${pathname.slice(prefix.length) || '/'}`);
    if (file !== directory && !file.startsWith(directory + path.sep)) throw new Error('Not found');
    if ((await stat(file)).isDirectory()) file = path.join(file, 'index.html');
    response.setHeader('Content-Type', types[path.extname(file)] ?? 'application/octet-stream');
    response.end(await readFile(file));
  } catch {
    response.statusCode = 404;
    response.end('Not found');
  }
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
try {
  for (const [name, engine] of [
    ['chromium', chromium],
    ['firefox', firefox],
  ]) {
    const browser = await engine.launch();
    try {
      const context = await browser.newContext({
          locale: 'zh-CN',
          viewport: { width: 1440, height: 1000 },
        }),
        page = await context.newPage(),
        errors = [],
        forbidden = [];
      page.on('pageerror', (error) => errors.push(error.message));
      page.on('request', (request) => {
        if (/\/api\/|\/admin\//.test(new URL(request.url()).pathname))
          forbidden.push(request.url());
      });
      await page.goto(`${origin}${prefix}/zh/syntax/`);
      await expect(page.getByRole('heading', { level: 1 })).toHaveText('语法与组件');
      assert.ok((await page.locator('.katex').count()) >= 2);
      if (process.env.DSDOCS_EXPECT_EXPORTED_ASSET === '1') {
        await expect
          .poll(() =>
            page
              .getByAltText('导出附件')
              .evaluate((image) => image.complete && image.naturalWidth > 0)
          )
          .toBe(true);
        await expect(page.getByAltText('导出附件')).toHaveAttribute(
          'src',
          new RegExp(`^${prefix}/assets/`)
        );
      }

      await page.getByRole('tab', { name: 'English', exact: true }).click();
      await expect(
        page.getByText('Browse documents using the sidebar.', { exact: true })
      ).toBeVisible();
      await page.getByRole('button', { name: '搜索文档', exact: false }).click();
      await page.getByRole('combobox').fill('语法');
      await page.getByRole('option').filter({ hasText: '语法与组件' }).first().click();
      await expect(page).toHaveURL(/\/zh\/syntax\/?(?:#.*)?$/);
      await page.getByRole('button', { name: '选择语言', exact: true }).click();
      await page.getByRole('button', { name: 'English', exact: true }).click();
      await expect(page.getByRole('heading', { level: 1 })).toHaveText('Syntax and components');
      assert.equal(await page.evaluate(() => localStorage.getItem('dsdocs-language')), 'en');
      await page.goto(`${origin}${prefix}/`);
      await expect(page).toHaveURL(/\/en\/?$/);
      await page.setViewportSize({ width: 390, height: 844 });
      await page.goto(`${origin}${prefix}/zh/syntax/`);
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
      assert.equal((await context.request.get(`${origin}${prefix}/admin`)).status(), 404);
      assert.deepEqual(forbidden, []);
      assert.deepEqual(errors, []);
      if (artifacts) {
        await mkdir(artifacts, { recursive: true });
        await page.screenshot({
          path: path.join(artifacts, `${name}-standalone-reader.png`),
          fullPage: true,
        });
      }
      console.log(
        `PASS ${name}: static files, native components/math/search, linked languages, stored preference, mobile; no CMS request`
      );
    } finally {
      await browser.close();
    }
  }
} finally {
  await new Promise((resolve) => server.close(resolve));
}
