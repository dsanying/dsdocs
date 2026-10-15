import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { Store } from '../src/core/store';
import { exportFiles } from '../src/core/file-export';
import { splitSource } from '../src/content/validate';
test('portable files contain published MDX and referenced assets only, without CMS URLs or secrets', () => {
  const store = new Store(':memory:');
  try {
    const password = randomBytes(24).toString('hex'),
      user = store.bootstrap('manager', password);
    const image = store.upload(
      user,
      'visible.png',
      'image/png',
      Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])
    );
    const hidden = store.upload(
      user,
      'private.png',
      'image/png',
      Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])
    );
    const content = {
      title: 'Published',
      description: 'Description',
      path: 'api/start',
      locale: 'zh' as const,
      version: 'latest' as const,
      translationKey: 'start',
      group: 'API',
      order: 2,
      mdx: `## Start\n\n![Image](${image.url})`,
    };
    const doc = store.save(user, undefined, content, 0, randomUUID()).document;
    store.publish(user, doc.id, 1, randomUUID());
    store.save(
      user,
      doc.id,
      { ...content, title: 'Private draft', mdx: `![Secret](${hidden.url})` },
      1,
      randomUUID()
    );
    const files = exportFiles(store, user, '/help'),
      text = Buffer.from(files['content/docs/zh/api/start.mdx']).toString();
    assert.equal(splitSource(text).frontmatter.title, 'Published');
    assert.match(text, new RegExp(`/help/assets/${image.id}.png`));
    assert.ok(files[`public/assets/${image.id}.png`]);
    assert.ok(!JSON.stringify(Object.keys(files)).includes(hidden.id));
    assert.ok(!text.includes('Private draft'));
    assert.ok(!text.includes('/api/v1/'));
    assert.ok(!text.includes(password));
  } finally {
    store.close();
  }
});
