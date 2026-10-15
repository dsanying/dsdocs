import { createCompiler } from '@fumadocs/mdx-remote';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import { inspectMdx, splitSource } from './validate';
import { DomainError } from '../core/errors';
import { createHash } from 'node:crypto';
const hash = (source: string) => createHash('sha256').update(source).digest('hex');
const compiler = createCompiler({
  remarkPlugins: [remarkMath],
  rehypePlugins: (plugins) => [[rehypeKatex, { strict: 'error', trust: false }], ...plugins],
  remarkImageOptions: false,
});
const cache = new Map<string, ReturnType<typeof compiler.compile>>();
export function compileDocument(source: string) {
  const analysis = inspectMdx(source);
  if (analysis.diagnostics.length)
    throw new DomainError(422, 'INVALID_MDX', 'Invalid MDX', analysis.diagnostics);
  const key = hash(source);
  let result = cache.get(key);
  if (!result) {
    result = compiler.compile({ source: splitSource(source).body });
    cache.set(key, result);
    if (cache.size > 100) cache.delete(cache.keys().next().value!);
    result.catch(() => cache.delete(key));
  }
  return result;
}
