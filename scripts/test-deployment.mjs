import { spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { writeFile, rm, mkdtemp, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { request } from 'node:http';
import assert from 'node:assert/strict';
import { chromium, expect } from '../apps/studio/node_modules/@playwright/test/index.mjs';
const root = path.resolve(import.meta.dirname, '..');
const artifact =
  process.env.DSDOCS_ARTIFACTS ?? (await mkdtemp(path.join(tmpdir(), 'dsdocs-deployment-')));
await mkdir(artifact, { recursive: true });
function docker(args, options = {}) {
  const r = spawnSync('docker', args, {
    encoding: 'utf8',
    maxBuffer: 10 * 1024 * 1024,
    ...options,
  });
  if (r.status !== 0) throw new Error(r.stderr || r.stdout);
  return r.stdout.trim();
}
for (const target of ['reader', 'studio'])
  docker(['build', '--target', target, '--tag', `dsdocs-${target}:official-test`, root]);
const password = randomBytes(32).toString('hex');
const hash = docker(['run', '--rm', '-i', 'caddy:2.11.7', 'caddy', 'hash-password'], {
  input: password + '\n',
});
docker(
  [
    'compose',
    '--project-directory',
    root,
    '-f',
    'compose.yaml',
    '-f',
    'deploy/compose.basic.yaml',
    'config',
    '--quiet',
  ],
  {
    env: { ...process.env, DSDOCS_EDITOR_USER: 'verification', DSDOCS_EDITOR_PASSWORD_HASH: hash },
  }
);
const envFile = artifact + '/container.env';
await writeFile(envFile, `DSDOCS_EDITOR_USER=verification\nDSDOCS_EDITOR_PASSWORD_HASH=${hash}\n`, {
  mode: 0o600,
});
const name = `dsdocs-verification-${process.pid}`;
const report = {};
let browser;
try {
  docker(['network', 'create', name]);
  docker([
    'run',
    '-d',
    '--name',
    name + '-studio',
    '--network',
    name,
    '--network-alias',
    'studio',
    'dsdocs-studio:official-test',
  ]);
  docker([
    'run',
    '-d',
    '--name',
    name + '-gateway',
    '--network',
    name,
    '--env-file',
    envFile,
    '-p',
    '127.0.0.1:15181:5180',
    '-v',
    root + '/deploy/editor.Caddyfile:/etc/caddy/Caddyfile:ro',
    'caddy:2.11.7',
  ]);
  docker([
    'run',
    '-d',
    '--name',
    name + '-reader',
    '-p',
    '127.0.0.1:14200:3200',
    'dsdocs-reader:official-test',
  ]);
  await expect
    .poll(
      () =>
        fetch('http://127.0.0.1:15181')
          .then((r) => r.status)
          .catch(() => 0),
      { timeout: 30000 }
    )
    .toBe(401);
  for (const path of ['/', '/__fde_upload', '/__fde_asset/assets/test.png', '/@fs/etc/passwd'])
    assert.equal((await fetch('http://127.0.0.1:15181' + path)).status, 401);
  report.anonymousHttp = '401 for page, upload, assets and Vite filesystem';
  report.anonymousWebsocket = await new Promise((resolve, reject) => {
    const r = request(
      'http://127.0.0.1:15181/__fde_sync',
      {
        headers: {
          Connection: 'Upgrade',
          Upgrade: 'websocket',
          'Sec-WebSocket-Key': randomBytes(16).toString('base64'),
          'Sec-WebSocket-Version': '13',
        },
      },
      (res) => {
        res.resume();
        resolve(res.statusCode);
      }
    );
    r.on('upgrade', (_, socket) => {
      socket.destroy();
      resolve(101);
    });
    r.on('error', reject);
    r.end();
  });
  assert.equal(report.anonymousWebsocket, 401);
  await expect
    .poll(
      () =>
        fetch('http://127.0.0.1:15181/', {
          headers: {
            Authorization: 'Basic ' + Buffer.from('verification:' + password).toString('base64'),
          },
        })
          .then((r) => r.status)
          .catch(() => 0),
      { timeout: 60000 }
    )
    .toBe(200);
  browser = await chromium.launch({
    channel: process.env.DSDOCS_CHROME_CHANNEL ?? 'chrome',
    headless: process.env.DSDOCS_HEADLESS === '1',
  });
  const context = await browser.newContext({
    httpCredentials: { username: 'verification', password },
  });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('http://127.0.0.1:15181');
  await expect(page.getByText('Saved', { exact: true })).toBeVisible({ timeout: 60000 });
  await page.screenshot({ path: artifact + '/authenticated-studio.png' });
  report.authenticatedEditor =
    'Chrome loads and connects to official workspace through authenticated gateway';
  assert.deepEqual(errors, []);
  const reader = await browser.newPage();
  await reader.goto('http://127.0.0.1:14200/docs/zh/getting-started/');
  await expect(reader.getByRole('heading', { level: 1 })).toHaveText('开始使用');
  assert.equal((await fetch('http://127.0.0.1:14200/__fde_sync')).status, 404);
  docker(['stop', name + '-studio']);
  await reader.reload();
  await expect(reader.getByRole('heading', { level: 1 })).toHaveText('开始使用');
  await reader.getByRole('button', { name: '搜索文档', exact: false }).click();
  await reader.getByRole('combobox').fill('语法');
  await expect(reader.getByRole('option').filter({ hasText: '语法与组件' }).first()).toBeVisible();
  report.readerWithoutStudio =
    'reader content and static search continue after editor container stops';
  await writeFile(artifact + '/container-report.json', JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
} finally {
  await browser?.close();
  for (const service of ['gateway', 'studio', 'reader'])
    spawnSync('docker', ['rm', '-f', name + '-' + service], { stdio: 'ignore' });
  spawnSync('docker', ['network', 'rm', name], { stdio: 'ignore' });
  await rm(envFile, { force: true });
}
