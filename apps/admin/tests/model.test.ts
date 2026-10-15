import test from 'node:test';
import assert from 'node:assert/strict';
import { emptyContent, equalContent, formContent, naturalName } from '../src/model';
import type { Document } from '../src/api';
test('editing preserves the exact MDX and immutable translation identity without revision metadata', () => {
  const source = '<Tabs items={["one"]}>\n<Tab value="one">  Text  </Tab>\n</Tabs>\n';
  const content = { ...emptyContent, title: 'Title', translationKey: 'stable', mdx: source },
    document = {
      draft: { ...content, number: 2, actor: 'manager', createdAt: '2026-01-01' },
    } as Document;
  const form = formContent(document);
  assert.deepEqual(form, content);
  assert.equal(form.mdx, source);
  assert.ok(!('number' in form));
  assert.ok(equalContent(form, { ...form }));
  assert.ok(!equalContent(form, { ...form, mdx: source + ' ' }));
});
test('entity names use natural numeric sorting', () => {
  assert.deepEqual(['file10', 'file2', 'file1'].sort(naturalName), ['file1', 'file2', 'file10']);
});
