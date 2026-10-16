import { notFound } from 'next/navigation';
import { DocsLayout } from 'fumadocs-ui/layouts/docs';
import { DocsPage, DocsTitle, DocsDescription, DocsBody } from 'fumadocs-ui/layouts/docs/page';
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
  const identity = page?.slugs.join('/');
  const translations = Object.fromEntries(
    pages()
      .filter((entry) => identity !== undefined && entry.slugs.join('/') === identity)
      .map((entry) => [entry.locale, entry.url])
  );
  const Body = page?.data.body;
  return (
    <DocumentationProvider locale={lang} translations={translations}>
      <DocsLayout tree={source.getPageTree(lang)} tabs={false} nav={{ title: 'DSdocs', url: '/' }}>
        <DocsPage toc={page?.data.toc}>
          <DocsTitle>{page?.data.title ?? (lang === 'zh' ? '暂无文档' : 'No documents')}</DocsTitle>
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
