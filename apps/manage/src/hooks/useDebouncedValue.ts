import { useEffect, useState } from 'react';

/** 返回延迟 `delayMs` 后才跟随变化的值，用于把输入类依赖收敛为请求依赖。 */
export function useDebouncedValue<T>(value: T, delayMs = 300): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(value), delayMs);
    return () => window.clearTimeout(timer);
  }, [delayMs, value]);
  return debounced;
}
