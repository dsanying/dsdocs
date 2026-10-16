import { useEffect, useState } from 'react';

import { Tooltip } from './Tooltip';

type Hint = { text: string; left: number; top: number; width: number; height: number };

// 按钮、操作链接，以及其他只剩图标的可聚焦元素（data-icon-only，被隐藏的文字放在其 .ds-visually-hidden 子元素里，如折叠侧栏的当前用户）
const ACTION_SELECTOR = 'button.ant-btn, a.ds-action-link, [data-icon-only]';

/**
 * 按钮 / 链接此刻是否只剩图标，是则返回被隐藏的文字：
 * - 收起的文字（窄屏或页头放不下时，文字视觉隐藏但仍是可访问名称）；
 * - 纯图标按钮（IconButton）没有文字，取它的 aria-label；
 * - 标了 data-icon-only 的其他元素，取其视觉隐藏的文字。
 */
function hiddenLabelOf(action: HTMLElement): string | null {
  if (action.matches('[data-icon-only]')) {
    return action.querySelector(':scope > .ds-visually-hidden')?.textContent?.trim() || null;
  }
  const label = action.matches('a.ds-action-link')
    ? action.querySelector<HTMLElement>(':scope > .ds-action-link__label')
    : action.querySelector<HTMLElement>(':scope > span:not(.ant-btn-icon)');
  if (label) {
    const visuallyHidden =
      getComputedStyle(label).clipPath !== 'none' || label.getBoundingClientRect().width <= 1;
    return visuallyHidden ? label.textContent?.trim() || null : null;
  }
  if (action.querySelector('.ant-btn-icon') && !action.textContent?.trim()) {
    return action.getAttribute('aria-label');
  }
  return null;
}

/**
 * 只剩图标时悬停 / 键盘聚焦显示被隐藏的文字——全站统一由这一处负责，页面不再各自给按钮挂 Tooltip。
 * 文字完整可见的按钮不弹提示；挂在 App 根部一次，弹层、抽屉里的按钮同样覆盖。
 */
export function IconLabelHint() {
  const [hint, setHint] = useState<Hint | null>(null);

  useEffect(() => {
    let current: HTMLElement | null = null;
    let currentLabel: string | null = null;
    const show = (action: HTMLElement) => {
      const text = hiddenLabelOf(action);
      if (!text) return;
      current = action;
      currentLabel = text;
      const rect = action.getBoundingClientRect();
      setHint({ text, left: rect.left, top: rect.top, width: rect.width, height: rect.height });
    };
    const hide = () => {
      current = null;
      currentLabel = null;
      setHint(null);
    };
    const onPointerOver = (event: PointerEvent) => {
      const action = (event.target as Element | null)?.closest?.<HTMLElement>(ACTION_SELECTOR);
      if (action && action !== current) show(action);
    };
    const onPointerOut = (event: PointerEvent) => {
      if (!current) return;
      const next = event.relatedTarget as Node | null;
      if (!next || !current.contains(next)) hide();
    };
    const onFocusIn = (event: FocusEvent) => {
      const action = (event.target as Element | null)?.closest?.<HTMLElement>(ACTION_SELECTOR);
      // 只在键盘聚焦时提示：鼠标点击触发的聚焦已经由悬停覆盖
      if (action && action.matches(':focus-visible')) show(action);
    };
    // 分步操作或异步状态会替换/改名当前按钮；不能让旧锚点继续遮住新动作。
    const observer = new MutationObserver(() => {
      if (current && (!current.isConnected || hiddenLabelOf(current) !== currentLabel)) hide();
    });
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true,
      attributes: true,
      attributeFilter: ['aria-label'],
    });
    document.addEventListener('pointerover', onPointerOver);
    document.addEventListener('pointerout', onPointerOut);
    document.addEventListener('focusin', onFocusIn);
    document.addEventListener('focusout', hide);
    document.addEventListener('pointerdown', hide);
    // 滚动或缩放后锚点位置失效，直接收起
    window.addEventListener('scroll', hide, true);
    window.addEventListener('resize', hide);
    return () => {
      observer.disconnect();
      document.removeEventListener('pointerover', onPointerOver);
      document.removeEventListener('pointerout', onPointerOut);
      document.removeEventListener('focusin', onFocusIn);
      document.removeEventListener('focusout', hide);
      document.removeEventListener('pointerdown', hide);
      window.removeEventListener('scroll', hide, true);
      window.removeEventListener('resize', hide);
    };
  }, []);

  if (!hint) return null;
  return (
    <Tooltip open title={hint.text} placement="top" classNames={{ root: 'ds-icon-label-hint' }}>
      {/* 与目标按钮重合的定位锚点：提示框按它对齐，本身不接收指针事件 */}
      <span
        aria-hidden="true"
        data-kind="icon-label-hint-anchor"
        style={{
          position: 'fixed',
          left: hint.left,
          top: hint.top,
          width: hint.width,
          height: hint.height,
          pointerEvents: 'none',
        }}
      />
    </Tooltip>
  );
}
