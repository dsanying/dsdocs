import { notFound } from 'next/navigation';
export const dynamic = 'force-dynamic';
export default async function Layout({
  params,
  children,
}: {
  params: Promise<{ lang: string }>;
  children: React.ReactNode;
}) {
  if (!['zh', 'en'].includes((await params).lang)) notFound();
  return children;
}
