import { readFile } from 'node:fs/promises';
import path from 'node:path';
export const dynamic = 'force-dynamic';
export async function GET() {
  try {
    const html = await readFile(path.resolve('public/admin/index.html'), 'utf8');
    return new Response(html, {
      headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' },
    });
  } catch {
    return new Response('Build the administration application first.', { status: 503 });
  }
}
