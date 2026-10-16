export async function request(path: string, method = 'GET', data?: unknown) {
  const response = await fetch(path, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: data === undefined ? undefined : JSON.stringify(data),
  });
  const result = await response.json();
  if (!response.ok) {
    if (response.status === 401) location.assign('/login');
    throw new Error(result.error ?? '请求失败。');
  }
  return result;
}
export const content = (path = '', method = 'GET', data?: unknown) =>
  request(`/__dsdocs_content${path}`, method, data);
export type Doc = {
  id: string;
  translationId: string;
  locale: 'zh' | 'en';
  title: string;
  slug: string;
  description: string;
  folder: string | null;
  body: string;
  version: number;
  published: string | null;
  updatedAt: string;
};
export type Folder = { id: string; title: string; titleEn: string; parent: string | null };
export type Account = { id: string; username: string; role: 'admin' | 'superadmin' };
export async function upload(file: File) {
  const response = await fetch('/__dsdocs_content/assets', {
    method: 'POST',
    headers: {
      'Content-Type': file.type || 'application/octet-stream',
      'x-filename': encodeURIComponent(file.name),
    },
    body: file,
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error ?? '附件上传失败。');
  return result;
}
