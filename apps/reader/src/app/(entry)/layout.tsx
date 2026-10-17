import '../../../../../packages/content/prose.css';
import '../globals.css';
export { generateMetadata } from '@/lib/metadata';
export const dynamic = 'force-dynamic';
import { headers } from 'next/headers';
import { readPublished } from '@/lib/source';
export default async function Layout({ children }: { children: React.ReactNode }) {
  const preference = readPublished().settings.defaultLanguage;
  const language =
    preference === 'auto'
      ? (await headers()).get('accept-language')?.toLowerCase().startsWith('zh')
        ? 'zh'
        : 'en'
      : preference;
  return (
    <html lang={language} suppressHydrationWarning>
      <body>{children}</body>
    </html>
  );
}
