import i18n from '@/i18n';
import { RequestError } from '@/utils/request';
import { extractRequestErrorMessage } from '@/utils/requestError';

/** DSdocs 返回原始 JSON；不使用共享 request 的响应信封解包。 */
async function decode(response: Response) {
  let result;
  try {
    result = await response.json();
  } catch (cause) {
    if (response.ok)
      throw new RequestError(i18n.t('common.request.failed'), { status: response.status, cause });
  }
  if (!response.ok) {
    if (
      response.status === 401 &&
      !location.pathname.startsWith('/login') &&
      !response.url.includes('/__dsdocs_auth/')
    )
      location.assign('/login');
    const data = {
      message: result && typeof result === 'object' ? (result.error ?? result.message) : undefined,
    };
    const error = new RequestError(i18n.t('common.request.failed'), {
      status: response.status,
      data,
    });
    throw new RequestError(extractRequestErrorMessage(error, i18n.t('common.request.failed')), {
      status: response.status,
      data,
    });
  }
  return result;
}
export async function request(path: string, method = 'GET', data?: unknown) {
  try {
    return await decode(
      await fetch(path, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: data === undefined ? undefined : JSON.stringify(data),
      })
    );
  } catch (error) {
    if (error instanceof RequestError) throw error;
    throw new RequestError(i18n.t('common.request.noResponse'), { cause: error });
  }
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
export type Folder = {
  version: string;
  id: string;
  title: string;
  titleEn: string;
  parent: string | null;
};
export type Account = {
  id: string;
  username: string;
  role: 'admin' | 'superadmin';
  needsSetup?: boolean;
};

export async function upload(file: File) {
  try {
    return await decode(
      await fetch('/__dsdocs_content/assets', {
        method: 'POST',
        headers: {
          'Content-Type': file.type || 'application/octet-stream',
          'x-filename': encodeURIComponent(file.name),
        },
        body: file,
      })
    );
  } catch (error) {
    if (error instanceof RequestError) throw error;
    throw new RequestError(i18n.t('common.request.noResponse'), { cause: error });
  }
}
