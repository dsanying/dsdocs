import { readPublishedRevision } from '@/lib/source';
export const dynamic = 'force-dynamic';
export function GET() {
  return Response.json(
    { revision: readPublishedRevision() },
    { headers: { 'Cache-Control': 'no-store' } }
  );
}
