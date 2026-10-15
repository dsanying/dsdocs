import { notFound, redirect } from 'next/navigation';
import { DocsLayout } from 'fumadocs-ui/layouts/docs';
import { DocsPage, DocsTitle, DocsDescription, DocsBody } from 'fumadocs-ui/layouts/docs/page';
import { getStore } from '@/core/store';
import { config } from '@/core/config';
import { compileDocument } from '@/content/compiler';
import { components } from '@/content/components';
import { pageTree } from '@/content/tree';
import { DocumentationProvider } from '@/content/provider';
export const dynamic = 'force-dynamic';
export default async function Page({
  params,
}: {
  params: Promise<{ lang: string; slug?: string[] }>;
}) {
  const { lang, slug } = await params;
  if (!['zh', 'en'].includes(lang)) notFound();
  const store = getStore(),
    all = store.published(),
    documents = all.filter((doc) => doc.locale === lang),
    route = slug?.join('/');
  if (!route && documents[0]) redirect(`/${lang}/${documents[0].path}`);
  const page = route ? store.publicPage(lang, route) : undefined;
  if (route && !page) notFound();
  const translations = Object.fromEntries(
    all
      .filter((doc) => page && doc.translationKey === page.translationKey)
      .map((doc) => [doc.locale, `/${doc.locale}/${doc.path}`])
  );
  const compiled = page ? await compileDocument(page.mdx) : undefined,
    Body = compiled?.body;
  const siblings = page ? documents.filter((doc) => doc.group === page.group) : [],
    position = siblings.findIndex((doc) => doc.id === page?.id);
  const item = (doc: (typeof documents)[number] | undefined) =>
    doc ? { name: doc.title, url: `/${doc.locale}/${doc.path}` } : undefined;
  return (
    <DocumentationProvider locale={lang} translations={translations}>
      <DocsLayout tree={pageTree(documents)} tabs={false} nav={{ title: config.title, url: '/' }}>
        <DocsPage
          toc={compiled?.toc}
          footer={{
            items: { previous: item(siblings[position - 1]), next: item(siblings[position + 1]) },
          }}
        >
          <DocsTitle>
            {page?.title ?? (lang === 'zh' ? '暂无已发布文档' : 'No published documents')}
          </DocsTitle>
          <DocsDescription>{page?.description}</DocsDescription>
          <DocsBody>
            {Body ? (
              <Body components={components} />
            ) : (
              <p>
                {lang === 'zh'
                  ? '请在管理后台创建并发布文档。'
                  : 'Create and publish a document in the admin panel.'}
              </p>
            )}
          </DocsBody>
        </DocsPage>
      </DocsLayout>
    </DocumentationProvider>
  );
}
