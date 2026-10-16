import { LanguageEntry } from '@/content/provider';
import { readPublished } from '@/lib/source';
export const dynamic = 'force-dynamic';
export default function Page() {
  return <LanguageEntry settings={readPublished().settings} />;
}
