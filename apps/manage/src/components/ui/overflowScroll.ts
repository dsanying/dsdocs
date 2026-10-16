/**
 * 横向滚动槽位的运行时：按 overflowSlots.ts 的唯一清单测量，真放不下才标 data-overflowing（样式在 overflowScroll.css）。
 * 放得下的槽位不是滚动容器，左右拖动 / 滚轮直接交给外层（整张表、整页）。
 *
 * 不让每个组件各量各的：放进槽位的东西五花八门（链接、可复制值、标签），只量内层组件会漏掉“链接撑出格子却没有滚动”
 * 这类情况；放在一处按选择器统一量，新加的内容只要落进槽位就自动可滚。
 */
import { SCROLL_SLOT_SELECTOR } from './overflowSlots';

import './overflowScroll.css';
import './scrollbar.css';

/** 内容比盒子宽 1px 以上才算溢出：文字宽度带小数，亚像素差不能把元素变成“可滚动”。 */
export function overflowsHorizontally(element: HTMLElement): boolean {
  return element.scrollWidth > element.clientWidth + 1;
}

const INTERACTIVE = 'a[href], button, input, select, textarea';
const FOCUSABLE = `${INTERACTIVE}, [tabindex]`;

function providesFocusTarget(element: HTMLElement): boolean {
  return !element.matches(':disabled') && (element.matches(INTERACTIVE) || element.tabIndex >= 0);
}

function hasFocusableAncestor(element: HTMLElement): boolean {
  let ancestor = element.parentElement?.closest<HTMLElement>(FOCUSABLE);
  while (ancestor) {
    if (providesFocusTarget(ancestor)) return true;
    ancestor = ancestor.parentElement?.closest<HTMLElement>(FOCUSABLE);
  }
  return false;
}

function mark(element: HTMLElement, overflowing: boolean) {
  if (overflowing) {
    if (element.dataset.overflowing !== 'true') element.dataset.overflowing = 'true';
    // dialog 的 tabindex=-1 只承载初始焦点，不能替代内部原子槽的键盘停靠点。
    const anotherTarget =
      hasFocusableAncestor(element) ||
      [...element.querySelectorAll<HTMLElement>(FOCUSABLE)].some(providesFocusTarget);
    if (!element.hasAttribute('tabindex') && !anotherTarget) {
      element.tabIndex = 0;
      element.dataset.overflowFocus = 'true';
    } else if (element.dataset.overflowFocus && anotherTarget) {
      element.removeAttribute('tabindex');
      delete element.dataset.overflowFocus;
    }
  } else {
    delete element.dataset.overflowing;
    if (element.dataset.overflowFocus) {
      element.removeAttribute('tabindex');
      delete element.dataset.overflowFocus;
    }
  }
}

/**
 * 在 root 下持续标记槽位：DOM 变化（内容替换、行增删、弹层挂载）与槽位尺寸变化（列宽重算、窗口缩放）
 * 都会合并到下一帧重量一次。返回卸载函数。
 */
export function installOverflowScroll(root: HTMLElement = document.body): () => void {
  // 捕获候选项的横向手势，避免虚拟列表把它当作纵向滚轮拦截；普通纵向手势仍由列表处理。
  const onCandidateWheel = (event: WheelEvent) => {
    if (event.ctrlKey || !(event.target instanceof Element)) return;
    const candidate = event.target.closest<HTMLElement>(
      '.ds-select-option .ant-select-item-option-content'
    );
    if (!candidate || !root.contains(candidate) || !overflowsHorizontally(candidate)) return;
    const shifted = event.shiftKey && event.deltaX === 0;
    if (!shifted && Math.abs(event.deltaX) <= Math.abs(event.deltaY)) return;
    const delta = shifted ? event.deltaY : event.deltaX;
    if (!delta) return;
    const unit =
      event.deltaMode === WheelEvent.DOM_DELTA_LINE
        ? parseFloat(getComputedStyle(candidate).lineHeight) || 16
        : event.deltaMode === WheelEvent.DOM_DELTA_PAGE
          ? candidate.clientWidth
          : 1;
    candidate.scrollLeft += delta * unit;
    event.preventDefault();
    event.stopPropagation();
  };
  root.addEventListener('wheel', onCandidateWheel, { capture: true, passive: false });
  const observed = new Set<HTMLElement>();
  const pending = new Set<HTMLElement>();
  let frame = 0;
  let fullScan = true;
  let disposed = false;
  const scan = () => {
    frame = 0;
    // 已卸载的槽位不再观察，避免长时间运行后观察列表只增不减。
    for (const element of observed) {
      if (element.isConnected && root.contains(element)) continue;
      resizeObserver.unobserve(element);
      observed.delete(element);
    }
    const elements = fullScan
      ? [...root.querySelectorAll<HTMLElement>(SCROLL_SLOT_SELECTOR)]
      : [...pending].filter((element) => element.isConnected && root.contains(element));
    // 嵌套槽的焦点归属依赖祖先已先标记；Mutation/Resize 记录顺序不能代替 DOM 顺序。
    elements.sort((left, right) =>
      left === right
        ? 0
        : left.compareDocumentPosition(right) & Node.DOCUMENT_POSITION_FOLLOWING
          ? -1
          : 1
    );
    fullScan = false;
    pending.clear();
    // 先读完全部几何，再更新滚动/焦点属性，避免逐槽读写强制重新排版。
    const overflowing = elements.map(overflowsHorizontally);
    for (const [index, element] of elements.entries()) {
      if (!observed.has(element)) {
        observed.add(element);
        resizeObserver.observe(element);
      }
      mark(element, overflowing[index]);
    }
  };
  const schedule = () => {
    if (!disposed && !frame) frame = requestAnimationFrame(scan);
  };
  const resizeObserver = new ResizeObserver((entries) => {
    for (const { target } of entries) if (target instanceof HTMLElement) pending.add(target);
    schedule();
  });
  const addAncestors = (node: Node) => {
    let element = node instanceof HTMLElement ? node : node.parentElement;
    while (element && root.contains(element)) {
      if (element.matches(SCROLL_SLOT_SELECTOR)) {
        pending.add(element);
        // 新增/移除按钮等焦点目标也可能改变既有子槽的键盘停靠点。
        for (const nested of element.querySelectorAll<HTMLElement>(SCROLL_SLOT_SELECTOR))
          pending.add(nested);
      }
      if (element === root) break;
      element = element.parentElement;
    }
  };
  // 只重测变化内容所在槽与新挂载槽；通知等无关 DOM 变化不能让全页槽位重新量度。
  // 仍只监听结构/文字，本模块的属性写入不会自激。
  const mutationObserver = new MutationObserver((records) => {
    for (const record of records) {
      addAncestors(record.target);
      for (const node of record.addedNodes) {
        if (!(node instanceof HTMLElement)) continue;
        if (node.matches(SCROLL_SLOT_SELECTOR)) pending.add(node);
        for (const element of node.querySelectorAll<HTMLElement>(SCROLL_SLOT_SELECTOR))
          pending.add(element);
      }
    }
    schedule();
  });
  mutationObserver.observe(root, { childList: true, subtree: true, characterData: true });
  void document.fonts?.ready.then(() => {
    fullScan = true;
    schedule();
  });
  schedule();
  return () => {
    disposed = true;
    root.removeEventListener('wheel', onCandidateWheel, true);
    cancelAnimationFrame(frame);
    mutationObserver.disconnect();
    resizeObserver.disconnect();
  };
}
