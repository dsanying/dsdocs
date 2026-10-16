import { defaultSettings, type SiteSettings } from '../../../../packages/content/settings.mjs';
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { openContent, dataDirectory } from '../../../../packages/content/store.mjs';
import type { Root, Node } from 'fumadocs-core/page-tree';
export type PublishedDocument = {
  id: string;
  translationId: string;
  locale: string;
  slug: string;
  title: string;
  description: string;
  body: string;
  updatedAt: string;
  folder: string | null;
};
export const base = process.env.NEXT_PUBLIC_DSDOCS_BASE_PATH ?? '/docs';
export function readPublished(): {
  settings: SiteSettings;
  revision: string;
  documents: PublishedDocument[];
  folders: { id: string; title: string; titleEn: string; parent: string | null }[];
} {
  if (!existsSync(path.join(dataDirectory(), 'content.sqlite')))
    return {
      documents: [],
      folders: [],
      revision: 'empty',
      settings: structuredClone(defaultSettings),
    };
  const store = openContent(dataDirectory(), true);
  try {
    store.db.exec('BEGIN');
    const result = {
      settings: store.settings().data,
      revision: createHash('sha256').update(store.revision()).digest('hex'),
      documents: store.published(),
      folders: store.folders() as {
        id: string;
        title: string;
        titleEn: string;
        parent: string | null;
      }[],
    };
    store.db.exec('COMMIT');
    return result;
  } finally {
    store.close();
  }
}
export const pageUrl = (page: PublishedDocument) => `/${page.locale}/${page.slug}`;
export function pageTree(locale: string, data = readPublished()): Root {
  const docs = data.documents.filter((x) => x.locale === locale);
  const page = (d: PublishedDocument): Node => ({ type: 'page', name: d.title, url: pageUrl(d) });
  const folders = (parent: string | null): Node[] =>
    data.folders
      .filter((x) => x.parent === parent)
      .map((folder) => ({
        type: 'folder' as const,
        name: locale === 'zh' ? folder.title : folder.titleEn,
        children: [...folders(folder.id), ...docs.filter((x) => x.folder === folder.id).map(page)],
      }))
      .filter((x) => x.children.length > 0);
  return {
    name: data.settings.siteName,
    children: [...folders(null), ...docs.filter((x) => !x.folder).map(page)],
  };
}

export function publishedRevision(data: ReturnType<typeof readPublished>) {
  return data.revision;
}
export function readPublishedRevision() {
  if (!existsSync(path.join(dataDirectory(), 'content.sqlite'))) return 'empty';
  const store = openContent(dataDirectory(), true);
  try {
    store.db.exec('BEGIN');
    const revision = createHash('sha256').update(store.revision()).digest('hex');
    store.db.exec('COMMIT');
    return revision;
  } finally {
    store.close();
  }
}
