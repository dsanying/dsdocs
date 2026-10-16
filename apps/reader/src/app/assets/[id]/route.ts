import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { openContent, dataDirectory } from '../../../../../../packages/content/store.mjs';
import { settingsAssetIds } from '../../../../../../packages/content/settings.mjs';
export const dynamic = 'force-dynamic';
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[a-f0-9-]{36}$/.test(id)) return new Response('Not found', { status: 404 });
  const store = openContent(dataDirectory(), true);
  try {
    const item = store.db.prepare('SELECT * FROM assets WHERE id=?').get(id);
    if (
      !item ||
      (!settingsAssetIds(store.settings().data).includes(id) &&
        !store.published().some((x) => x.body.includes(`/docs/assets/${id}`)))
    )
      return new Response('Not found', { status: 404 });
    return new Response(await readFile(path.join(dataDirectory(), 'assets', id)), {
      headers: {
        'Content-Type': String(item.mime),
        'Content-Disposition': `${String(item.mime).startsWith('image/') ? 'inline' : 'attachment'}; filename*=UTF-8''${encodeURIComponent(String(item.name))}`,
        'Cache-Control': 'no-store',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } finally {
    store.close();
  }
}
