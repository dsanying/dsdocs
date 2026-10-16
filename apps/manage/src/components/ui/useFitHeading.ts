import { useLayoutEffect, useRef, useState, type RefObject } from 'react';

/**
 * 页头一行装不下“返回 + 标题 + 状态 + 完整操作按钮”时返回 true：操作按钮先收成仅图标，仍放不下才允许换行，
 * 避免按钮整组被挤到标题下一行。完整按钮宽度只在展开态测量并缓存，收起后用缓存判断何时能恢复，不会来回抖动。
 */
export function useFitHeading(headingRef: RefObject<HTMLDivElement | null>): boolean {
  const [compact, setCompact] = useState(false);
  const fullActionsWidth = useRef(0);

  useLayoutEffect(() => {
    const heading = headingRef.current;
    if (!heading) return undefined;
    // 操作区可能在数据读取后才出现（详情页先显示加载态），所以每次测量时现找，并监听页头子节点变化
    let observedActions: HTMLElement | null = null;

    const measure = () => {
      const actions = heading.querySelector<HTMLElement>(':scope > .ds-responsive-actions');
      if (actions !== observedActions) {
        if (observedActions) resizeObserver.unobserve(observedActions);
        if (actions) resizeObserver.observe(actions);
        observedActions = actions;
      }
      if (!actions) {
        setCompact(false);
        return;
      }
      const items = [...actions.children] as HTMLElement[];
      if (heading.dataset.compact !== 'true') {
        const gap = Number.parseFloat(getComputedStyle(actions).columnGap) || 0;
        fullActionsWidth.current =
          items.reduce((sum, item) => sum + item.getBoundingClientRect().width, 0) +
          gap * Math.max(items.length - 1, 0);
      }
      let others = 0;
      let count = 1;
      for (const child of heading.children) {
        if (child === actions) continue;
        count += 1;
        if (child.classList.contains('ds-app-page__title-group')) {
          // 标题组会伸展占满剩余宽度、标题可收缩横滚：按标题真实渲染的完整宽度（scrollWidth，含字体回退）+ 状态宽度计算
          const title = child.querySelector<HTMLElement>('.ds-app-page__title');
          const status = child.querySelector<HTMLElement>('.ds-app-page__status');
          others += title ? title.scrollWidth : 0;
          if (status)
            others +=
              status.getBoundingClientRect().width +
              (Number.parseFloat(getComputedStyle(child).columnGap) || 0);
        } else {
          others += child.getBoundingClientRect().width;
        }
      }
      const headingGap = Number.parseFloat(getComputedStyle(heading).columnGap) || 0;
      setCompact(
        others + fullActionsWidth.current + headingGap * (count - 1) > heading.clientWidth + 0.5
      );
    };

    const resizeObserver = new ResizeObserver(measure);
    resizeObserver.observe(heading);
    const mutationObserver = new MutationObserver(measure);
    // 标题文字在数据读取后才替换，需要连同子树文本变化一起重新量度
    mutationObserver.observe(heading, { childList: true, subtree: true, characterData: true });
    // 标题在组内收缩横滚，字体加载或回退后文字变宽不会改变页头尺寸，需要随字体完成重新量度
    const fonts = document.fonts;
    fonts?.addEventListener('loadingdone', measure);
    void fonts?.ready.then(measure);
    measure();
    return () => {
      resizeObserver.disconnect();
      mutationObserver.disconnect();
      fonts?.removeEventListener('loadingdone', measure);
    };
  }, [headingRef]);

  return compact;
}
