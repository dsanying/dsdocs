import { flexsearchI18n } from 'fumadocs-core/search/flexsearch';
import { readPublished, pageUrl, base } from '@/lib/source';
export const dynamic = 'force-dynamic';
let previous = '',
  api: ReturnType<typeof flexsearchI18n> | undefined;
export async function GET(request: Request) {
  const data = readPublished(),
    key = JSON.stringify(data);
  if (!data.settings.searchEnabled) return new Response('Not found', { status: 404 });
  if (key !== previous || !api) {
    api = flexsearchI18n({
      i18n: { languages: ['zh', 'en'], defaultLanguage: 'zh' },
      localeMap: { zh: 'cjk' },
      indexes: data.documents.map((doc) => ({
        id: doc.id,
        title: doc.title,
        description: doc.description,
        locale: doc.locale,
        url: base + pageUrl(doc),
        structuredData: { headings: [], contents: [{ heading: undefined, content: doc.body }] },
      })),
    });
    previous = key;
  }
  return api.GET(request);
}
