import { readFile, readdir, access } from 'node:fs/promises';
import assert from 'node:assert/strict';
import path from 'node:path';
async function files(root) {
  const entries = await readdir(root, { withFileTypes: true });
  const out = [];
  for (const entry of entries) {
    if (['node_modules', '.next', 'dist', '.git', 'out'].includes(entry.name)) continue;
    const name = `${root}/${entry.name}`;
    out.push(...(entry.isDirectory() ? await files(name) : [name]));
  }
  return out;
}
for (const dir of ['apps/manage/src', 'apps/manage/server', 'apps/reader/src', 'packages'])
  for (const file of await files(dir)) {
    if (!/\.(mjs|ts|tsx)$/.test(file)) continue;
    const body = await readFile(file, 'utf8');
    assert(!/@fumadocs-editor|authentik|payloadcms/.test(body), `${file}: 旧运行依赖`);
    assert(!/@ts-ignore|@ts-nocheck/.test(body), `${file}: 禁止屏蔽类型检查`);
  }
for (const name of ['manage', 'reader']) {
  const pkg = JSON.parse(await readFile(`apps/${name}/package.json`));
  const duplicated = Object.keys(pkg.dependencies ?? {}).filter(
    (key) => key in (pkg.devDependencies ?? {})
  );
  assert.deepEqual(duplicated, [], '运行与开发依赖不得重复声明版本');
  for (const [dependency, version] of Object.entries({
    ...pkg.dependencies,
    ...pkg.devDependencies,
  })) {
    if (dependency === '@dsanying/dsdocs') {
      assert.equal(version, 'file:../../packages/react');
      const component = JSON.parse(await readFile('packages/react/package.json'));
      assert.equal(component.name, dependency);
      assert.equal(component.private, undefined);
    } else assert(/^\d+\.\d+\.\d+(?:-.*)?$/.test(version), '依赖必须精确固定');
  }
}
const server = await readFile('apps/manage/server/start.mjs', 'utf8');
assert(
  server.indexOf("pathname.startsWith('/__dsdocs_content')") > server.indexOf('actor.needsSetup'),
  '内容接口必须在认证和首次设置之后'
);
console.log('项目边界与依赖契约通过');

const documents = [
  ...(await readdir('.')).filter((name) => name.endsWith('.md')),
  ...(await files('docs')).filter((name) => name.endsWith('.md')),
];
for (const file of documents) {
  const markdown = await readFile(file, 'utf8');
  for (const match of markdown.matchAll(/!?\[[^\]]*\]\(([^)]+)\)/g)) {
    const target = match[1].replace(/^<|>$/g, '').split('#')[0];
    if (!target || /^(?:[a-z]+:|\/)/i.test(target)) continue;
    await access(path.resolve(path.dirname(file), decodeURIComponent(target))).catch(() => {
      throw new Error(`${file}: 本地链接不存在 ${target}`);
    });
  }
}
console.log('规范文档本地链接通过');
