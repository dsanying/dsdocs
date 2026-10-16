import '../../../../packages/content/prose.css';
import './globals.css';
import { readPublished } from '@/lib/source';
export const dynamic = 'force-dynamic';
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
export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh" suppressHydrationWarning>
      <body>{children}</body>
    </html>
  );
}
