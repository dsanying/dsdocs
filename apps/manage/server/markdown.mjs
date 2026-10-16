import { admonitions } from '../../../packages/content/syntax.mjs';
import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkGfm from 'remark-gfm';
import remarkDirective from 'remark-directive';
import { visit } from 'unist-util-visit';
import { problem } from '../../../packages/content/store.mjs';
export function validateMarkdown(body) {
  const tree = unified().use(remarkParse).use(remarkGfm).use(remarkDirective).parse(body);
  visit(tree, (node) => {
    if (node.type === 'html') throw problem(422, '不支持 HTML、JSX 或脚本，请使用 Markdown。');
    if (
      node.type.endsWith('Directive') &&
      (node.type !== 'containerDirective' ||
        !Object.hasOwn(admonitions, node.name) ||
        Object.keys(node.attributes ?? {}).length)
    )
      throw problem(422, '仅支持标准提示框，不支持自定义指令和属性。');
    if (['link', 'image', 'definition'].includes(node.type) && node.url) {
      const url = node.url.trim();
      if (!/^(https?:\/\/|mailto:|\/docs\/|#)/i.test(url))
        throw problem(422, '链接只能使用 HTTPS/HTTP、邮件、站内 /docs/ 路径或锚点。');
    }
  });
  return tree;
}
