import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * 观察一个容器的内容宽度（px），用于按宽度推导图表布局（如热力图正方形格）。
 * 返回的是回调 ref：容器可能在加载态之后才挂载，挂载时才开始观察。
 */
export function useElementWidth<T extends HTMLElement>() {
  const observerRef = useRef<ResizeObserver | null>(null);
  const [width, setWidth] = useState(0);
  const ref = useCallback((element: T | null) => {
    observerRef.current?.disconnect();
    observerRef.current = null;
    if (!element) return;
    setWidth(element.clientWidth);
    const observer = new ResizeObserver(() => setWidth(element.clientWidth));
    observer.observe(element);
    observerRef.current = observer;
  }, []);
  useEffect(() => () => observerRef.current?.disconnect(), []);
  return { ref, width };
}
