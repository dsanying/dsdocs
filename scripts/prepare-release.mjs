import { spawn } from 'node:child_process';
import { collectLicenses } from './collect-licenses.mjs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createHash, randomBytes } from 'node:crypto';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
const root = path.resolve(import.meta.dirname, '..');
async function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    let output = '';
    const child = spawn(command, args, {
      cwd: root,
      timeout: 20 * 60 * 1000,
      env: process.env,
      stdio: options.capture ? ['ignore', 'pipe', 'inherit'] : 'inherit',
      ...options,
    });
    child.stdout?.on('data', (data) => {
      output += data;
    });
    child.once('error', reject);
    child.once('exit', (code) =>
      code === 0 ? resolve(output.trim()) : reject(new Error(`${command} exited with ${code}`))
    );
  });
}
const status = await run('git', ['status', '--porcelain'], { capture: true });
if (status) throw new Error('Commit the reviewed source before preparing artifacts');
const commit = await run('git', ['rev-parse', 'HEAD'], { capture: true });
const output = path.resolve(
  process.env.DSDOCS_RELEASE_OUTPUT ?? path.join(root, 'release-artifacts', commit.slice(0, 12))
);
await mkdir(output, { recursive: true });
await run('pnpm', ['check']);
for (const app of ['admin', 'site', 'reader'])
  await run('pnpm', ['-C', `apps/${app}`, 'audit', '--prod', '--audit-level=low']);
await run('docker', ['build', '--tag', 'dsdocs:preflight', '.']);
const name = `dsdocs-preflight-${randomBytes(6).toString('hex')}`,
  origin = 'http://127.0.0.1:14320';
const password = randomBytes(24).toString('base64url'),
  testEnv = {
    ...process.env,
    DSDOCS_ADMIN_USERNAME: 'preflight-manager',
    DSDOCS_ADMIN_PASSWORD: password,
  };
try {
  await run('docker', [
    'run',
    '--detach',
    '--name',
    name,
    '--publish',
    '127.0.0.1:14320:3200',
    '--env',
    `DSDOCS_ORIGIN=${origin}`,
    'dsdocs:preflight',
  ]);
  let ready = false;
  for (let attempt = 0; attempt < 100; attempt++) {
    try {
      if ((await fetch(`${origin}/docs/api/v1/session`)).ok) {
        ready = true;
        break;
      }
    } catch {
      /* Startup in progress. */
    }
    await delay(200);
  }
  if (!ready) throw new Error('Container did not become ready');
  await run(
    'docker',
    [
      'exec',
      '--env',
      'DSDOCS_ADMIN_USERNAME',
      '--env',
      'DSDOCS_ADMIN_PASSWORD',
      name,
      'node',
      'node_modules/tsx/dist/cli.mjs',
      'scripts/init.ts',
    ],
    { env: testEnv }
  );
  const response = await fetch(`${origin}/docs/api/v1/login`, {
    method: 'POST',
    headers: { Origin: origin, 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'preflight-manager', password }),
  });
  if (response.status !== 200) throw new Error('Container account smoke test failed');
  if (!(await fetch(`${origin}/docs/admin`)).ok)
    throw new Error('Container administration route failed');
} finally {
  await run('docker', ['rm', '--force', name]).catch(() => {});
}
if (
  (await run('git', ['status', '--porcelain'], { capture: true })) ||
  (await run('git', ['rev-parse', 'HEAD'], { capture: true })) !== commit
)
  throw new Error('Source changed during preparation');
await collectLicenses('apps/reader', path.join(root, 'apps/reader/out/THIRD_PARTY_NOTICES.txt'));
const source = path.join(output, 'dsdocs-source.tar.gz'),
  reader = path.join(output, 'dsdocs-example-reader.tar.gz');
await run('git', ['archive', '--format=tar.gz', '--prefix=dsdocs/', '--output', source, commit]);
await run('tar', ['-czf', reader, '-C', path.join(root, 'apps/reader/out'), '.']);
const hashes = await Promise.all(
  [source, reader].map(
    async (file) =>
      `${createHash('sha256')
        .update(await readFile(file))
        .digest('hex')}  ${path.basename(file)}`
  )
);
await writeFile(path.join(output, 'SHA256SUMS'), hashes.join('\n') + '\n');
await writeFile(
  path.join(output, 'preflight.json'),
  JSON.stringify(
    {
      commit,
      preparedAt: new Date().toISOString(),
      image: 'dsdocs:preflight',
      containerSmoke: true,
      published: false,
    },
    null,
    2
  ) + '\n'
);
console.log(
  `Prepared ${output}. No tag, GitHub Release, package, image push or deployment was created.`
);
