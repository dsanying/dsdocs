import { docs } from '../../.source/server';
import { loader } from 'fumadocs-core/source';
export const source = loader({
  baseUrl: '/',
  i18n: { languages: ['zh', 'en'], defaultLanguage: 'zh', parser: 'dir', fallbackLanguage: null },
  source: docs.toFumadocsSource(),
});
export function pages(locale?: string) {
  return source
    .getPages(locale)
    .sort(
      (a, b) =>
        a.data.order - b.data.order ||
        a.data.title.localeCompare(b.data.title, 'en', { numeric: true }) ||
        a.url.localeCompare(b.url)
    );
}
