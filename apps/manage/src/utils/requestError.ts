type ErrorPayload = {
  message?: unknown;
};

type RequestErrorLike = ErrorPayload & {
  data?: unknown;
  info?: unknown;
  response?: {
    data?: unknown;
    status?: unknown;
  };
  status?: unknown;
  statusCode?: unknown;
};

const GENERIC_HTTP_ERROR_RE = /^(?:request failed with status code|response status:)\s*\d{3}$/i;
const HTML_LIKE_RE = /^<(?:!doctype|[a-z][\w:-]*\b)/i;

function pickMessage(payload: unknown, visited = new Set<object>()): string | undefined {
  if (!payload) {
    return undefined;
  }

  if (typeof payload === 'string') {
    const text = payload.trim();
    if (!text) {
      return undefined;
    }

    return text;
  }

  if (payload instanceof Error) {
    return pickMessage(payload.message);
  }

  if (typeof payload !== 'object') {
    return undefined;
  }

  if (visited.has(payload)) {
    return undefined;
  }
  visited.add(payload);

  const obj = payload as ErrorPayload;
  return pickMessage(obj.message, visited);
}

/** 识别共享 RequestError、Axios 和旧状态对象的有效 HTTP 状态，供各反馈入口复用。 */
export function getRequestErrorStatus(error: unknown): number | undefined {
  if (!error || typeof error !== 'object') {
    return undefined;
  }

  const err = error as RequestErrorLike;
  const candidates = [err.response?.status, err.status, err.statusCode];
  return candidates.find(
    (candidate): candidate is number =>
      typeof candidate === 'number' &&
      Number.isInteger(candidate) &&
      candidate >= 100 &&
      candidate <= 599
  );
}

function pickStructuredHttpMessage(payload: unknown): string | undefined {
  if (
    !payload ||
    typeof payload !== 'object' ||
    Array.isArray(payload) ||
    payload instanceof Error
  ) {
    return undefined;
  }

  const message = (payload as ErrorPayload).message;
  if (typeof message !== 'string') {
    return undefined;
  }

  const text = message.trim();
  return text && !HTML_LIKE_RE.test(text) ? text : undefined;
}

export function extractRequestErrorMessage(error: unknown, fallbackMessage: string): string {
  const status = getRequestErrorStatus(error);

  if (status !== undefined && status >= 500) {
    return `${fallbackMessage} (${status})`;
  }

  const err = error && typeof error === 'object' ? (error as RequestErrorLike) : undefined;
  const message =
    status !== undefined && status >= 400
      ? pickStructuredHttpMessage(err?.info) ||
        pickStructuredHttpMessage(err?.data) ||
        pickStructuredHttpMessage(err?.response?.data) ||
        // 经服务层过滤后的受控消息（如冲突原因映射）本身是展示契约，不能退回通用文案。
        pickMessage(error)
      : pickMessage(err?.info) ||
        pickMessage(err?.data) ||
        pickMessage(err?.response?.data) ||
        pickMessage(error);

  if (message && !(status !== undefined && GENERIC_HTTP_ERROR_RE.test(message))) {
    return message;
  }

  return status !== undefined ? `${fallbackMessage} (${status})` : fallbackMessage;
}
