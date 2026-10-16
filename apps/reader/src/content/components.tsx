import { admonitions } from '../../../../packages/content/syntax.mjs';
import { unified } from 'unified';
import remarkParse from 'remark-parse';
import { MarkdownAsync } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkDirective from 'remark-directive';
import { visit } from 'unist-util-visit';
import defaultComponents from 'fumadocs-ui/mdx';
import { Callout } from 'fumadocs-ui/components/callout';
import { codeToHast, bundledLanguages } from 'shiki';
import type { Components } from 'react-markdown';
import type { Root as MdRoot, RootContent as MdNode } from 'mdast';
import type { Root as HtmlRoot, Element } from 'hast';
export function headingId(value: string) {
  return (
    value
      .toLowerCase()
      .trim()
      .replace(/[^\p{L}\p{N}\s-]/gu, '')
      .replace(/\s+/g, '-') || 'section'
  );
}
function textContent(node: MdNode): string {
  return 'value' in node
    ? node.value
    : 'children' in node
      ? node.children.map((child) => textContent(child)).join('')
      : '';
}
export function documentHeadings(body: string) {
  const result: { title: string; url: string; depth: number }[] = [],
    used = new Map<string, number>();
  const tree = unified().use(remarkParse).use(remarkGfm).use(remarkDirective).parse(body);
  visit(tree, 'heading', (node) => {
    const title = textContent(node),
      base = headingId(title),
      count = used.get(base) ?? 0;
    used.set(base, count + 1);
    result.push({
      title,
      url: `#${base}${count ? `-${count}` : ''}`,
      depth: Math.max(2, node.depth),
    });
  });
  return result;
}
function documentSyntax() {
  return (tree: MdRoot) => {
    const used = new Map<string, number>();
    visit(tree, (node) => {
      if (node.type === 'heading') {
        const base = headingId(textContent(node)),
          count = used.get(base) ?? 0;
        used.set(base, count + 1);
        node.depth = Math.max(2, node.depth) as 2 | 3 | 4 | 5 | 6;
        node.data = { ...node.data, hProperties: { id: `${base}${count ? `-${count}` : ''}` } };
      }
      if (node.type === 'containerDirective' && Object.hasOwn(admonitions, node.name)) {
        node.data = { hName: 'aside', hProperties: { 'data-callout': node.name } };
      }
    });
  };
}
function highlightedCode() {
  return async (tree: HtmlRoot) => {
    const jobs: Promise<void>[] = [];
    visit(tree, 'element', (node: Element) => {
      const code = node.children[0];
      if (node.tagName !== 'pre' || code?.type !== 'element' || code.tagName !== 'code') return;
      const lang = String(code.properties.className ?? '').replace('language-', '');
      const literal = code.children.map((x) => (x.type === 'text' ? x.value : '')).join('');
      jobs.push(
        codeToHast(literal, {
          lang: lang in bundledLanguages ? lang : 'text',
          themes: { light: 'github-light', dark: 'github-dark' },
          defaultColor: false,
        }).then((result) => {
          const pre = result.children.find((x) => x.type === 'element');
          if (pre?.type === 'element') {
            node.children = pre.children;
            node.properties = { ...pre.properties };
          }
        })
      );
    });
    await Promise.all(jobs);
  };
}
const components: Components = {
  ...(defaultComponents as Components),
  aside: ({ children, node, ...props }) => (
    <Callout
      type={
        (admonitions as Record<string, { tone: 'info' | 'warn' | 'error' | 'success' }>)[
          String(node?.properties['data-callout'] ?? node?.properties.dataCallout)
        ]?.tone ?? 'info'
      }
    >
      {children}
    </Callout>
  ),
};
export async function DocumentBody({ body }: { body: string }) {
  return (
    <MarkdownAsync
      remarkPlugins={[remarkGfm, remarkDirective, documentSyntax]}
      rehypePlugins={[highlightedCode]}
      components={components}
      skipHtml
    >
      {body}
    </MarkdownAsync>
  );
}
