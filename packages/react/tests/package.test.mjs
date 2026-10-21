import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { test } from 'node:test';
import { PublishedContent } from '../dist/reader.js';
import { zhCNTranslation } from '../dist/zh-CN.js';

test('Chinese editor translation uses native keys and substitutes interpolation literally', () => {
  assert.equal(zhCNTranslation('toolbar.source', 'Source mode'), '源码模式');
  assert.equal(
    zhCNTranslation('unknown.key', 'Future upstream control'),
    'Future upstream control'
  );
  assert.equal(
    zhCNTranslation('linkPreview.open', 'Open {{url}}', { url: '/docs/a?x=<test>' }),
    '在新窗口中打开 /docs/a?x=<test>'
  );
});

test('public reader preserves content and escapes text through React', () => {
  const html = renderToStaticMarkup(
    createElement(
      PublishedContent,
      { className: 'host-prose' },
      createElement('p', null, '<script>alert(1)</script>')
    )
  );
  assert.match(html, /host-prose/);
  assert.match(html, /&lt;script&gt;/);
  assert.doesNotMatch(html, /<script>/);
});

test('published package has public exports and excludes application data and credentials', async () => {
  const pkg = JSON.parse(await readFile(new URL('../package.json', import.meta.url)));
  assert.equal(pkg.private, undefined);
  assert.equal(pkg.publishConfig.access, 'public');
  assert.equal(pkg.dependencies, undefined, 'frameworks remain host peer dependencies');
  const [archive] = JSON.parse(
    execFileSync('npm', ['pack', '--dry-run', '--ignore-scripts', '--json'], {
      cwd: new URL('..', import.meta.url),
      encoding: 'utf8',
    })
  );
  const files = archive.files.map((file) => file.path);
  for (const path of files)
    assert.match(path, /^(?:dist\/|LICENSE$|README\.md$|THIRD_PARTY_NOTICES\.md$|package\.json$)/);
  for (const path of [
    'dist/editor.js',
    'dist/editor.d.ts',
    'dist/reader.js',
    'dist/reader.d.ts',
    'dist/style.css',
  ])
    assert(files.includes(path));
  assert(!files.some((file) => /node_modules|\.env|sqlite|\.key|test-results/.test(file)));
});
