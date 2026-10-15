import { zipSync } from 'fflate';
import { exportFiles } from './file-export';
import { z } from 'zod';
import { config, basePath } from './config';
import { DomainError, requireValue } from './errors';
import { getStore, type Store } from './store';
import { saveSchema, mutationSchema } from './model';
import { componentRegistry } from '../content/registry';
import { inspectMdx } from '../content/validate';
import { compileDocument } from '../content/compiler';
const json = (data: unknown, status = 200, headers?: HeadersInit) =>
  Response.json(data, { status, headers: { 'Cache-Control': 'no-store', ...headers } });
function token(request: Request) {
  return request.headers
    .get('cookie')
    ?.split(';')
    .map((s) => s.trim())
    .find((s) => s.startsWith('dsdocs_session='))
    ?.slice(15);
}
async function readJson(request: Request, limit = 512 * 1024) {
  if (!request.headers.get('content-type')?.startsWith('application/json'))
    throw new DomainError(415, 'JSON_REQUIRED', 'Use application/json');
  const reader = request.body?.getReader();
  if (!reader) throw new DomainError(400, 'INVALID_BODY', 'JSON body required');
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    bytes += value.length;
    if (bytes > limit) {
      await reader.cancel();
      throw new DomainError(413, 'BODY_TOO_LARGE', 'Request body too large');
    }
    chunks.push(value);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString());
  } catch {
    throw new DomainError(400, 'INVALID_JSON', 'Invalid JSON');
  }
}
const cookie = (value: string, secure: boolean, age = config.sessionSeconds) =>
  `dsdocs_session=${value}; Path=${basePath || '/'}; HttpOnly; SameSite=Strict; Max-Age=${age}${secure ? '; Secure' : ''}`;
export async function handleApi(
  request: Request,
  segments: string[],
  store: Store = getStore()
): Promise<Response> {
  try {
    const url = new URL(request.url),
      route = segments.join('/'),
      method = request.method;
    const session = store.session(token(request));
    const write = !['GET', 'HEAD', 'OPTIONS'].includes(method);
    if (write && request.headers.get('origin') !== new URL(config.origin).origin)
      throw new DomainError(403, 'ORIGIN_REJECTED', 'Request origin rejected');
    if (route === 'session' && method === 'GET') return json(session ?? { user: null });
    if (route === 'login' && method === 'POST') {
      const input = z
        .object({ username: z.string().min(1).max(80), password: z.string().min(1).max(256) })
        .strict()
        .parse(await readJson(request));
      const result = store.login(input.username, input.password);
      return json({ user: result.user, csrf: result.csrf }, 200, {
        'Set-Cookie': cookie(result.token, new URL(config.origin).protocol === 'https:'),
      });
    }
    const assetId = route.match(/^assets\/([a-f0-9-]{36})$/)?.[1];
    if (assetId && method === 'GET') {
      const asset = store.asset(assetId, session?.user);
      const mime = String(asset.mime);
      return new Response(Buffer.from(asset.bytes as Uint8Array), {
        headers: {
          'Content-Type': mime,
          'Cache-Control': 'private, no-store',
          'X-Content-Type-Options': 'nosniff',
          'Content-Security-Policy': "default-src 'none'; sandbox",
          'Content-Disposition': `${mime === 'application/pdf' ? 'attachment' : 'inline'}; filename*=UTF-8''${encodeURIComponent(String(asset.name)).replace(/['()*]/g, (char) => '%' + char.charCodeAt(0).toString(16).toUpperCase())}`,
        },
      });
    }
    if (route === 'search' && method === 'GET') {
      const locale = z.enum(['zh', 'en']).parse(url.searchParams.get('locale') ?? 'zh'),
        q = (url.searchParams.get('query') ?? '').slice(0, 200).toLowerCase();
      if (!q) return json([]);
      const docs = store
        .published(locale)
        .filter((doc) =>
          [doc.title, doc.description, inspectMdx(doc.mdx).text].some((text) =>
            text.toLowerCase().includes(q)
          )
        )
        .slice(0, 30);
      return json(
        docs.map((doc) => ({
          id: doc.id,
          type: 'page',
          content: doc.title,
          url: `/${doc.locale}/${doc.path}`,
        }))
      );
    }
    const user = requireValue(session?.user, 401, 'LOGIN_REQUIRED');
    if (write && request.headers.get('x-csrf-token') !== session!.csrf)
      throw new DomainError(403, 'CSRF_REJECTED', 'Refresh your session before submitting');
    if (route === 'logout' && method === 'POST') {
      store.logout(token(request)!);
      return json({ ok: true }, 200, {
        'Set-Cookie': cookie('', new URL(config.origin).protocol === 'https:', 0),
      });
    }
    if (route === 'components' && method === 'GET') return json(componentRegistry);
    if (route === 'documents' && method === 'GET')
      return json(
        store.list(user, {
          page: z.coerce
            .number()
            .int()
            .min(1)
            .max(1000000)
            .parse(url.searchParams.get('page') ?? 1),
          limit: z.coerce
            .number()
            .int()
            .min(1)
            .max(100)
            .parse(url.searchParams.get('limit') ?? 10),
          keyword: (url.searchParams.get('keyword') ?? '').slice(0, 200),
        })
      );
    if (route === 'documents' && method === 'POST') {
      const input = saveSchema.parse(await readJson(request));
      return json(
        store.save(user, undefined, input.document, input.expectedRevision, input.operationId),
        201
      );
    }
    const match = route.match(
      /^documents\/([a-f0-9-]{36})(?:\/(publish|unpublish|revisions|restore|translations))?$/
    );
    if (match) {
      const [, id, action] = match;
      if (!action && method === 'GET') return json(store.get(id, user));
      if (!action && method === 'PUT') {
        const input = saveSchema.parse(await readJson(request));
        return json(
          store.save(user, id, input.document, input.expectedRevision, input.operationId)
        );
      }
      if (!action && method === 'DELETE') {
        const input = mutationSchema.parse(await readJson(request));
        return json(store.remove(user, id, input.expectedRevision, input.operationId));
      }
      if (action === 'translations' && method === 'GET') return json(store.translations(user, id));
      if (action === 'revisions' && method === 'GET') return json(store.history(user, id));
      if (action === 'restore' && method === 'POST') {
        const input = mutationSchema
          .extend({ revision: z.number().int().positive() })
          .parse(await readJson(request));
        return json(
          store.restore(user, id, input.revision, input.expectedRevision, input.operationId)
        );
      }
      if (action === 'publish' && method === 'POST') {
        const input = mutationSchema.parse(await readJson(request));
        const replay = store.replayPublish(user, id, input.expectedRevision, input.operationId);
        if (replay) return json(replay.response);
        const doc = store.get(id, user);
        if (doc.revision !== input.expectedRevision)
          throw new DomainError(409, 'REVISION_CONFLICT', 'Document changed');
        await compileDocument(doc.draft.mdx);
        return json(store.publish(user, id, input.expectedRevision, input.operationId));
      }
      if (action === 'unpublish' && method === 'POST') {
        const input = mutationSchema.parse(await readJson(request));
        return json(store.unpublish(user, id, input.expectedRevision, input.operationId));
      }
    }
    if (route === 'preview' && method === 'POST') {
      const input = z
        .object({ source: z.string().max(config.maxSourceBytes), title: z.string().max(200) })
        .strict()
        .parse(await readJson(request));
      await compileDocument(input.source);
      return json(store.preview(user, input.source, input.title));
    }
    if (route === 'validate' && method === 'POST') {
      store.authorize(user, 'read');
      const input = z
        .object({ source: z.string().max(config.maxSourceBytes) })
        .strict()
        .parse(await readJson(request));
      const result = inspectMdx(input.source);
      if (!result.diagnostics.length) await compileDocument(input.source);
      return json(result);
    }
    if (route === 'users' && method === 'GET') return json(store.users(user));
    if (route === 'users' && method === 'POST')
      return json(store.createUser(user, await readJson(request)), 201);
    const userId = route.match(/^users\/([a-f0-9-]{36})$/)?.[1];
    if (userId && method === 'PATCH')
      return json(store.updateUser(user, userId, await readJson(request)));
    if (route === 'audit' && method === 'GET') return json(store.auditLog(user));
    if (route === 'export/files' && method === 'GET')
      return new Response(Buffer.from(zipSync(exportFiles(store, user))), {
        headers: {
          'Content-Type': 'application/zip',
          'Cache-Control': 'no-store',
          'Content-Disposition': 'attachment; filename="dsdocs-files.zip"',
        },
      });
    if (route === 'export' && method === 'GET')
      return json(store.export(user), 200, {
        'Content-Disposition': 'attachment; filename="dsdocs-export.json"',
      });
    if (route === 'assets' && method === 'GET') return json(store.assets(user));
    if (route === 'assets' && method === 'POST') {
      store.authorize(user, 'edit');
      const input = z
        .object({
          name: z.string().min(1).max(200),
          mime: z.string().max(100),
          data: z
            .string()
            .max(7 * 1024 * 1024)
            .regex(/^[A-Za-z0-9+/]*={0,2}$/),
        })
        .strict()
        .parse(await readJson(request, 7 * 1024 * 1024 + 1024));
      return json(
        store.upload(user, input.name, input.mime, Buffer.from(input.data, 'base64')),
        201
      );
    }
    if (assetId && method === 'DELETE') return json(store.deleteAsset(user, assetId));
    throw new DomainError(404, 'NOT_FOUND', 'Endpoint not found');
  } catch (error) {
    if (error instanceof DomainError)
      return json(
        { code: error.code, message: error.message, details: error.details },
        error.status
      );
    if (error instanceof z.ZodError)
      return json(
        {
          code: 'VALIDATION_ERROR',
          message: 'Invalid input',
          details: error.issues.map((issue) => ({ path: issue.path, message: issue.message })),
        },
        422
      );
    // Never log source, cookies, credentials or raw database exceptions.
    console.error(
      '[dsdocs] Request failed',
      error instanceof Error ? error.constructor.name : 'UnknownError'
    );
    return json({ code: 'INTERNAL_ERROR', message: 'Request failed' }, 500);
  }
}
