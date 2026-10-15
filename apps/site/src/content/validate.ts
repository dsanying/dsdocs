import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkMdx from 'remark-mdx';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import { parseDocument } from 'yaml';
import { componentRegistry, htmlElements } from './registry';
import { config } from '../core/config';
export type Diagnostic = { code: string; message: string; line: number; column: number };
type Ast = {
  type: string;
  name?: string | null;
  value?: unknown;
  url?: string;
  attributes?: Ast[];
  children?: Ast[];
  data?: { estree?: Ast };
  body?: Ast[];
  expression?: Ast;
  properties?: Ast[];
  elements?: (Ast | null)[];
  key?: Ast;
  computed?: boolean;
  position?: { start: { line: number; column: number } };
};
export function safeUrl(value: string): boolean {
  if (/[\u0000-\u0020\u007f\\]/.test(value) || value.startsWith('//')) return false;
  const scheme = value.match(/^([\w+.-]+):/);
  return !scheme || ['https', 'http', 'mailto', 'tel'].includes(scheme[1].toLowerCase());
}
export function splitSource(source: string) {
  const match = source.replace(/^\uFEFF/, '').match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
  if (!match) return { body: source, frontmatter: {} as Record<string, unknown>, offset: 0 };
  const document = parseDocument(match[1], { uniqueKeys: true });
  if (document.errors.length) throw document.errors[0];
  const data: unknown = document.toJS({ maxAliasCount: 0 });
  if (!data || Array.isArray(data) || typeof data !== 'object')
    throw new Error('Frontmatter must be an object');
  return {
    body: source.slice(match[0].length),
    frontmatter: data as Record<string, unknown>,
    offset: match[0].split('\n').length - 1,
  };
}
function literal(node: Ast | null | undefined): boolean {
  if (!node) return false;
  if (node.type === 'Literal') return typeof node.value !== 'object' || node.value === null;
  if (node.type === 'ArrayExpression') return Boolean(node.elements?.every(literal));
  if (node.type === 'ObjectExpression')
    return Boolean(
      node.properties?.every(
        (p) => p.type === 'Property' && !p.computed && p.value && literal(p.value as Ast)
      )
    );
  return false;
}
function renderedLiteral(node: Ast | null | undefined): boolean {
  return Boolean(
    node &&
    ((node.type === 'Literal' && (typeof node.value !== 'object' || node.value === null)) ||
      (node.type === 'ArrayExpression' && node.elements?.every(renderedLiteral)))
  );
}
function literalValue(node: Ast | undefined): unknown {
  if (node?.type === 'Literal') return node.value;
  if (node?.type === 'ArrayExpression')
    return node.elements?.map((item) => literalValue(item ?? undefined));
  return undefined;
}
function attributeValue(attr: Ast): unknown {
  return attr.value === null
    ? true
    : typeof attr.value === 'object'
      ? literalValue((attr.value as Ast).data?.estree?.body?.[0]?.expression)
      : attr.value;
}
export function inspectMdx(source: string): {
  diagnostics: Diagnostic[];
  links: string[];
  assets: string[];
  text: string;
} {
  const diagnostics: Diagnostic[] = [],
    links: string[] = [],
    text: string[] = [];
  let offset = 0;
  const problem = (node: Ast, code: string, message: string) =>
    diagnostics.push({
      code,
      message,
      line: (node.position?.start.line ?? 1) + offset,
      column: node.position?.start.column ?? 1,
    });
  if (Buffer.byteLength(source) > config.maxSourceBytes)
    return {
      diagnostics: [
        { code: 'SOURCE_TOO_LARGE', message: 'MDX exceeds 256 KiB', line: 1, column: 1 },
      ],
      links: [],
      assets: [],
      text: '',
    };
  try {
    const parts = splitSource(source);
    offset = parts.offset;
    const tree = unified()
      .use(remarkParse)
      .use(remarkGfm)
      .use(remarkMath)
      .use(remarkMdx)
      .parse(parts.body) as unknown as Ast;
    let count = 0;
    function walk(
      node: Ast,
      depth = 0,
      context: { tabs?: { items: string[]; next: number }; accordion?: boolean } = {}
    ) {
      if (++count > 20000 || depth > 80) throw new Error('MDX structure exceeds limits');
      if (node.type === 'mdxjsEsm')
        problem(
          node,
          'MODULE_NOT_ALLOWED',
          'Imports and exports belong in the deployment component registry'
        );
      if (node.type === 'mdxFlowExpression' || node.type === 'mdxTextExpression') {
        const body = node.data?.estree?.body;
        // MDX comments have an empty program; only scalar/array/object literals may execute.
        if (
          body?.length &&
          !(
            body.length === 1 &&
            body[0].type === 'ExpressionStatement' &&
            renderedLiteral(body[0].expression)
          )
        )
          problem(
            node,
            'EXPRESSION_NOT_ALLOWED',
            'Only literal MDX expressions are supported in CMS-authored content'
          );
      }
      if (node.type === 'mdxJsxFlowElement' || node.type === 'mdxJsxTextElement') {
        const name = node.name;
        const entry = name ? componentRegistry[name as keyof typeof componentRegistry] : undefined;
        if (name && !entry && !htmlElements.has(name))
          problem(node, 'UNKNOWN_COMPONENT', `Unsupported component: ${name}`);
        const values = Object.fromEntries(
          (node.attributes ?? [])
            .filter((attr) => attr.type === 'mdxJsxAttribute')
            .map((attr) => [attr.name, attributeValue(attr)])
        );
        for (const attr of node.attributes ?? []) {
          const key = attr.name ?? '';
          if (attr.type !== 'mdxJsxAttribute') {
            problem(attr, 'SPREAD_NOT_ALLOWED', 'Spread attributes are not supported');
            continue;
          }
          const allowed = [
            'id',
            'title',
            'className',
            'aria-label',
            'aria-hidden',
            'role',
            'href',
            'src',
            'alt',
            'width',
            'height',
            'open',
            'start',
            'colSpan',
            'rowSpan',
          ];
          if (
            /^on/i.test(key) ||
            ['style', 'dangerouslySetInnerHTML', 'ref', 'key', 'srcDoc'].includes(key) ||
            (entry && !(entry.props as readonly string[]).includes(key)) ||
            (!entry && !allowed.includes(key))
          )
            problem(attr, 'ATTRIBUTE_NOT_ALLOWED', `Unsupported attribute: ${key}`);
          if (attr.value && typeof attr.value === 'object') {
            const value = attr.value as Ast;
            const program = value.data?.estree?.body;
            if (!(program?.length === 1 && literal(program[0].expression)))
              problem(attr, 'PROP_EXPRESSION_NOT_ALLOWED', 'Component properties must be literals');
            // URL props must be strings, so expressions cannot bypass URL validation.
            if (['href', 'src'].includes(key))
              problem(attr, 'URL_EXPRESSION_NOT_ALLOWED', 'URL attributes must use quoted strings');
          }
          const value = attributeValue(attr);
          if (entry || htmlElements.has(name ?? '')) {
            const booleans = [
              'external',
              'persist',
              'updateAnchor',
              'collapsible',
              'defaultOpen',
              'open',
            ];
            const numbers = ['defaultIndex', 'width', 'height', 'start', 'colSpan', 'rowSpan'];
            const valid =
              key === 'items'
                ? Array.isArray(value) &&
                  value.length > 0 &&
                  value.every((item) => typeof item === 'string' && item.length > 0)
                : key === 'aria-hidden'
                  ? typeof value === 'boolean' || value === 'true' || value === 'false'
                  : !entry && numbers.includes(key)
                    ? typeof value === 'string' ||
                      (typeof value === 'number' && Number.isSafeInteger(value))
                    : booleans.includes(key)
                      ? typeof value === 'boolean'
                      : numbers.includes(key)
                        ? typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
                        : key === 'icon'
                          ? value === false || value === null || typeof value === 'string'
                          : typeof value === 'string';
            if (!valid) problem(attr, 'INVALID_PROP_TYPE', `Invalid value for ${key}`);
          }
          if (['href', 'src'].includes(key) && typeof attr.value === 'string') {
            if (!safeUrl(attr.value)) problem(attr, 'UNSAFE_URL', 'URL protocol is not allowed');
            links.push(attr.value);
          }
        }
        if (name === 'Tabs') {
          const items =
            Array.isArray(values.items) &&
            values.items.every((item: unknown) => typeof item === 'string')
              ? (values.items as string[])
              : [];
          const index = values.defaultIndex ?? 0;
          if (!items.length || typeof index !== 'number' || index < 0 || index >= items.length)
            problem(
              node,
              'INVALID_TABS',
              'Tabs require nonempty string items and a valid defaultIndex'
            );
          if (
            new Set(items.map((item) => item.toLowerCase().replace(/\s/, '-'))).size !==
            items.length
          )
            problem(node, 'DUPLICATE_TAB', 'Tabs items must have unique normalized values');
          context = { ...context, tabs: { items, next: 0 } };
        }
        if (name === 'Tab') {
          const tabs = context.tabs;
          const value = values.value ?? tabs?.items[tabs.next++];
          if (!tabs || typeof value !== 'string' || !tabs.items.includes(value))
            problem(
              node,
              'INVALID_TAB_CONTEXT',
              'Tab must belong to Tabs and use a listed item value'
            );
        }
        if (name === 'Accordions') {
          if (values.type !== undefined && !['single', 'multiple'].includes(String(values.type)))
            problem(node, 'INVALID_ACCORDIONS', 'Use single or multiple');
          context = { ...context, accordion: true };
        }
        if (name === 'Accordion' && !context.accordion)
          problem(node, 'INVALID_ACCORDION_CONTEXT', 'Accordion must belong to Accordions');
      }
      if (node.url) {
        if (!safeUrl(node.url)) problem(node, 'UNSAFE_URL', 'URL protocol is not allowed');
        links.push(node.url);
      }
      if (node.type === 'text' && typeof node.value === 'string') text.push(node.value);
      for (const child of node.children ?? []) walk(child, depth + 1, context);
    }
    walk(tree);
  } catch (error) {
    diagnostics.push({
      code: 'INVALID_MDX',
      message: error instanceof Error ? error.message : 'Invalid MDX',
      line: 1,
      column: 1,
    });
  }
  return {
    diagnostics,
    links,
    assets: [
      ...new Set(
        links.flatMap((url) => url.match(/\/api\/v1\/assets\/([a-f0-9-]{36})(?:$|[?#])/)?.[1] ?? [])
      ),
    ],
    text: text.join(' '),
  };
}
