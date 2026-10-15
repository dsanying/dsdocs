import { readFileSync } from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { getStore } from '../src/core/store';
const username = process.env.DSDOCS_ADMIN_USERNAME,
  password = process.env.DSDOCS_ADMIN_PASSWORD;
if (!username || !password)
  throw new Error('Set DSDOCS_ADMIN_USERNAME and DSDOCS_ADMIN_PASSWORD in the process environment');
const store = getStore();
try {
  const user = store.bootstrap(username, password);
  if (process.argv.includes('--demo'))
    for (const locale of ['zh', 'en'] as const)
      for (const [order, slug] of ['getting-started', 'syntax'].entries()) {
        const title =
          locale === 'zh'
            ? slug === 'syntax'
              ? '语法与组件'
              : '开始使用'
            : slug === 'syntax'
              ? 'Syntax and components'
              : 'Getting started';
        const source = readFileSync(
          path.resolve('../../examples/content', locale, `${slug}.mdx`),
          'utf8'
        );
        const saved = store.save(
          user,
          undefined,
          {
            title,
            description: '',
            path: slug,
            locale,
            version: 'latest',
            translationKey: slug,
            group: locale === 'zh' ? '使用文档' : 'Documentation',
            order,
            mdx: source,
          },
          0,
          randomUUID()
        );
        store.publish(user, saved.document.id, 1, randomUUID());
      }
  console.log('dsdocs initialized. No credentials are printed.');
} finally {
  store.close();
}
