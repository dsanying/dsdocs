import { readPublished } from '@/lib/source';
export function generateMetadata() {
  const { settings } = readPublished();
  return {
    title: settings.siteName,
    description: settings.description,
    icons: settings.faviconAssetId
      ? { icon: `/docs/assets/${settings.faviconAssetId}` }
      : { icon: '/docs/icon.svg' },
  };
}
