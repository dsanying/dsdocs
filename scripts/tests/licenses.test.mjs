import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { collectLicenses } from '../collect-licenses.mjs';
test('许可证生成自动创建不存在的输出目录', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'dsdocs-license-output-'));
  try {
    const output = path.join(directory, 'nested', 'public', 'THIRD_PARTY_NOTICES.txt');
    await collectLicenses('apps/reader', pathToFileURL(output));
    const text = await readFile(output, 'utf8');
    assert.match(text, /DSdocs project license/);
    assert.match(text, /fumadocs-ui 16\.17\.3/);
    assert.match(text, /Permission is hereby granted/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
