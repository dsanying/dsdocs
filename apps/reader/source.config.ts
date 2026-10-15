import { defineConfig, defineDocs } from 'fumadocs-mdx/config';
import { pageSchema } from 'fumadocs-core/source/schema';
import { z } from 'zod';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
export const docs = defineDocs({
  dir: 'content/docs',
  docs: {
    schema: pageSchema.extend({
      translationKey: z.string().optional(),
      group: z.string().default(''),
      order: z.number().default(0),
    }),
  },
});
export default defineConfig({
  mdxOptions: {
    remarkPlugins: [remarkMath],
    rehypePlugins: (plugins) => [[rehypeKatex, { strict: 'error', trust: false }], ...plugins],
    remarkImageOptions: false,
  },
});
