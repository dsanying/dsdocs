import test from 'node:test';
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { inspectMdx, splitSource } from '../src/content/validate';
import { compileDocument } from '../src/content/compiler';
import { componentRegistry } from '../src/content/registry';
const samples: Record<keyof typeof componentRegistry, string> = {
  Callout: '<Callout title="Network" type="warn">Read this.</Callout>',
  Cards: '<Cards><Card title="Start" href="/docs/zh/start">Read</Card></Cards>',
  Card: '<Card title="Start" href="https://example.com">Read</Card>',
  Tabs: '<Tabs items={["Linux", "Windows"]}><Tab value="Linux">Linux</Tab><Tab value="Windows">Windows</Tab></Tabs>',
  Tab: '<Tabs items={["One"]}><Tab value="One">Value</Tab></Tabs>',
  Steps: '<Steps>\n\n<Step>\n\n### Install\n\nRun the installer.\n\n</Step>\n\n</Steps>',
  Step: '<Steps><Step>First step</Step></Steps>',
  Accordions:
    '<Accordions type="single" collapsible><Accordion title="Details" value="details">Content</Accordion></Accordions>',
  Accordion: '<Accordions><Accordion title="Details">Content</Accordion></Accordions>',
  Files: '<Files><Folder name="docs" defaultOpen><File name="index.mdx" /></Folder></Files>',
  Folder: '<Files><Folder name="docs"><File name="index.mdx" /></Folder></Files>',
  File: '<Files><File name="index.mdx" /></Files>',
};
for (const [name, source] of Object.entries(samples))
  test(`native ${name} validates and compiles`, async () => {
    assert.deepEqual(inspectMdx(source).diagnostics, []);
    const compiled = await compileDocument(source);
    assert.equal(typeof compiled.body, 'function');
  });
test('GFM, math, code metadata, frontmatter and headings share the native compiler', async () => {
  const source =
    '---\ntitle: Syntax\ncustom: value\n---\n## Heading\n\n| A | B |\n| - | - |\n| 1 | 2 |\n\n- [x] Task\n\n~~Deleted~~ and **strong** with $x^2$.\n\n```ts title="hello.ts" {1}\nconst hello = "world";\n```\n\nA footnote[^one].\n\n[^one]: Text.\n';
  assert.deepEqual(inspectMdx(source).diagnostics, []);
  const compiled = await compileDocument(source);
  assert.equal(compiled.toc[0].url, '#heading');
  assert.equal(splitSource(source).frontmatter.custom, 'value');
});
for (const source of [
  'import fs from "node:fs"\n\n# Hi',
  'export const stolen = process.env',
  '{process.env.SECRET}',
  '{(()=>{while(true){}})()}',
  '<script>alert(1)</script>',
  '<iframe src="https://example.com" />',
  '<img src="x" onError="alert(1)" />',
  '<div dangerouslySetInnerHTML={{__html:"bad"}}/>',
  '<Card {...globalThis} />',
  '<Callout icon={process.exit()}>Hi</Callout>',
  '<a href={"javascript:alert(1)"}>Hi</a>',
  '[unsafe](javascript:alert%281%29)',
  '<Unknown>Unsupported</Unknown>',
  '<div style={{color:"red"}}>No injected CSS</div>',
])
  test(`rejects executable or unregistered source ${source.slice(0, 30)}`, () =>
    assert.ok(inspectMdx(source).diagnostics.length));
test('frontmatter duplicate keys fail without executing YAML aliases', () => {
  assert.ok(inspectMdx('---\ntitle: A\ntitle: B\n---\nText').diagnostics.length);
  assert.ok(inspectMdx('---\na: &ref [1]\nb: *ref\n---\nText').diagnostics.length);
});
test('comments are accepted, malformed drafts return diagnostics', () => {
  assert.deepEqual(inspectMdx('{/* comment */}\n\nText').diagnostics, []);
  assert.ok(inspectMdx('<Tabs').diagnostics.length);
});

test('display math renders before the syntax highlighter', async () => {
  const source = '## Equation\n\n$$\n\\sum_{i=1}^{n} i = \\frac{n(n+1)}{2}\n$$';
  assert.deepEqual(inspectMdx(source).diagnostics, []);
  const result = await compileDocument(source);
  assert.match(result.compiled, /katex-display/);
});
for (const locale of ['zh', 'en'])
  for (const slug of ['getting-started', 'syntax'])
    test(`shipped example compiles ${locale}/${slug}`, async () => {
      const source = readFileSync(
        new URL(`../../../examples/content/${locale}/${slug}.mdx`, import.meta.url),
        'utf8'
      );
      const result = await compileDocument(source);
      assert.equal(typeof result.body, 'function');
    });

for (const source of [
  '{{broken:"object child"}}',
  '<Tabs items="one"><Tab value="one">Text</Tab></Tabs>',
  '<Tabs items={[]} />',
  '<Tabs items={["one"]} defaultIndex={2}/>',
  '<Tab value="one">Orphan</Tab>',
  '<Tabs items={["one"]}><Tab>One</Tab><Tab>Two</Tab></Tabs>',
  '<Callout title={{bad:"object"}}>Text</Callout>',
  '<Accordion title="Orphan">Text</Accordion>',
  '<Tabs items={["One","one"]}/>',
])
  test(`rejects native render failures ${source.slice(0, 45)}`, () =>
    assert.ok(inspectMdx(source).diagnostics.length));
test('implicit tab values, literal children and boolean props remain supported', () => {
  assert.deepEqual(
    inspectMdx(
      '<Tabs items={["one","two"]}><Tab>One</Tab><Tab>Two</Tab></Tabs>\n\n{["literal", 2, null]}\n\n<Folder name="docs" defaultOpen={false} />'
    ).diagnostics,
    []
  );
});

test('safe native HTML numeric strings and ARIA boolean attributes remain accepted', async () => {
  const source =
    '<img src="https://example.com/image.png" width="120" height={80} alt="Image" />\n\n<span aria-hidden={true}>Decoration</span>\n\n<ol start="-3"><li>Item</li></ol>';
  assert.deepEqual(inspectMdx(source).diagnostics, []);
  assert.equal(typeof (await compileDocument(source)).body, 'function');
});
