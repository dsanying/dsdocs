import { PublishedRefresh } from '@/content/live';
import { notFound } from 'next/navigation';
import { DocsLayout } from 'fumadocs-ui/layouts/docs';
import { DocsPage, DocsTitle, DocsDescription, DocsBody } from 'fumadocs-ui/layouts/docs/page';
import { readPublished, pageTree, pageUrl, publishedRevision } from '@/lib/source';
import { DocumentBody, documentHeadings } from '@/content/components';
import { readerStyle } from '../../../../../../packages/content/settings.mjs';
import { DocumentationProvider, DocumentationFooter } from '@/content/provider';
export const dynamic = 'force-dynamic';
export default async function Page({
  params,
}: {
  params: Promise<{ lang: string; slug?: string[] }>;
}) {
  const { lang, slug } = await params;
  if (!['zh', 'en'].includes(lang)) notFound();
  const data = readPublished(),
    docs = data.documents.filter((x) => x.locale === lang),
    page = slug?.length
      ? docs.find((x) => x.slug === slug.join('/'))
      : (docs.find((x) => x.translationId === data.settings.homeTranslationId) ??
        docs.find((x) => x.slug === 'getting-started') ??
        docs[0]);
  if (slug?.length && !page) notFound();
  const translations = Object.fromEntries(
    data.documents
      .filter((x) => x.translationId === page?.translationId)
      .map((x) => [x.locale, pageUrl(x)])
  );
  return (
    <DocumentationProvider settings={data.settings} locale={lang} translations={translations}>
      <style>{readerStyle(data.settings)}</style>
      <PublishedRefresh revision={publishedRevision(data)} />
      <DocsLayout
        tree={pageTree(lang, data)}
        tabs={false}
        searchToggle={{ enabled: data.settings.searchEnabled }}
        nav={{
          title: (
            <>
              {data.settings.logoAssetId && (
                <img
                  src={`/docs/assets/${data.settings.logoAssetId}`}
                  alt=""
                  className="h-6 w-6 object-contain"
                />
              )}
              {data.settings.siteName}
            </>
          ),
          url: '/',
        }}
      >
        <DocsPage
          full={data.settings.contentWidth === 'wide'}
          tableOfContent={{ enabled: data.settings.showToc }}
          tableOfContentPopover={{ enabled: data.settings.showToc }}
          breadcrumb={{ enabled: data.settings.showBreadcrumb }}
          slots={{ footer: DocumentationFooter }}
          toc={page ? documentHeadings(page.body) : []}
        >
          <DocsTitle>
            {page?.title ?? (lang === 'zh' ? '暂无已发布文档' : 'No published documents')}
          </DocsTitle>
          <DocsDescription>{page?.description}</DocsDescription>
          <DocsBody className="document-prose">
            {page ? (
              <DocumentBody body={page.body} />
            ) : (
              <p>
                {lang === 'zh'
                  ? '发布第一篇文档后在此显示。'
                  : 'Publish your first document to get started.'}
              </p>
            )}
          </DocsBody>
        </DocsPage>
      </DocsLayout>
    </DocumentationProvider>
  );
}
