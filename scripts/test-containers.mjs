import { spawnSync } from 'node:child_process';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';
import assert from 'node:assert/strict';
const directory = await mkdtemp(path.join(tmpdir(), 'dsdocs-containers-')),
  file = path.join(directory, 'compose.json');
const project = 'dsdocs-container-check';
await writeFile(
  file,
  JSON.stringify({
    services: {
      management: {
        image: 'dsdocs-management:local',
        environment: { DSDOCS_URL: 'http://127.0.0.1:15582' },
        ports: ['127.0.0.1:15582:5182'],
        volumes: ['content:/data'],
      },
      reader: {
        image: 'dsdocs-reader:local',
        ports: ['127.0.0.1:15500:3300'],
        volumes: ['content:/data:ro'],
      },
    },
    volumes: { content: {} },
  })
);
const run = (args, input) => {
  const result = spawnSync('docker', args, { input, encoding: 'utf8', maxBuffer: 1024 * 1024 });
  if (result.status !== 0) throw new Error(result.stderr);
  return result.stdout;
};
const compose = (...args) => run(['compose', '-p', project, '-f', file, ...args]);
const report = { checks: [], images: {} };
try {
  for (const target of ['management', 'reader']) {
    console.log(`[container] 构建 ${target} 当前源码镜像`);
    run(['build', '--target', target, '--tag', `dsdocs-${target}:local`, '.']);
  }
  compose('up', '-d');
  const end = Date.now() + 30000;
  while (true) {
    try {
      if ((await fetch('http://127.0.0.1:15582/login')).ok) break;
    } catch {}
    if (Date.now() > end) throw new Error('管理容器未就绪');
    await new Promise((r) => setTimeout(r, 200));
  }
  for (const name of ['management', 'reader']) {
    const info = JSON.parse(run(['image', 'inspect', `dsdocs-${name}:local`]))[0];
    assert.equal(info.Config.User, 'node');
    report.images[name] = info.Id;
  }
  report.checks.push('两端镜像以非 root 用户运行');
  const login = await fetch('http://127.0.0.1:15582/__dsdocs_auth/sign-in/username', {
    method: 'POST',
    headers: { origin: 'http://127.0.0.1:15582', 'content-type': 'application/json' },
    body: JSON.stringify({ username: 'admin', password: 'admin' }),
  });
  assert.equal(login.status, 200);
  report.checks.push('Linux 容器初始化账号与登录');
  assert.match(await (await fetch('http://127.0.0.1:15500/docs/zh')).text(), /欢迎使用 DSdocs/);
  const sample = JSON.parse(
    run(
      ['exec', '-i', `${project}-management-1`, 'node', '--input-type=module', '-'],
      `import {openContent} from '/app/packages/content/store.mjs';const store=openContent(undefined,true);console.log(JSON.stringify({count:store.published().length,image:store.db.prepare("SELECT id FROM assets WHERE mime='image/png'").get().id}));store.close();`
    )
  );
  assert.equal(sample.count, 8);
  const picture = await fetch(`http://127.0.0.1:15500/docs/assets/${sample.image}`);
  assert.equal(picture.status, 200);
  assert.equal(picture.headers.get('content-type'), 'image/png');
  assert.ok((await picture.arrayBuffer()).byteLength > 1000);
  report.checks.push('全新镜像自带八篇教程与可读图片附件');
  const id = run(
    ['exec', '-i', `${project}-management-1`, 'node', '--input-type=module', '-'],
    `import {openContent} from '/app/packages/content/store.mjs';const store=openContent();let doc=store.create({title:'容器验证',slug:'container-check',locale:'zh'});doc=store.save(doc.id,{...doc,body:'## 只读验证\\n\\nReadonly mount works',version:doc.version});console.log(doc.id);store.close();`
  ).trim();
  const before = await fetch('http://127.0.0.1:15500/docs/zh/container-check');
  assert.equal(before.status, 404);
  run(
    ['exec', '-i', `${project}-management-1`, 'node', '--input-type=module', '-'],
    `import {openContent} from '/app/packages/content/store.mjs';const store=openContent();const doc=store.get(${JSON.stringify(id)});store.publish(doc.id,doc.version);store.close();`
  );
  const url = 'http://127.0.0.1:15500/docs/zh/container-check';
  assert.match(await (await fetch(url)).text(), /Readonly mount works/);
  report.checks.push('只读挂载读者的草稿隔离与动态发布');
  run(
    ['exec', '-i', `${project}-management-1`, 'node', '--input-type=module', '-'],
    `import {readFileSync,writeFileSync} from 'node:fs';const file='/data/workspace/site.json';const value=JSON.parse(readFileSync(file,'utf8'));writeFileSync(file,JSON.stringify({...value,siteName:'容器文件设置验证'}));`
  );
  const settingDeadline = Date.now() + 15000;
  while (!(await (await fetch(url)).text()).includes('容器文件设置验证')) {
    if (Date.now() > settingDeadline) throw new Error('容器文件设置未同步');
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  report.checks.push('容器可编辑设置文件导入数据库并由只读读者即时显示');
  compose('stop', 'management');
  assert.equal((await fetch(url)).status, 200);
  assert.match(await (await fetch(url)).text(), /Readonly mount works/);
  report.checks.push('管理容器停止后只读读者继续服务');
  const notices = await fetch('http://127.0.0.1:15500/docs/THIRD_PARTY_NOTICES.txt');
  assert.equal(notices.status, 200);
  report.checks.push('镜像保留第三方许可');
  console.log(JSON.stringify(report));
  if (process.env.DSDOCS_ARTIFACTS)
    await writeFile(
      path.join(process.env.DSDOCS_ARTIFACTS, 'containers-report.json'),
      JSON.stringify(report, null, 2)
    );
} finally {
  compose('down', '--volumes', '--remove-orphans');
  await rm(directory, { recursive: true, force: true });
}
