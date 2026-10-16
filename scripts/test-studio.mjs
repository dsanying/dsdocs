import assert from 'node:assert/strict';
import { mkdtemp, cp, readFile, writeFile, readdir, mkdir, rm } from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { spawn } from 'node:child_process';
import { chromium, expect } from '../apps/studio/node_modules/@playwright/test/index.mjs';

const root = path.resolve(import.meta.dirname, '..');
const temporary = await mkdtemp(path.join(tmpdir(), 'dsdocs-studio-'));
const docs = path.join(temporary, 'docs');
const artifacts = process.env.DSDOCS_ARTIFACTS ?? temporary;
await mkdir(artifacts, { recursive: true });
await cp(path.join(root, 'apps/reader/content/docs'), docs, { recursive: true });
const port = Number(process.env.DSDOCS_TEST_PORT ?? 15180);
const origin = `http://127.0.0.1:${port}`;
const child = spawn(
  process.execPath,
  [
    'node_modules/@fumadocs-editor/studio/dist/cli.js',
    '--root',
    docs,
    '--port',
    String(port),
    '--no-open',
  ],
  {
    cwd: path.join(root, 'apps/studio'),
    stdio: ['ignore', 'pipe', 'pipe'],
  }
);
let log = '';
child.stdout.on('data', (data) => {
  log += data;
});
child.stderr.on('data', (data) => {
  log += data;
});
let browser;
const errors = [],
  cases = [];
async function check(name, action) {
  await action();
  cases.push(name);
  console.log(`PASS ${name}`);
}
try {
  await expect
    .poll(
      async () => {
        if (child.exitCode !== null) throw new Error(log);
        return fetch(origin)
          .then((r) => r.ok)
          .catch(() => false);
      },
      { timeout: 30000 }
    )
    .toBe(true);
  browser = await chromium.launch({
    channel: process.env.DSDOCS_CHROME_CHANNEL ?? 'chrome',
    headless: process.env.DSDOCS_HEADLESS === '1',
  });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const page = await context.newPage();
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(`${origin}/#en%2Fgetting-started.mdx`);
  await check('official Studio loads the file workspace', async () => {
    await expect(page.getByText('Saved', { exact: true })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Edit documents', exact: true })).toBeVisible();
  });
  await page.getByText('MDX', { exact: true }).click();
  const original = await readFile(path.join(docs, 'en/getting-started.mdx'), 'utf8');
  await check('source edits autosave to disk and survive reload', async () => {
    await page.locator('textarea').fill(`${original}\n\nStudio verification marker.\n`);
    await expect
      .poll(() => readFile(path.join(docs, 'en/getting-started.mdx'), 'utf8'))
      .toContain('Studio verification marker.');
    await page.reload();
    await expect(page.getByText('Studio verification marker.', { exact: true })).toBeVisible();
  });
  await check('visual edits autosave to the same MDX file', async () => {
    if (await page.locator('textarea').isVisible())
      await page.getByText('Visual', { exact: true }).click();
    const editor = page.locator('[contenteditable="true"]').last();
    await editor.click();
    await editor.press('ControlOrMeta+End');
    await editor.press('Enter');
    await editor.pressSequentially('Visual verification marker.');
    await expect
      .poll(() => readFile(path.join(docs, 'en/getting-started.mdx'), 'utf8'))
      .toContain('Visual verification marker.');
  });
  await check('create a folder and page using the official file tree', async () => {
    await page.getByRole('button', { name: 'Files', exact: true }).click();
    await page.getByRole('button', { name: 'Actions for docs', exact: true }).click();
    await page.getByRole('menuitem', { name: 'New folder', exact: true }).click();
    await page.getByRole('textbox', { name: 'Folder name', exact: true }).fill('Verification');
    await page.getByRole('textbox', { name: 'Folder name', exact: true }).press('Enter');
    await expect.poll(() => readdir(docs)).toContain('verification');
    await page
      .getByRole('button', { name: 'Actions for Verification', exact: true })
      .first()
      .click();
    await page.getByRole('menuitem', { name: 'New page', exact: true }).click();
    await page.getByRole('textbox', { name: 'Page title', exact: true }).fill('Disposable page');
    await page.getByRole('textbox', { name: 'Page title', exact: true }).press('Enter');
    await expect
      .poll(() => readdir(path.join(docs, 'verification')))
      .toContain('disposable-page.mdx');
  });
  await check('delete a page using the confirmation dialog', async () => {
    await expect(page).toHaveURL(/verification%2Fdisposable-page.mdx$/);
    const filesButton = page.getByRole('button', { name: 'Files', exact: true });
    if ((await filesButton.getAttribute('aria-pressed')) !== 'true') await filesButton.click();
    await expect(filesButton).toHaveAttribute('aria-pressed', 'true');
    await page.getByRole('button', { name: 'Actions for Disposable page', exact: true }).click();
    await page.getByRole('menuitem', { name: 'Delete page…', exact: true }).click();
    await page.getByRole('button', { name: 'Cancel', exact: true }).click();
    assert.ok((await readdir(path.join(docs, 'verification'))).includes('disposable-page.mdx'));
    await page.getByRole('button', { name: 'Actions for Disposable page', exact: true }).click();
    await page.getByRole('menuitem', { name: 'Delete page…', exact: true }).click();
    await page.getByRole('button', { name: 'Delete', exact: true }).click();
    await expect
      .poll(() => readdir(path.join(docs, 'verification')))
      .not.toContain('disposable-page.mdx');
  });
  await page.goto(`${origin}/#en%2Fgetting-started.mdx`);
  await expect(page.getByText('Saved', { exact: true })).toBeVisible();
  await page.getByText('MDX', { exact: true }).click();
  const png = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+ip1sAAAAASUVORK5CYII=',
    'base64'
  );
  await page
    .locator('textarea')
    .fill(
      `${original}\n\n![Verification image](data:image/png;base64,${png.toString('base64')})\n`
    );
  await expect
    .poll(() => readFile(path.join(docs, 'en/getting-started.mdx'), 'utf8'))
    .toContain('Verification image');
  await page.getByText('Visual', { exact: true }).click();
  await check('official image picker uploads and saves the asset reference', async () => {
    await page.getByAltText('Verification image').click();
    const [chooser] = await Promise.all([
      page.waitForEvent('filechooser'),
      page.getByRole('button', { name: 'Upload image', exact: true }).click(),
    ]);
    await chooser.setFiles({ name: 'verification.png', mimeType: 'image/png', buffer: png });
    await expect
      .poll(() => readFile(path.join(docs, 'en/getting-started.mdx'), 'utf8'))
      .toMatch(/\.\/assets\/.*verification\.png/);
    const assets = await readdir(path.join(docs, 'assets'));
    assert.equal(assets.filter((x) => x.endsWith('verification.png')).length, 1);
    await expect
      .poll(() =>
        page
          .getByAltText('Verification image')
          .evaluate((image) => image.complete && image.naturalWidth > 0)
      )
      .toBe(true);
    await writeFile(
      path.join(artifacts, 'uploaded-document.mdx'),
      await readFile(path.join(docs, 'en/getting-started.mdx'))
    );
    await cp(path.join(docs, 'assets'), path.join(artifacts, 'uploaded-assets'), {
      recursive: true,
    });
  });
  await page.screenshot({ path: path.join(artifacts, 'official-studio.png'), fullPage: true });
  await check('removing an image saves the document but keeps the disk asset', async () => {
    await page.getByAltText('Verification image').click();
    await page.getByRole('button', { name: 'Remove image', exact: true }).click();
    await expect
      .poll(() => readFile(path.join(docs, 'en/getting-started.mdx'), 'utf8'))
      .not.toContain('verification.png');
    assert.ok(
      (await readdir(path.join(docs, 'assets'))).some((x) => x.endsWith('verification.png'))
    );
  });
  assert.deepEqual(errors, []);
  await writeFile(
    path.join(artifacts, 'studio-report.json'),
    JSON.stringify({ browser: browser.version(), cases, pageErrors: errors }, null, 2)
  );
} catch (error) {
  if (browser)
    await browser
      .contexts()[0]
      ?.pages()[0]
      ?.screenshot({ path: path.join(artifacts, 'studio-failure.png'), fullPage: true });
  throw error;
} finally {
  await browser?.close();
  child.kill('SIGTERM');
  await new Promise((resolve) =>
    child.exitCode !== null ? resolve() : child.once('exit', resolve)
  );
  await writeFile(path.join(artifacts, 'studio-server.log'), log);
  await rm(temporary, { recursive: true, force: true });
}
