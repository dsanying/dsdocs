import '../../../../../packages/content/prose.css';
import '../globals.css';
export { generateMetadata } from '@/lib/metadata';
export const dynamic = 'force-dynamic';
import { notFound } from 'next/navigation';
export default async function Layout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ lang: string }>;
}) {
  const { lang } = await params;
  if (!['zh', 'en'].includes(lang)) notFound();
  return (
    <html lang={lang} suppressHydrationWarning>
      <body>{children}</body>
    </html>
  );
}
