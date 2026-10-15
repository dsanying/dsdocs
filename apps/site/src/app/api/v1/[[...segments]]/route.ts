import { handleApi } from '@/core/http';
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
async function handle(request: Request, { params }: { params: Promise<{ segments?: string[] }> }) {
  return handleApi(request, (await params).segments ?? []);
}
export { handle as GET, handle as POST, handle as PUT, handle as PATCH, handle as DELETE };
