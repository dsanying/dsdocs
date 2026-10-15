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
    ...pages(lang).map((page) => ({ lang, slug: page.slugs })),
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
    page = slug?.length ? source.getPage(slug, lang) : documents[0];
  if (!page) notFound();
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
  const translations = Object.fromEntries(
    pages()
      .filter((entry) => entry.data.translationKey === page.data.translationKey)
      .map((entry) => [entry.locale, entry.url])
  );
  const Body = page.data.body;
  return (
    <DocumentationProvider locale={lang} translations={translations}>
      <DocsLayout
        tree={{ name: 'dsdocs', children: tree }}
        tabs={false}
        nav={{ title: 'dsdocs', url: '/' }}
      >
        <DocsPage toc={page.data.toc}>
          <DocsTitle>{page.data.title}</DocsTitle>
          <DocsDescription>{page.data.description}</DocsDescription>
          <DocsBody>
            <Body components={components} />
          </DocsBody>
        </DocsPage>
      </DocsLayout>
    </DocumentationProvider>
  );
}
