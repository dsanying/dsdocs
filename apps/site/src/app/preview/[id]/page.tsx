import { cookies } from 'next/headers';
import { notFound } from 'next/navigation';
import { RootProvider } from 'fumadocs-ui/provider/next';
import { DocsBody } from 'fumadocs-ui/layouts/docs/page';
import { getStore } from '@/core/store';
import { compileDocument } from '@/content/compiler';
import { DocumentationLink, DocumentationImage } from '@/content/provider';
import { components } from '@/content/components';
export const dynamic = 'force-dynamic';
export const metadata = { robots: { index: false, follow: false } };
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const store = getStore(),
    session = store.session((await cookies()).get('dsdocs_session')?.value);
  if (!session) notFound();
  let preview;
  try {
    preview = store.readPreview(session.user, (await params).id);
  } catch {
    notFound();
  }
  const { body: Body } = await compileDocument(String(preview.source));
  return (
    <RootProvider
      components={{ Link: DocumentationLink, Image: DocumentationImage }}
      search={{ enabled: false }}
    >
      <main className="mx-auto max-w-4xl p-8">
        <h1 className="mb-8 text-3xl font-semibold">{String(preview.title)}</h1>
        <DocsBody>
          <Body components={components} />
        </DocsBody>
      </main>
    </RootProvider>
  );
}
