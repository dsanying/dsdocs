import axios from 'axios';
import type { AxiosRequestConfig } from 'axios';
import i18n from '@/i18n';
import { extractRequestErrorMessage } from './requestError';

interface ResponseStructure<T = unknown> {
  success?: boolean;
  data: T;
  code: number;
  message?: string;
}

/**
 * 请求层不弹任何通知（FRONTEND-FEEDBACK）：失败统一以 RequestError 抛给调用方——
 * 读取失败由 useRequest/useDataTable 交给 QueryErrorAlert 常驻内联展示，
 * 写操作失败由动作处理函数 notifyActionFailed(action, error) 报告。
 */
export class RequestError extends Error {
  readonly status?: number;
  readonly code?: number;
  /** 后端结构化响应体；extractRequestErrorMessage 只在 4xx 时读取其中的 message，5xx 一律隐藏正文 */
  readonly data?: unknown;

  constructor(
    message: string,
    details: { status?: number; code?: number; data?: unknown; cause?: unknown } = {}
  ) {
    super(message, { cause: details.cause });
    this.name = 'RequestError';
    this.status = details.status;
    this.code = details.code;
    this.data = details.data;
  }
}

const axiosInstance = axios.create({
  baseURL: '/',
});

// 响应拦截器 — 网络/HTTP 层失败统一收敛为带可展示文案的 RequestError
axiosInstance.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response) {
      const body = error.response.data as Partial<ResponseStructure> | undefined;
      // HTTP 正文在进入 Error.message 前统一过滤，避免写操作或其他错误消费者泄露 5xx 原因。
      const message = extractRequestErrorMessage(error, i18n.t('common.request.failed'));
      return Promise.reject(
        new RequestError(message, {
          status: error.response.status,
          code: body?.code,
          data: body,
          cause: error,
        })
      );
    }
    if (error.request) {
      return Promise.reject(
        new RequestError(i18n.t('common.request.noResponse'), { cause: error })
      );
    }
    return Promise.reject(new RequestError(i18n.t('common.request.failed'), { cause: error }));
  }
);

/**
 * 带类型的请求封装 — 行为与原 UmiJS request 工具函数一致。
 * 对于 JSON 响应中的 { code, data, message } 结构，
 * 验证 code === 0 并解包 data 返回。
 */
export async function request<T>(url: string, options?: AxiosRequestConfig): Promise<T> {
  const axiosOpts = options ?? {};
  const res = await axiosInstance<ResponseStructure<T>>(url, axiosOpts);

  const contentType = (res.headers?.['content-type'] as string) ?? '';
  const isJson = contentType.includes('application/json');

  // 文件下载直接返回
  if (axiosOpts?.responseType === 'arraybuffer' || axiosOpts?.responseType === 'blob') {
    return res.data as unknown as T;
  }

  if (!isJson) {
    return res.data as unknown as T;
  }

  const body = res.data as ResponseStructure<T>;
  if (body.code !== 0) {
    throw new RequestError(body.message ?? i18n.t('common.requestFailed'), { code: body.code });
  }

  return body.data;
}

export default axiosInstance;
