export type User = { id: string; username: string; role: 'admin'; disabled?: number };
export type Content = {
  title: string;
  description: string;
  path: string;
  locale: 'zh' | 'en';
  version: 'latest';
  translationKey: string;
  group: string;
  order: number;
  mdx: string;
};
export type Revision = Content & { number: number; actor: string; createdAt: string };
export type Document = {
  id: string;
  revision: number;
  publishedRevision: number | null;
  deleted: boolean;
  draft: Revision;
  published: Revision | null;
};
export type Diagnostic = { code: string; message: string; line: number; column: number };
export type Asset = {
  id: string;
  name: string;
  mime: string;
  size: number;
  createdAt: string;
  url?: string;
};
export const publicBase = import.meta.env.BASE_URL.replace(/\/admin\/$/, '');
let csrf = '';
export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public details?: unknown
  ) {
    super(message);
  }
}
export async function api<T>(
  route: string,
  method = 'GET',
  data?: unknown,
  signal?: AbortSignal
): Promise<T> {
  const response = await fetch(`${publicBase}/api/v1/${route}`, {
    method,
    credentials: 'same-origin',
    signal,
    headers: {
      'Content-Type': 'application/json',
      ...(method === 'GET' ? {} : { 'X-CSRF-Token': csrf }),
    },
    ...(data === undefined ? {} : { body: JSON.stringify(data) }),
  });
  if (response.status === 401 && route !== 'login')
    window.dispatchEvent(new Event('dsdocs-session-expired'));
  const body = await response.json();
  if (!response.ok)
    throw new ApiError(
      response.status,
      response.status < 500 ? body.message : 'Request failed',
      body.details
    );
  return body as T;
}
export async function session(signal?: AbortSignal) {
  const result = await api<{ user: User | null; csrf?: string }>(
    'session',
    'GET',
    undefined,
    signal
  );
  signal?.throwIfAborted();
  csrf = result.csrf ?? '';
  return result.user;
}
export async function login(username: string, password: string) {
  const result = await api<{ user: User; csrf: string }>('login', 'POST', { username, password });
  csrf = result.csrf;
  return result.user;
}
export async function upload(file: File) {
  const bytes = new Uint8Array(await file.arrayBuffer());
  let data = '';
  for (const byte of bytes) data += String.fromCharCode(byte);
  return api<Asset & { url: string }>('assets', 'POST', {
    name: file.name,
    mime: file.type,
    data: btoa(data),
  });
}
export async function downloadFiles() {
  const response = await fetch(`${publicBase}/api/v1/export/files`, { credentials: 'same-origin' });
  if (!response.ok) throw new ApiError(response.status, 'Export failed');
  const url = URL.createObjectURL(await response.blob()),
    link = document.createElement('a');
  link.href = url;
  link.download = 'dsdocs-files.zip';
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}
export function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}
