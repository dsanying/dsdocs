import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Umi 的 useRequest 在 vite 这边的极简替代。
 *
 * 只覆盖项目里实际用到的能力：
 * - 自动发起一次请求
 * - refreshDeps 变化时重新请求
 * - data / loading / error / run（手动重发）
 * - 卸载及依赖快速变化时仅最后一次请求可写入
 * - 可在实体标识变化时清空旧实体，手动刷新仍保留当前内容
 *
 * 不实现：跨页面缓存、轮询、debounce/throttle、ready、formatResult。
 * 这些功能用到了再说，不要预先抽象。
 */
export interface UseRequestOptions {
  manual?: boolean;
  refreshDeps?: React.DependencyList;
  resetDataOnRefreshDepsChange?: boolean;
}

export interface UseRequestResult<T> {
  data: T | undefined;
  loading: boolean;
  error: Error | undefined;
  run: () => Promise<T | undefined>;
}

function areDependenciesEqual(previous: React.DependencyList, next: React.DependencyList): boolean {
  return (
    previous.length === next.length &&
    previous.every((dependency, index) => Object.is(dependency, next[index]))
  );
}

export function useRequest<T>(
  service: () => Promise<T>,
  options?: UseRequestOptions
): UseRequestResult<T> {
  const manual = options?.manual ?? false;
  const refreshDeps = options?.refreshDeps ?? [];
  const resetDataOnRefreshDepsChange = options?.resetDataOnRefreshDepsChange ?? false;
  const [data, setData] = useState<T | undefined>(undefined);
  const [loading, setLoading] = useState<boolean>(!manual);
  const [error, setError] = useState<Error | undefined>(undefined);

  // 用 ref 锁住最新的 service 闭包，保证自动请求 effect 只看 refreshDeps。
  // 在 effect 内同步而不是 render 阶段写 ref，遵守 React Compiler 的 ref 约束；
  // 该 effect 先于下方的自动请求 effect 声明，因此同一次提交内 run 读到的已是最新闭包。
  const serviceRef = useRef(service);
  useEffect(() => {
    serviceRef.current = service;
  });

  // 只允许最后一次请求写入状态，避免筛选条件快速变化时旧响应覆盖新数据。
  const requestIdRef = useRef(0);
  const mountedRef = useRef(false);
  const autoRequestStateRef = useRef<
    | {
        manual: boolean;
        refreshDeps: React.DependencyList;
      }
    | undefined
  >(undefined);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const run = useCallback(async (): Promise<T | undefined> => {
    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;
    setLoading(true);
    setError(undefined);
    try {
      const result = await serviceRef.current();
      if (mountedRef.current && requestId === requestIdRef.current) {
        setData(result);
      }
      return result;
    } catch (e) {
      if (mountedRef.current && requestId === requestIdRef.current) {
        setError(e instanceof Error ? e : new Error(String(e)));
      }
      return undefined;
    } finally {
      if (mountedRef.current && requestId === requestIdRef.current) {
        setLoading(false);
      }
    }
  }, []);

  const invalidate = useCallback((resetData: boolean, stopLoading: boolean) => {
    requestIdRef.current += 1;
    setError(undefined);
    if (resetData) setData(undefined);
    if (stopLoading) setLoading(false);
  }, []);

  // 每次提交后在 effect 内按依赖项比较。这样既允许调用方内联数组，
  // 又不依赖数组引用，也符合 React 对 render 阶段 ref 访问的约束。
  useEffect(() => {
    const previous = autoRequestStateRef.current;
    const dependenciesChanged = Boolean(
      previous && !areDependenciesEqual(previous.refreshDeps, refreshDeps)
    );
    const modeChanged = Boolean(previous && previous.manual !== manual);
    const shouldRun = !manual && (!previous || modeChanged || dependenciesChanged);

    if (dependenciesChanged || modeChanged) {
      invalidate(resetDataOnRefreshDepsChange, manual);
    }

    autoRequestStateRef.current = {
      manual,
      refreshDeps: [...refreshDeps],
    };

    if (shouldRun) {
      void run();
    }
  });

  return { data, loading, error, run };
}
