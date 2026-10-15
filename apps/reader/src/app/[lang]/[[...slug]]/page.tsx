import { notFound } from 'next/navigation';
import { DocsLayout } from 'fumadocs-ui/layouts/docs';
import { DocsPage, DocsTitle, DocsDescription, DocsBody } from 'fumadocs-ui/layouts/docs/page';
import type { Node, Folder } from 'fumadocs-core/page-tree';
import { source, pages } from '@/lib/source';
import { components } from '@/content/components';
import { DocumentationProvider } from '@/content/provider';
export const dynamicParams = false;
export function generateStaticParams() {
  return ['zh', 'en'].flatMap((lang) => [
    { lang, slug: [] },
    ...pages(lang)
      .filter((page) => page.slugs.length > 0)
      .map((page) => ({ lang, slug: page.slugs })),
  ]);
}
export default async function Page({
  params,
}: {
  params: Promise<{ lang: string; slug?: string[] }>;
}) {
  const { lang, slug } = await params;
  if (!['zh', 'en'].includes(lang)) notFound();
  const documents = pages(lang),
    page = source.getPage(slug ?? [], lang) ?? (!slug?.length ? documents[0] : undefined);
  if (slug?.length && !page) notFound();
  const tree: Node[] = [];
  for (const entry of documents) {
    let level = tree;
    for (const name of entry.data.group.split('/').filter(Boolean)) {
      let folder = level.find((node) => node.type === 'folder' && node.name === name) as
        Folder | undefined;
      if (!folder) {
        folder = { type: 'folder', name, defaultOpen: true, children: [] };
        level.push(folder);
      }
      level = folder.children;
    }
    level.push({ type: 'page', name: entry.data.title, url: entry.url });
  }
  const identity = page?.data.translationKey ?? page?.slugs.join('/');
  const translations = Object.fromEntries(
    pages()
      .filter(
        (entry) =>
          identity !== undefined &&
          (entry.data.translationKey ?? entry.slugs.join('/')) === identity
      )
      .map((entry) => [entry.locale, entry.url])
  );
  const Body = page?.data.body;
  return (
    <DocumentationProvider locale={lang} translations={translations}>
      <DocsLayout
        tree={
          documents.some((entry) => entry.data.group)
            ? { name: 'dsdocs', children: tree }
            : source.getPageTree(lang)
        }
        tabs={false}
        nav={{ title: 'dsdocs', url: '/' }}
      >
        <DocsPage toc={page?.data.toc}>
          <DocsTitle>
            {page?.data.title ?? (lang === 'zh' ? '暂无已发布文档' : 'No published documents')}
          </DocsTitle>
          <DocsDescription>{page?.data.description}</DocsDescription>
          <DocsBody>
            {Body ? (
              <Body components={components} />
            ) : (
              <p>
                {lang === 'zh'
                  ? '请切换语言或添加文档文件。'
                  : 'Switch language or add document files.'}
              </p>
            )}
          </DocsBody>
        </DocsPage>
      </DocsLayout>
    </DocumentationProvider>
  );
}
