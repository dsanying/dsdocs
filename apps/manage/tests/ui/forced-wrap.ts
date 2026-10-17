import { expect, type Page } from '@playwright/test';

import { SCROLL_SLOT_SELECTOR } from '../../src/components/ui/overflowSlots';

/**
 * 单词项契约：这些元素承载的是名称、状态、指标、动作等单个词项，
 * 空间不足时必须由父布局降列/换行，而不是把词项本身折成多行。
 * 超过 SINGLE_TERM_MAX_CHARS 的文案视为句子，允许自然换行。
 */
export const SINGLE_TERM_SELECTORS = [
  '.chart-card__title',
  '.ant-statistic-title',
  '.ant-statistic-content',
  '.ds-summary-strip__label',
  '.ds-summary-strip__value',
  '.ant-btn',
  '.ds-status-tag',
  '.ant-tabs-tab-btn',
  '.ds-view-switch__label',
  '.ant-form-item-label > label',
  '.ds-section-header__title',
  '.kpi-card__label',
  '.kpi-card__value',
  '.ant-breadcrumb-link',
  '.ant-menu-title-content',
  '.ant-table-thead > tr > th',
] as const;

export const SINGLE_TERM_MAX_CHARS = 16;

export interface ForcedWrap {
  element: string;
  text: string;
  height: number;
  lineHeight: number;
}

/** 收集当前页面上被迫折行的单词项；与 UI 测试共用，也可在浏览器控制台直接执行同款逻辑。 */
export async function collectForcedWraps(page: Page): Promise<ForcedWrap[]> {
  return page.evaluate(
    ({ selectors, maxChars }) => {
      const out: ForcedWrap[] = [];
      const seen = new Set<Element>();
      for (const selector of selectors) {
        for (const element of document.querySelectorAll<HTMLElement>(selector)) {
          if (seen.has(element) || element.closest('.ds-information-grid')) continue;
          seen.add(element);
          const text = (element.textContent ?? '').replace(/\s+/g, ' ').trim();
          if (!text || text.length > maxChars) continue;
          if (element.querySelector('br')) continue;
          const rect = element.getBoundingClientRect();
          if (rect.width === 0 || rect.height === 0) continue;
          const style = getComputedStyle(element);
          if (style.visibility === 'hidden' || style.display === 'none') continue;
          const fontSize = parseFloat(style.fontSize) || 14;
          const lineHeight =
            style.lineHeight === 'normal'
              ? fontSize * 1.5
              : parseFloat(style.lineHeight) || fontSize * 1.5;
          // 文本行盒高度：用 Range 精确取文字占据的行数，不受 padding/图标影响
          const range = document.createRange();
          range.selectNodeContents(element);
          // 图标与文字在同一行但盒高不同，按纵向是否重叠合并成行，而不是按 top 分桶
          const rects = [...range.getClientRects()]
            .filter((line) => line.width > 0 && line.height > 0)
            .sort((a, b) => a.top - b.top);
          let lines = 0;
          let lineBottom = Number.NEGATIVE_INFINITY;
          for (const line of rects) {
            if (line.top >= lineBottom - 1) {
              lines += 1;
              lineBottom = line.bottom;
            } else {
              lineBottom = Math.max(lineBottom, line.bottom);
            }
          }
          if (lines <= 1) continue;
          out.push({
            element: `${element.tagName.toLowerCase()}${
              element.className && typeof element.className === 'string'
                ? `.${element.className.trim().split(/\s+/).slice(0, 3).join('.')}`
                : ''
            }`,
            text,
            height: Math.round(rect.height),
            lineHeight: Math.round(lineHeight),
          });
        }
      }
      return out;
    },
    { selectors: [...SINGLE_TERM_SELECTORS], maxChars: SINGLE_TERM_MAX_CHARS }
  );
}

/** 断言页面上没有被迫折行的单词项。 */
export async function expectNoForcedWraps(page: Page) {
  await expectReadableInformationFields(page);
  const wraps = await collectForcedWraps(page);
  expect(wraps, `单词项被迫折行：${JSON.stringify(wraps, null, 2)}`).toEqual([]);
}

/**
 * 小数位契约：页面上任何可见文本都不得出现四位及以上小数。
 * 编辑器/代码块/输入框里的原始 JSON 与用户输入不在展示契约之内。
 */
export async function collectLongDecimals(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const skip = 'pre, code, textarea, input, .monaco-editor, script, style';
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    const hits = new Set<string>();
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const parent = (node as Text).parentElement;
      if (!parent || parent.closest(skip)) continue;
      for (const match of (node.textContent ?? '').matchAll(/-?\d+\.\d{4,}/g)) hits.add(match[0]);
    }
    return [...hits];
  });
}

export async function expectNoLongDecimals(page: Page) {
  const hits = await collectLongDecimals(page);
  expect(hits, `页面出现超过三位小数的数值：${JSON.stringify(hits)}`).toEqual([]);
}

/**
 * 可读性契约：普通可见文本对比度 ≥ 4.5，大字及非文字元素 ≥ 3。
 * 主色被算法还原成品牌派生档位后，Ant 内部“实色填充 + 前景文字”的组合仍可能
 * 变成白底白字，静态门禁看不到 Ant 内部样式，只能在运行时按渲染结果兜底。
 */
export interface UnreadableText {
  element: string;
  text: string;
  color: string;
  background: string;
  ratio: number;
}

export async function collectUnreadableText(page: Page): Promise<UnreadableText[]> {
  return page.evaluate(() => {
    const parse = (value: string): [number, number, number, number] | null => {
      const rgb = value.match(/^rgba?\(([^)]+)\)$/);
      if (rgb) {
        const parts = rgb[1]
          .trim()
          .replaceAll('/', ' ')
          .split(/[\s,]+/)
          .map((part) => (part.endsWith('%') ? parseFloat(part) * 2.55 : parseFloat(part)));
        return [parts[0], parts[1], parts[2], parts.length > 3 ? parts[3] : 1];
      }
      // color-mix() 的计算值在 Chromium 中可序列化成 color(srgb ...)，不能漏掉品牌色表面。
      const srgb = value.match(/^color\(srgb\s+([^)]*)\)$/);
      if (srgb) {
        const parts = srgb[1].trim().replaceAll('/', ' ').split(/\s+/).map(Number);
        return [parts[0] * 255, parts[1] * 255, parts[2] * 255, parts.length > 3 ? parts[3] : 1];
      }
      return null;
    };
    const blend = (
      fg: [number, number, number, number],
      bg: [number, number, number]
    ): [number, number, number] => {
      const a = fg[3];
      return [
        fg[0] * a + bg[0] * (1 - a),
        fg[1] * a + bg[1] * (1 - a),
        fg[2] * a + bg[2] * (1 - a),
      ];
    };
    const luminance = ([r, g, b]: [number, number, number]) => {
      const f = (c: number) => {
        const s = c / 255;
        return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
      };
      return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
    };
    const contrast = (a: [number, number, number], b: [number, number, number]) => {
      const l1 = luminance(a);
      const l2 = luminance(b);
      return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
    };
    const canvasBg = parse(getComputedStyle(document.body).backgroundColor) ?? [255, 255, 255, 1];
    const effectiveBackground = (start: HTMLElement): [number, number, number] => {
      let base: [number, number, number] = [canvasBg[0], canvasBg[1], canvasBg[2]];
      const chain: [number, number, number, number][] = [];
      for (let el: HTMLElement | null = start; el; el = el.parentElement) {
        const bg = parse(getComputedStyle(el).backgroundColor);
        if (bg && bg[3] > 0) {
          chain.push(bg);
          if (bg[3] >= 1) break;
        }
      }
      for (let i = chain.length - 1; i >= 0; i -= 1) base = blend(chain[i], base);
      return base;
    };
    // 禁用态按约定降低对比度，不参与；其余可见文字全部检查
    const skip =
      "script, style, textarea, input, select, option, [aria-hidden='true'], .ant-select-selection-search, canvas, .monaco-editor, svg, [disabled], [aria-disabled='true'], .ant-btn-disabled, .ant-select-disabled, .ant-input-disabled, .ant-picker-disabled";
    const disabledSegment = (el: Element) => {
      const item = el.closest('.ant-segmented-item-disabled');
      return Boolean(item?.querySelector('input:disabled'));
    };
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    const hits: UnreadableText[] = [];
    const seen = new Set<Element>();
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const text = (node.textContent ?? '').trim();
      if (!text) continue;
      const el = (node as Text).parentElement;
      if (!el || seen.has(el) || el.closest(skip) || disabledSegment(el)) continue;
      seen.add(el);
      const rect = el.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) continue;
      const style = getComputedStyle(el);
      if (
        style.visibility === 'hidden' ||
        style.display === 'none' ||
        parseFloat(style.opacity) === 0
      )
        continue;
      // 视觉隐藏（clip）的文字不参与
      if (style.clipPath !== 'none' || style.clip !== 'auto') continue;
      const fg = parse(style.color);
      if (!fg || fg[3] === 0) continue;
      const bg = effectiveBackground(el);
      const ratio = contrast(blend(fg, bg), bg);
      const largeText =
        parseFloat(style.fontSize) >= 24 ||
        (parseFloat(style.fontSize) >= 18.66 && parseInt(style.fontWeight, 10) >= 700);
      if (ratio < (largeText ? 3 : 4.5)) {
        hits.push({
          element: `${el.tagName.toLowerCase()}${typeof el.className === 'string' && el.className ? `.${el.className.trim().split(/\s+/).slice(0, 3).join('.')}` : ''}`,
          text: text.slice(0, 40),
          color: style.color,
          background: `rgb(${bg.map((c) => Math.round(c)).join(', ')})`,
          ratio: Math.round(ratio * 100) / 100,
        });
      }
    }
    // 图标（语义色的允许/拒绝、状态图标）也要在所在底色上可读：反色表面（选中的分段项/页签）上语义色必须换成 *-on-inverse 一套
    for (const icon of document.querySelectorAll<HTMLElement>('.anticon')) {
      if (icon.closest(skip) || disabledSegment(icon) || seen.has(icon)) continue;
      const rect = icon.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) continue;
      const style = getComputedStyle(icon);
      if (style.visibility === 'hidden' || parseFloat(style.opacity) === 0) continue;
      const fg = parse(style.color);
      if (!fg || fg[3] === 0) continue;
      const bg = effectiveBackground(icon);
      const ratio = contrast(blend(fg, bg), bg);
      // 非文字元素按 WCAG 3:1；反色表面上语义色是否换成 *-on-inverse 由契约夹具精确断言颜色
      if (ratio < 3) {
        hits.push({
          element: `icon.${icon.className.trim().split(/\s+/).slice(0, 2).join('.')}`,
          text: icon.getAttribute('aria-label') ?? '',
          color: style.color,
          background: `rgb(${bg.map((c) => Math.round(c)).join(', ')})`,
          ratio: Math.round(ratio * 100) / 100,
        });
      }
    }
    return hits;
  });
}

export async function expectReadableText(page: Page) {
  const hits = await collectUnreadableText(page);
  expect(hits, `文字与背景对比度不足：${JSON.stringify(hits, null, 2)}`).toEqual([]);
}

/**
 * 动作按钮一致性契约：所有可见的 Ant 按钮（含 Modal/Popconfirm 的确定/取消）都必须带图标；
 * 窄屏（≤640px）时文字全部视觉隐藏、只留图标，不得出现“有的收了有的没收”。
 */
export interface InconsistentActionButton {
  text: string;
  reason: 'missing-icon' | 'label-visible';
}

export async function collectInconsistentActionButtons(
  page: Page
): Promise<InconsistentActionButton[]> {
  return page.evaluate(() => {
    const narrow = window.matchMedia('(max-width: 640px)').matches;
    const hits: { text: string; reason: 'missing-icon' | 'label-visible' }[] = [];
    const visible = (element: HTMLElement) => {
      if (!element.isConnected) return false;
      const rect = element.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return false;
      const style = getComputedStyle(element);
      return style.visibility !== 'hidden' && style.display !== 'none';
    };
    // 名称链接（ActionLink variant="name"）的文字就是对象名，窄屏也保留，不按动作按钮要求
    for (const button of document.querySelectorAll<HTMLElement>(
      '.ant-btn, .ds-action-link:not([data-variant="name"])'
    )) {
      if (!visible(button)) continue;
      const text = (button.getAttribute('aria-label') ?? button.textContent ?? '')
        .trim()
        .slice(0, 40);
      const icon = button.querySelector(':scope > .ant-btn-icon, :scope > .ds-action-link__icon');
      if (!icon) {
        hits.push({ text, reason: 'missing-icon' });
        continue;
      }
      if (!narrow) continue;
      for (const label of button.querySelectorAll<HTMLElement>(
        ':scope > span:not(.ant-btn-icon):not(.ds-action-link__icon)'
      )) {
        if (label.getBoundingClientRect().width > 1) hits.push({ text, reason: 'label-visible' });
      }
    }
    return hits;
  });
}

export async function expectConsistentActionButtons(page: Page) {
  const hits = await collectInconsistentActionButtons(page);
  expect(hits, `动作按钮不一致（缺图标或窄屏未收成仅图标）：${JSON.stringify(hits)}`).toEqual([]);
}

/**
 * 操作组对齐契约：同一 ResponsiveActions 内、位于同一行的子项垂直中心线必须重合（≤1px），
 * 不允许链接与按钮因基线排布而上下错位。
 */
export async function collectMisalignedActionGroups(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const hits: string[] = [];
    for (const group of document.querySelectorAll<HTMLElement>('.ds-responsive-actions')) {
      const rects = [...group.children]
        .map((child) => ({
          text: (child.textContent ?? '').trim().slice(0, 20),
          rect: child.getBoundingClientRect(),
        }))
        .filter(({ rect }) => rect.width > 0 && rect.height > 0);
      for (let index = 1; index < rects.length; index += 1) {
        const previous = rects[index - 1];
        const current = rects[index];
        // 换行后的项不在同一行，只比较横向相邻项
        if (current.rect.left < previous.rect.right) continue;
        const delta = Math.abs(
          previous.rect.top +
            previous.rect.height / 2 -
            (current.rect.top + current.rect.height / 2)
        );
        if (delta > 1) hits.push(`${previous.text} | ${current.text}: ${delta.toFixed(1)}px`);
      }
    }
    return hits;
  });
}

export async function expectAlignedActionGroups(page: Page) {
  const hits = await collectMisalignedActionGroups(page);
  expect(hits, `操作组内子项上下错位：${JSON.stringify(hits)}`).toEqual([]);
}

/**
 * 小操作区居中契约：按钮、分段项、标签、输入框前后缀、清除图标这类小操作区里的图标，
 * 垂直中心必须与所在操作区重合（≤1px）；纯图标操作区（无文字）还要求水平居中。
 * 基线排布会把 svg 抬高几像素，这是最常见的"看着不正"。
 */
export async function collectOffCenterIcons(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const hits: string[] = [];
    const containers =
      '.ant-btn, .ant-segmented-item, .ant-tag, .ant-input-prefix, .ant-input-suffix, .ant-select-clear, .ant-select-suffix, .ant-input-clear-icon, .ant-modal-close, .ant-pagination-item-link';
    for (const box of document.querySelectorAll<HTMLElement>(containers)) {
      const boxRect = box.getBoundingClientRect();
      if (boxRect.width === 0 || boxRect.height === 0) continue;
      // 只看直接属于这个操作区的图标，嵌套操作区各自校验
      const icons = [...box.querySelectorAll<HTMLElement>('.anticon')].filter((icon) => {
        const rect = icon.getBoundingClientRect();
        return icon.closest(containers) === box && rect.width > 0 && rect.height > 0;
      });
      for (const icon of icons) {
        const rect = icon.getBoundingClientRect();
        const dy = Math.abs(boxRect.top + boxRect.height / 2 - (rect.top + rect.height / 2));
        // 水平居中只对“只含一个可见元素”的操作区成立；输入框尾部同时有清除按钮与说明问号时各自排列
        const visibleChildren = [...box.children].filter(
          (child) => child.getBoundingClientRect().width > 0
        );
        const iconOnly =
          icons.length === 1 &&
          visibleChildren.length === 1 &&
          (box.textContent ?? '').trim().length === 0;
        const dx = iconOnly
          ? Math.abs(boxRect.left + boxRect.width / 2 - (rect.left + rect.width / 2))
          : 0;
        if (dy > 1 || dx > 1) {
          hits.push(
            `${box.className.split(' ').find((name) => name.startsWith('ant-') || name.startsWith('ds-')) ?? box.tagName}${iconOnly ? '' : `:${(box.textContent ?? '').trim().slice(0, 12)}`} dy=${dy.toFixed(1)} dx=${dx.toFixed(1)}`
          );
        }
      }
    }
    return [...new Set(hits)];
  });
}

export async function expectCenteredIcons(page: Page) {
  const hits = await collectOffCenterIcons(page);
  expect(hits, `小操作区图标未居中：${JSON.stringify(hits)}`).toEqual([]);
}

/**
 * 单元格边界契约：单元格里任何后代的可见盒都不得越过单元格右缘（内容放不下时在格内左右滚动，不溢出盖到邻列）；
 * 比例值（RatioProgress）里金额与百分比同一字号且在同一行。
 */
export async function collectCellOverflows(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const hits: string[] = [];
    // Ant 的测量行（ant-table-measure-row）复制表头内容用于量宽，不是数据
    for (const cell of document.querySelectorAll<HTMLElement>(
      '.ds-table .ant-table-tbody > tr:not(.ant-table-measure-row) > td'
    )) {
      const bounds = cell.getBoundingClientRect();
      if (bounds.width === 0) continue;
      for (const child of cell.querySelectorAll<HTMLElement>('*')) {
        const rect = child.getBoundingClientRect();
        if (rect.width === 0) continue;
        // 多行格按行滚动：内容在格内某个可横向滚动的行里，也算“在自己的边界内”
        let scroller: HTMLElement | null = child.parentElement;
        while (scroller && scroller !== cell && getComputedStyle(scroller).overflowX !== 'auto')
          scroller = scroller.parentElement;
        const scrollsInLine = Boolean(scroller && scroller !== cell);
        if (
          rect.right > bounds.right + 1 &&
          !scrollsInLine &&
          cell.scrollLeft === 0 &&
          getComputedStyle(cell).overflowX !== 'auto'
        ) {
          hits.push(
            `overflow:${(child.textContent ?? '').trim().slice(0, 40)}<${child.tagName}.${String(child.className).slice(0, 50)} in td.${String(cell.className).slice(0, 50)}>`
          );
          break;
        }
      }
    }
    // 短内容不滚动：放不下的内容若不超过 text 标度（320，减去单元格内边距 32），声明列应按内容放宽、主列应抬高保底宽度，
    // 而不是让两三个字符的尾巴在格内滚动；整表已经横滚时格内滚动是既定的兜底（加宽只会让整表滚得更远）
    const tableScrolls = (cell: Element) => {
      const region = cell
        .closest('.ds-table')
        ?.querySelector<HTMLElement>('.ant-table-body, .ant-table-content');
      return Boolean(region && region.scrollWidth > region.clientWidth + 1);
    };
    for (const cell of document.querySelectorAll<HTMLElement>(
      '.ds-table .ant-table-tbody > tr > td'
    )) {
      if (cell.getBoundingClientRect().width === 0 || tableScrolls(cell)) continue;
      for (const scroller of [cell, ...cell.querySelectorAll<HTMLElement>('*')]) {
        const overflowX = getComputedStyle(scroller).overflowX;
        if (
          !['auto', 'scroll'].includes(overflowX) ||
          scroller.scrollWidth <= scroller.clientWidth + 1
        )
          continue;
        if (scroller.scrollWidth <= 320 - 32) {
          hits.push(
            `short-content-scrolls:${(scroller.textContent ?? '').trim().slice(0, 40)}(${scroller.scrollWidth}>${scroller.clientWidth})`
          );
          break;
        }
      }
    }
    // 放得下的内容不能是滚动容器：否则它会截获左右拖动 / 滚轮（亚像素误差也会让它“可滚动”），整张表拖不动
    for (const node of document.querySelectorAll<HTMLElement>(
      '.ds-table .ant-table-tbody td, .ds-table .ant-table-tbody td *'
    )) {
      if (node.getBoundingClientRect().width === 0) continue;
      if (
        ['auto', 'scroll'].includes(getComputedStyle(node).overflowX) &&
        node.scrollWidth <= node.clientWidth + 1
      ) {
        hits.push(`idle-scroller:${(node.textContent ?? '').trim().slice(0, 40)}`);
      }
    }
    // 纵向多行格（名称 + 键）不得整格滚动：标题要留在原地，只有放不下的那一行单独滚动
    for (const stack of document.querySelectorAll<HTMLElement>(
      '.ds-table .ant-table-tbody > tr > td > .ds-layout-stack:not(.ds-layout-stack--row)'
    )) {
      const cell = stack.parentElement as HTMLElement;
      if (cell.getBoundingClientRect().width === 0) continue;
      if (getComputedStyle(cell).overflowX === 'auto' || cell.scrollWidth > cell.clientWidth + 1)
        hits.push(`stack-scrolls-whole-cell:${(stack.textContent ?? '').trim().slice(0, 40)}`);
    }
    for (const ratio of document.querySelectorAll<HTMLElement>('.ds-ratio-progress')) {
      const amount = ratio.querySelector<HTMLElement>('.ds-ratio-progress__amount');
      const percent = ratio.querySelector<HTMLElement>('.ds-ratio-progress__percent');
      if (!amount || !percent) continue;
      if (getComputedStyle(amount).fontSize !== getComputedStyle(percent).fontSize)
        hits.push(`ratio-font:${ratio.textContent}`);
      // 比例值所在槽位必须容得下整行文字（信息网格格子、表格列都算）
      const slot = ratio.parentElement;
      if (slot && ratio.getBoundingClientRect().right > slot.getBoundingClientRect().right + 1)
        hits.push(`ratio-overflow:${ratio.textContent}`);
    }
    return hits;
  });
}

export async function expectNoCellOverflows(page: Page) {
  const hits = await collectCellOverflows(page);
  expect(hits, `单元格内容越界或比例值排版不一致：${JSON.stringify(hits)}`).toEqual([]);
}

/**
 * 列宽不浪费契约：声明了宽度的列（colgroup 里有 width 的 col），当全部单元格都是行内内容时，
 * 列宽与最宽内容之间的空余不得超过一个标度步长（20px 取整 + 一步）——共享 Table 的内容自适应负责把列收紧，
 * 这里检查有没有绕过它的表格。
 */
export async function collectColumnWaste(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const hits: string[] = [];
    const PADDING = 32;
    const STEP = 20;
    for (const table of document.querySelectorAll<HTMLElement>('.ds-table')) {
      const cols = [...table.querySelectorAll<HTMLTableColElement>('colgroup > col')];
      const rows = [
        ...table.querySelectorAll<HTMLTableRowElement>('.ant-table-tbody > tr.ant-table-row'),
      ];
      const headers = [
        ...table.querySelectorAll<HTMLElement>('.ant-table-thead > tr:first-child > th'),
      ];
      if (rows.length === 0) continue;
      // 宽屏时多余空间按比例摊给每一列：允许的列宽 = 内容所需 × (表格实际宽 / 像素总宽)
      // auxiliaryWidth 是辅助列（勾选/序号/拖拽柄等）占用的固定宽，数据列只摊剩下的空间
      const host = table.closest<HTMLElement>('.ds-table__host');
      const auxiliaryWidth = Number(host?.dataset.auxiliaryWidth ?? 0);
      const pixelTotal = Number(host?.dataset.columnsWidth ?? 0) - auxiliaryWidth;
      const tableWidth = table.querySelector('table')?.getBoundingClientRect().width ?? 0;
      const dataWidth = tableWidth - auxiliaryWidth;
      const scale = pixelTotal > 0 && dataWidth > pixelTotal ? dataWidth / pixelTotal : 1;
      cols.forEach((col, index) => {
        if (!col.style.width) return;
        const header = headers[index];
        if (!header || header.dataset.flexColumn === 'true') return;
        let widest = 0;
        for (const row of rows) {
          const cell = row.children[index] as HTMLElement | undefined;
          if (!cell) return;
          for (const child of cell.children) {
            const display = getComputedStyle(child).display;
            if (!display.startsWith('inline') && display !== 'contents') return;
          }
          const range = document.createRange();
          range.selectNodeContents(cell);
          widest = Math.max(widest, range.getBoundingClientRect().width);
        }
        const titleRange = document.createRange();
        titleRange.selectNodeContents(header);
        const need = (Math.max(widest, titleRange.getBoundingClientRect().width) + PADDING) * scale;
        const width = header.getBoundingClientRect().width;
        if (width - need > STEP * 2 * scale)
          hits.push(
            `${(header.textContent ?? '').trim()}:${Math.round(width)}>${Math.round(need)}`
          );
      });
    }
    return hits;
  });
}

export async function expectNoColumnWaste(page: Page) {
  const hits = await collectColumnWaste(page);
  expect(hits, `列宽明显大于内容（空间浪费）：${JSON.stringify(hits)}`).toEqual([]);
}

/**
 * 查询条控件契约：下拉的选中值必须完整显示（宽度按最长选项量出，不得省略）；
 * 文本输入框不得用省略号截断，超出部分靠原生横向滚动查看。
 */
export async function collectTruncatedQueryControls(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const hits: string[] = [];
    for (const item of document.querySelectorAll<HTMLElement>(
      '.ds-query-form .ant-select-selection-item'
    )) {
      if (item.scrollWidth > item.clientWidth + 1)
        hits.push(`select:${(item.textContent ?? '').trim()}`);
    }
    for (const input of document.querySelectorAll<HTMLInputElement>(
      '.ds-query-form input.ant-input'
    )) {
      if (getComputedStyle(input).textOverflow === 'ellipsis') hits.push(`input:${input.id}`);
    }
    return hits;
  });
}

/**
 * 页面名同源契约：一级标题 = 面包屑末项；侧边栏高亮的菜单项一定出现在面包屑里（列表页就是末项，
 * 详情/编辑等子页是它的上级）。三者都来自导航树，页面只在新建/编辑两态或详情对象名时改末项。
 * 末项之前的面包屑都能点回去（详情项代入当前对象），只有侧边栏分组（本身没有页面）不可点。
 */
export async function expectConsistentPageTitle(page: Page) {
  const state = await page.evaluate(() => ({
    crumbs: [
      ...document.querySelectorAll(
        '.ds-app-page__header .ant-breadcrumb li:not(.ant-breadcrumb-separator)'
      ),
    ].map((node) => (node.textContent ?? '').trim()),
    // 末项之前不能点的面包屑：只允许是第一项的顶层菜单分组（本身没有页面；窄屏侧栏不在 DOM 里，按位置判断）
    deadCrumbs: [
      ...document.querySelectorAll(
        '.ds-app-page__header .ant-breadcrumb li:not(.ant-breadcrumb-separator)'
      ),
    ]
      .slice(1, -1)
      .filter((node) => !node.querySelector('a'))
      .map((node) => (node.textContent ?? '').trim()),
    title: (document.querySelector('.ds-app-page__title')?.textContent ?? '').trim(),
    menu: (
      document.querySelector('.ds-basic-layout__menu .ant-menu-item-selected')?.textContent ?? ''
    ).trim(),
  }));
  if (state.crumbs.length === 0) return;
  expect(state.title, `一级标题与面包屑末项不一致：${JSON.stringify(state)}`).toBe(
    state.crumbs.at(-1)
  );
  if (state.menu)
    expect(state.crumbs, `侧边栏高亮项不在面包屑里：${JSON.stringify(state)}`).toContain(
      state.menu
    );
  expect(
    state.deadCrumbs,
    `除顶层菜单分组外，末项之前的面包屑都必须能点回去：${JSON.stringify(state)}`
  ).toEqual([]);
}

/**
 * 不省略契约：过长内容一律在自身范围内左右滚动（AtomicValue/LongText/共享 Select 覆盖），
 * 页面上任何可见元素的 text-overflow 都不得是 ellipsis。
 */
export async function expectNoEllipsis(page: Page) {
  const hits = await page.evaluate(() =>
    [...document.querySelectorAll<HTMLElement>('body *')]
      .filter(
        (node) =>
          node.getClientRects().length > 0 && getComputedStyle(node).textOverflow === 'ellipsis'
      )
      .map(
        (node) =>
          `${node.tagName}.${String(node.className)}<${String((node.parentElement as HTMLElement).className).slice(0, 60)}|${(node.textContent ?? '').trim().slice(0, 30)}`
      )
  );
  expect(hits, `存在省略号截断：${JSON.stringify(hits)}`).toEqual([]);
}

/**
 * 该滚就能滚契约（全站，不限表格）：
 * - stuck：内容放不下，却被不可滚动的盒子（overflow hidden/clip）裁掉——溢出者自身裁切，或越出自身后最近的裁切祖先不是滚动容器；
 * - idle：滚动槽位（overflowScroll 的 SCROLL_SLOT_SELECTOR）放得下却仍是滚动容器，会截获左右拖动 / 滚轮；
 * - wrap：滚动槽位折行——过长单项只有单行滚动一种处理，不与折行混用；
 * - padded：滚动槽位带水平内边距——滚动后内容贴到格子边缘、与邻格连成一片（留白改用透明行内边框）。
 * 视觉隐藏（clip-path / clip）与 Ant 控件自管的裁切（测量行、标签页导航的左右切换、数字框步进按钮、开关的双态文字）不参与。
 */
export async function collectStuckOverflows(page: Page): Promise<string[]> {
  return page.evaluate((SLOTS) => {
    const hits: string[] = [];
    const IGNORED =
      ".ant-table-measure-row, .ant-tabs-nav, .ant-table-header, .ant-input-number-actions, .ant-input-number-handler-wrap, .ant-switch, .ant-select-selector, .ant-select-content, .ant-select-selection-overflow, [aria-hidden='true']";
    const label = (node: HTMLElement) =>
      `${(node.textContent ?? '').trim().slice(0, 40)}<${node.tagName}.${String(node.className).slice(0, 50)}>`;
    const scrolls = (style: CSSStyleDeclaration) => ['auto', 'scroll'].includes(style.overflowX);
    const clips = (style: CSSStyleDeclaration) => ['hidden', 'clip'].includes(style.overflowX);
    for (const node of document.querySelectorAll<HTMLElement>('body *')) {
      if (node.getClientRects().length === 0 || node.closest(IGNORED)) continue;
      const style = getComputedStyle(node);
      if (style.clipPath !== 'none' || style.clip !== 'auto') continue;
      if (node.scrollWidth <= node.clientWidth + 1 || scrolls(style)) continue;
      // 原生文本输入即使计算样式为 clip，也可能由浏览器自身维护可键盘滚动的文字视口。
      // 必须实际验证 scrollLeft 能移动，并恢复现场；不按 input 类别一概排除。
      if (node instanceof HTMLInputElement && !node.disabled) {
        const previous = node.scrollLeft;
        node.scrollLeft = 0;
        const start = node.scrollLeft;
        node.scrollLeft = node.scrollWidth;
        const canScroll = Math.abs(node.scrollLeft - start) > 0;
        node.scrollLeft = previous;
        if (canScroll) continue;
      }
      if (clips(style)) {
        hits.push(`stuck:${label(node)}`);
        continue;
      }
      // 越出自身：看越过的那条边界是谁的——最近一个非 visible 的祖先若是裁切而非滚动，内容就看不全也滚不动
      const right = node.getBoundingClientRect().left + node.scrollWidth;
      for (
        let parent = node.parentElement;
        parent && parent !== document.body;
        parent = parent.parentElement
      ) {
        const parentStyle = getComputedStyle(parent);
        if (parentStyle.overflowX === 'visible') continue;
        if (clips(parentStyle) && right > parent.getBoundingClientRect().right + 1)
          hits.push(`stuck:${label(node)} in ${label(parent)}`);
        break;
      }
    }
    for (const slot of document.querySelectorAll<HTMLElement>(SLOTS)) {
      if (
        slot.getClientRects().length === 0 ||
        slot.closest(IGNORED) ||
        slot.closest('.ds-information-grid')
      )
        continue;
      const slotStyle = getComputedStyle(slot);
      if (
        ['auto', 'scroll'].includes(slotStyle.overflowX) &&
        slot.scrollWidth <= slot.clientWidth + 1
      )
        hits.push(`idle:${label(slot)}`);
      // 槽位不带水平内边距：滚动内容会滑进内边距、贴到格子边缘，相邻两格滚动后连成一片（留白用透明行内边框）
      if (parseFloat(slotStyle.paddingLeft) > 0 || parseFloat(slotStyle.paddingRight) > 0)
        hits.push(`padded:${label(slot)}`);
      // 过长单项只有一种处理：单行滚动，槽位不得折行
      if (!['nowrap', 'pre'].includes(slotStyle.whiteSpace) && slotStyle.display !== 'flex')
        hits.push(`wrap:${label(slot)}`);
    }
    return [...new Set(hits)];
  }, SCROLL_SLOT_SELECTOR);
}

export async function expectNoStuckOverflows(page: Page) {
  const hits = await collectStuckOverflows(page);
  expect(hits, `内容放不下却滚不动，或放得下却截获滚动手势：${JSON.stringify(hits)}`).toEqual([]);
}

/**
 * 弹层不出视口：可见的下拉、气泡、提示框整块在视口内（左右各容 1px 误差）。
 * 下拉面板按最长候选定宽，若不封顶，长候选会把面板撑出屏幕、对齐到右侧时文字整段落在视口左侧之外。
 */
export async function expectPopupsWithinViewport(page: Page) {
  const hits = await page.evaluate(() =>
    [
      ...document.querySelectorAll<HTMLElement>(
        '.ant-select-dropdown:not(.ant-select-dropdown-hidden), .ant-picker-dropdown:not(.ant-picker-dropdown-hidden), .ant-dropdown:not(.ant-dropdown-hidden), .ant-popover:not(.ant-popover-hidden), .ant-tooltip:not(.ant-tooltip-hidden), .ds-chart-tooltip'
      ),
    ]
      .filter(
        (node) => node.getClientRects().length > 0 && getComputedStyle(node).visibility !== 'hidden'
      )
      .map((node) => ({ node, rect: node.getBoundingClientRect() }))
      .filter(({ rect }) => rect.left < -1 || rect.right > window.innerWidth + 1)
      .map(
        ({ node, rect }) =>
          `${String(node.className).split(' ')[0]} x=${Math.round(rect.left)} w=${Math.round(rect.width)} vw=${window.innerWidth}`
      )
  );
  expect(hits, `弹层超出视口：${JSON.stringify(hits)}`).toEqual([]);
}

/** 图表全文提示：超长单项可以在有边界的原生提示框内滚到末尾。 */
export async function expectChartTooltipScrolls(page: Page) {
  const tooltip = page.locator('.ds-chart-tooltip').filter({ visible: true }).last();
  const result = await tooltip.evaluate((node) => {
    node.scrollLeft = node.scrollWidth;
    return {
      overflowing: node.scrollWidth > node.clientWidth + 1,
      atEnd: node.scrollLeft + node.clientWidth >= node.scrollWidth - 1,
      interactive: getComputedStyle(node).pointerEvents !== 'none',
    };
  });
  expect(result).toEqual({ overflowing: true, atEnd: true, interactive: true });
}

export async function expectNoTruncatedQueryControls(page: Page) {
  const escapedTags = await page
    .locator('.ds-filter-select .ant-select-selection-item')
    .evaluateAll((items) =>
      items
        .filter((item) => {
          const bounds = item.getBoundingClientRect();
          const control = item.closest('.ant-select')!.getBoundingClientRect();
          return bounds.left < control.left - 1 || bounds.right > control.right + 1;
        })
        .map((item) => item.textContent)
    );
  expect(escapedTags, '筛选标签必须约束在控件内，超长文字走统一滚动槽位').toEqual([]);
  const hits = await collectTruncatedQueryControls(page);
  expect(hits, `查询条控件内容被截断：${JSON.stringify(hits)}`).toEqual([]);
}

/** 与 components/ReactEcharts/chartOptions 的 CHART_HEIGHT 同源：十行清单的高度。 */
export const CHART_HEIGHT = 10 * 28 + 56;

/**
 * 图表高度契约：每个 ECharts 画布的可见高度都等于 CHART_HEIGHT——要么画布本身就是这个高度，
 * 要么画布更高但被同高的滚动视口裁住（清单类）。内容决定高度的图（data-chart-fit="content"）
 * 只要求不超过 CHART_HEIGHT；KPI 卡内的迷你趋势图不在此列。
 */
export async function collectOffHeightCharts(
  page: Page,
  expected = CHART_HEIGHT
): Promise<string[]> {
  return page.evaluate((target) => {
    const hits: string[] = [];
    for (const chart of document.querySelectorAll<HTMLElement>('[_echarts_instance_]')) {
      if (chart.closest('.kpi-card')) continue;
      const rect = chart.getBoundingClientRect();
      if (rect.width === 0) continue;
      const region = chart.closest<HTMLElement>('.ds-scroll-region');
      const visible = region ? Math.min(rect.height, region.clientHeight) : rect.height;
      const fitsContent = chart.dataset.chartFit === 'content';
      const fillsRow = chart.dataset.chartFit === 'fill';
      const ok = fitsContent
        ? visible <= target + 1
        : fillsRow
          ? visible >= target - 1
          : Math.abs(visible - target) <= 1;
      if (!ok) {
        const title = chart
          .closest('.ant-card, .chart-card')
          ?.querySelector('.ant-card-head-title, .chart-card__title')
          ?.textContent?.trim();
        hits.push(`${title ?? 'chart'}: ${Math.round(visible)}px`);
      }
    }
    return hits;
  }, expected);
}

export async function expectUniformChartHeight(page: Page) {
  const hits = await collectOffHeightCharts(page);
  expect(hits, `图表可见高度不统一（应为 ${CHART_HEIGHT}px）：${JSON.stringify(hits)}`).toEqual([]);
}

/**
 * 板块利用率契约：每个图表画布里真正画了东西的区域（各层 canvas 非透明像素的并集包围盒）
 * 在纵向和横向都要占到画布的 60% 以上；低于此值说明卡片框架留了大片空白，
 * 应改布局（占满整行）或让画布随内容定高，而不是把内容缩在中间。
 */
export interface ChartUtilization {
  title: string;
  vertical: number;
  horizontal: number;
}

export const CHART_UTILIZATION_FLOOR = 0.6;

export async function collectChartUtilization(page: Page): Promise<ChartUtilization[]> {
  return page.evaluate(() => {
    const results: { title: string; vertical: number; horizontal: number }[] = [];
    for (const chart of document.querySelectorAll<HTMLElement>('[_echarts_instance_]')) {
      if (chart.closest('.kpi-card')) continue;
      const canvases = [...chart.querySelectorAll('canvas')];
      if (canvases.length === 0) continue;
      const width = canvases[0].width;
      const height = canvases[0].height;
      if (!width || !height) continue;
      let minX = width,
        minY = height,
        maxX = -1,
        maxY = -1;
      const step = 4;
      for (const canvas of canvases) {
        const context = canvas.getContext('2d');
        if (!context) continue;
        const pixels = context.getImageData(0, 0, width, height).data;
        for (let y = 0; y < height; y += step) {
          for (let x = 0; x < width; x += step) {
            if (pixels[(y * width + x) * 4 + 3] > 0) {
              if (x < minX) minX = x;
              if (x > maxX) maxX = x;
              if (y < minY) minY = y;
              if (y > maxY) maxY = y;
            }
          }
        }
      }
      const title =
        chart
          .closest('.ant-card, .chart-card')
          ?.querySelector('.ant-card-head-title, .chart-card__title')
          ?.textContent?.trim() ?? 'chart';
      if (maxY < 0) {
        results.push({ title, vertical: 0, horizontal: 0 });
        continue;
      }
      results.push({
        title,
        vertical: (maxY - minY + step) / height,
        horizontal: (maxX - minX + step) / width,
      });
    }
    return results;
  });
}

export async function expectChartUtilization(page: Page, floor = CHART_UTILIZATION_FLOOR) {
  const results = await collectChartUtilization(page);
  const hits = results
    .filter((item) => item.vertical < floor || item.horizontal < floor)
    .map(
      (item) =>
        `${item.title}: 纵向 ${Math.round(item.vertical * 100)}% / 横向 ${Math.round(item.horizontal * 100)}%`
    );
  expect(
    hits,
    `图表板块利用率不足 ${floor * 100}%（内容缩在大片空白里）：${JSON.stringify(hits)}`
  ).toEqual([]);
}

/**
 * 页面加载、切换页签或刷新读取都不应弹出通知（FRONTEND-FEEDBACK）：
 * 通知只属于用户发起的写操作。扫描时页面尚无写操作，因此任何通知都是违规。
 */
export async function expectNoUnsolicitedNotifications(page: Page) {
  const notices = await page.evaluate(() =>
    Array.from(
      document.querySelectorAll<HTMLElement>('.ant-notification-notice, .ant-message-notice')
    ).map((node) => node.innerText.trim().replace(/\s+/g, ' '))
  );
  expect(notices, `页面未发生写操作却弹出了通知：${JSON.stringify(notices)}`).toEqual([]);
}

/**
 * 卡片内容不得越出卡片边界（FRONTEND-LAYOUT）：大数字、迷你图、画布、按钮等任何可见后代的
 * 左右缘都必须落在卡片内。自带横向滚动的区域（表格、ScrollRegion）不参与判断。
 */
export async function expectContentWithinCards(page: Page) {
  const hits = await page.evaluate(() => {
    const out: string[] = [];
    const scrolls = (el: Element, card: Element) => {
      for (let node = el.parentElement; node && node !== card; node = node.parentElement) {
        if (/(auto|scroll)/.test(getComputedStyle(node).overflowX)) return true;
      }
      return false;
    };
    for (const card of document.querySelectorAll(
      '.kpi-card, .chart-card, .ant-card, .ds-summary-strip'
    )) {
      const box = card.getBoundingClientRect();
      if (!box.width) continue;
      for (const el of card.querySelectorAll(
        'canvas, .ant-statistic, .ant-typography, button, .ant-tag, .kpi-card__chart, .ds-summary-strip__value'
      )) {
        const rect = el.getBoundingClientRect();
        if (!rect.width || scrolls(el, card)) continue;
        if (rect.right > box.right + 1.5 || rect.left < box.left - 1.5) {
          out.push(
            `${String((card as HTMLElement).className).split(' ')[0]} ⊃ ${String((el as HTMLElement).className || el.tagName).split(' ')[0]}`
          );
          break;
        }
      }
    }
    return out;
  });
  expect(hits, `卡片内容越出边界：${JSON.stringify(hits)}`).toEqual([]);
}

/**
 * 并排网格不留孤儿行（FRONTEND-LAYOUT）：ResponsiveGrid 与 SummaryStrip 的每一行项数相同，
 * 放不下时整体降为单列，而不是最后一行只剩一两项、右侧大片空白。
 */
export async function expectBalancedGrids(page: Page) {
  const hits = await page.evaluate(() => {
    const out: string[] = [];
    for (const track of document.querySelectorAll(
      '.ds-responsive-grid__track, .ds-summary-strip__track'
    )) {
      const rows = new Map<number, number>();
      for (const child of track.children) {
        const rect = child.getBoundingClientRect();
        if (!rect.width) continue;
        const key = Math.round(rect.top);
        rows.set(key, (rows.get(key) ?? 0) + 1);
      }
      const counts = [...rows.values()];
      // 均衡：各行项数相同，或 3 列以上时仅末行少一项（如 3+2）
      const columns = counts[0] ?? 0;
      const balanced = counts.every(
        (count, index) =>
          count === columns ||
          (index === counts.length - 1 && columns >= 3 && count === columns - 1)
      );
      if (!balanced) out.push(`${track.className} 行项数 ${counts.join('/')}`);
    }
    return out;
  });
  expect(hits, `网格出现孤儿行：${JSON.stringify(hits)}`).toEqual([]);
}

/**
 * 均衡分列契约（FRONTEND-LAYOUT）：指标条按各项内容固有宽度选列数——放得下就多列。
 * 在测量态下读出最宽项（与组件同一 CSS），按“n × 列宽 ≤ 容器宽度 + 行首缩进、且整除或 3 列以上末行只空一格”
 * 求出应有的最大列数，与实际渲染列数比较；不得因固定阈值让放得下的项强制单列或少列。
 */
export async function expectEfficientSummaryStrips(page: Page) {
  const hits = await page.evaluate(() => {
    const out: string[] = [];
    for (const track of document.querySelectorAll<HTMLElement>('.ds-summary-strip__track')) {
      const cells = [...track.children] as HTMLElement[];
      if (cells.length < 2 || !track.clientWidth) continue;
      const actual = getComputedStyle(track).gridTemplateColumns.split(' ').filter(Boolean).length;
      track.dataset.measuring = 'true';
      const itemWidth = Math.max(...cells.map((cell) => cell.getBoundingClientRect().width));
      const style = getComputedStyle(cells[1]);
      const inset =
        (Number.parseFloat(style.paddingInlineStart) || 0) +
        (Number.parseFloat(style.borderInlineStartWidth) || 0);
      delete track.dataset.measuring;
      let expected = 1;
      for (let columns = cells.length; columns > 1; columns -= 1) {
        const remainder = cells.length % columns;
        if (
          columns * itemWidth <= track.clientWidth + inset + 0.5 &&
          (remainder === 0 || (columns >= 3 && remainder === columns - 1))
        ) {
          expected = columns;
          break;
        }
      }
      if (actual !== expected)
        out.push(
          `${(track.textContent ?? '').trim().slice(0, 24)} 实际 ${actual} 列，应为 ${expected} 列`
        );
    }
    return out;
  });
  expect(hits, `指标条列数未按内容宽度均衡选择：${JSON.stringify(hits)}`).toEqual([]);
}

export async function expectNoDocumentOverflow(page: Page) {
  const contract = await page.evaluate(() => {
    const root = document.documentElement;
    const uncontained = Array.from(document.querySelectorAll<HTMLElement>('body *'))
      .filter((element) => {
        const rect = element.getBoundingClientRect();
        if (rect.right <= root.clientWidth + 1 && rect.left >= -1) return false;

        let parent = element.parentElement;
        while (parent && parent !== document.body) {
          const parentRect = parent.getBoundingClientRect();
          const overflowX = getComputedStyle(parent).overflowX;
          if (
            ['auto', 'hidden', 'scroll', 'clip'].includes(overflowX) &&
            parentRect.left >= -1 &&
            parentRect.right <= root.clientWidth + 1
          ) {
            return false;
          }
          parent = parent.parentElement;
        }
        return true;
      })
      .slice(0, 8)
      .map((element) => {
        const rect = element.getBoundingClientRect();
        return {
          element: `${element.tagName.toLowerCase()}${element.id ? `#${element.id}` : ''}${
            element.className && typeof element.className === 'string'
              ? `.${element.className.trim().split(/\s+/).slice(0, 3).join('.')}`
              : ''
          }`,
          left: Math.round(rect.left),
          right: Math.round(rect.right),
          width: Math.round(rect.width),
        };
      });
    return {
      clientWidth: root.clientWidth,
      scrollWidth: root.scrollWidth,
      uncontained,
    };
  });

  expect(
    contract.scrollWidth - contract.clientWidth,
    `根节点横向溢出：${JSON.stringify(contract, null, 2)}`
  ).toBeLessThanOrEqual(1);
}

/** 紧凑字段标签在上、值在下，长字段占满容器，不由长标签挤窄值槽位。 */
export async function expectReadableInformationFields(page: Page) {
  const failures = await page
    .locator('.ds-information-grid .ds-information-grid__field')
    .evaluateAll((fields) =>
      fields.flatMap((field) => {
        const label = field.querySelector('dt')!;
        const value = field.querySelector('dd')!;
        const grid = field.parentElement!;
        const bounds = field.getBoundingClientRect();
        if (!bounds.width || !bounds.height) return [];
        const labelBounds = label.getBoundingClientRect();
        const valueBounds = value.getBoundingClientRect();
        const problems = [];
        for (const node of [label, value, ...value.querySelectorAll<HTMLElement>('*')]) {
          if (!node.getClientRects().length || getComputedStyle(node).position === 'absolute')
            continue;
          const style = getComputedStyle(node);
          if (node.scrollWidth > node.clientWidth + 1) problems.push('详情内容水平溢出');
          if (['auto', 'scroll'].includes(style.overflowX)) problems.push('详情内容横向滚动');
          if (style.textOverflow === 'ellipsis') problems.push('详情内容省略');
          if (
            ['hidden', 'clip', 'auto', 'scroll'].includes(style.overflowY) &&
            node.scrollHeight > node.clientHeight + 1
          )
            problems.push('详情内容纵向裁切');
        }
        if (valueBounds.top < labelBounds.bottom - 1 || valueBounds.width < bounds.width - 1)
          problems.push('标签挤占值宽度');
        // 整行字段覆盖的是网格内容区：clientWidth 含网格自身左右内边距，需扣除后比较
        const gridStyle = getComputedStyle(grid);
        const contentWidth =
          grid.clientWidth - parseFloat(gridStyle.paddingLeft) - parseFloat(gridStyle.paddingRight);
        if (field.getAttribute('data-span') === 'full' && bounds.width < contentWidth - 2)
          problems.push('长字段未占整行');
        for (const content of [label, value]) {
          const walker = document.createTreeWalker(content, NodeFilter.SHOW_TEXT);
          for (let text = walker.nextNode(); text; text = walker.nextNode()) {
            if (!text.textContent?.trim()) continue;
            const range = document.createRange();
            range.selectNodeContents(text);
            for (let ancestor = text.parentElement; ancestor; ancestor = ancestor.parentElement) {
              const style = getComputedStyle(ancestor);
              const edge = ancestor.getBoundingClientRect();
              for (const rect of range.getClientRects()) {
                if (!rect.width || !rect.height) continue;
                if (
                  ['hidden', 'clip', 'auto', 'scroll'].includes(style.overflowX) &&
                  (rect.left < edge.left - 1 || rect.right > edge.right + 1)
                )
                  problems.push('详情文字横向不可见');
                if (
                  ['hidden', 'clip', 'auto', 'scroll'].includes(style.overflowY) &&
                  (rect.top < edge.top - 1 || rect.bottom > edge.bottom + 1)
                )
                  problems.push('详情文字纵向不可见');
              }
              if (ancestor.matches('.ds-information-grid')) break;
            }
          }
        }
        return problems.map((problem) => `${label.textContent}: ${problem}`);
      })
    );
  const gaps = await page.locator('.ds-information-grid__group').evaluateAll((groups) =>
    groups.flatMap((group) => {
      const last = group.lastElementChild!;
      const bounds = group.getBoundingClientRect();
      return bounds.width && last.getBoundingClientRect().right < bounds.right - 1
        ? [group.textContent]
        : [];
    })
  );
  expect(gaps, '长字段之间的短字段组不得留下空格背景').toEqual([]);
  const unbalanced = await page.locator('.ds-information-grid').evaluateAll((grids) =>
    grids.flatMap((grid) => {
      const problems: string[] = [];
      const children = [...grid.children];
      const firstFull = children.findIndex((child) => child.getAttribute('data-span') === 'full');
      if (
        firstFull >= 0 &&
        children.slice(firstFull).some((child) => child.matches('.ds-information-grid__group'))
      )
        problems.push(`整行字段切开短字段：${grid.textContent?.slice(0, 40)}`);
      for (const group of grid.querySelectorAll<HTMLElement>(
        ':scope > .ds-information-grid__group'
      )) {
        const columns = getComputedStyle(group).gridTemplateColumns.split(' ').length;
        const tops = [...group.children].map((child) =>
          Math.round(child.getBoundingClientRect().top)
        );
        const lastRow = tops.filter((top) => top === Math.max(...tops)).length;
        if (columns >= 3 && new Set(tops).size > 1 && lastRow === 1)
          problems.push(`短字段独占末行：${group.lastElementChild?.textContent?.slice(0, 40)}`);
      }
      return problems;
    })
  );
  expect(unbalanced, '详情网格须均衡分行').toEqual([]);
  expect(failures, '详情信息布局').toEqual([]);
}

/**
 * 相邻间距契约（FRONTEND-LAYOUT）：stack 相邻子项的盒间距必须等于父级 row-gap/column-gap；
 * 实测偏大说明子项自带的外边距穿透出来与 gap 叠加（非标准间距）。justify-between / 换行行堆
 * 的合法放大间距不参与判定。
 */
export async function expectConsistentStackSpacing(page: Page) {
  const hits = await page.evaluate(() => {
    const hits: string[] = [];
    const px = (value: string) => Number.parseFloat(value) || 0;
    const visible = (node: Element): node is HTMLElement =>
      node instanceof HTMLElement && node.getClientRects().length > 0;
    // stack 之外同样是“父级 gap 拥有间距”的容器：页面根、页头簇、详情说明区
    for (const stack of document.querySelectorAll<HTMLElement>(
      '.ds-layout-stack, .ds-app-page, .ds-app-page__header, .ds-entity-info'
    )) {
      if (stack.matches('.ds-layout-stack--wrap, .ds-layout-stack--justify-between')) continue;
      const style = getComputedStyle(stack);
      const isRow = style.flexDirection.startsWith('row');
      const expected = px(isRow ? style.columnGap : style.rowGap);
      const children = [...stack.children].filter(visible);
      for (let i = 0; i < children.length - 1; i += 1) {
        const a = children[i].getBoundingClientRect();
        const b = children[i + 1].getBoundingClientRect();
        // 行堆只比较同一行内的相邻项；跨行相邻项的“间距”是换行结果而非父级 gap
        if (isRow && Math.abs(b.top - a.top) > 1.5) continue;
        const gap = isRow ? b.left - a.right : b.top - a.bottom;
        if (Math.abs(gap - expected) > 1.5) {
          const label = children[i].dataset.layout ?? String(children[i].className).split(' ')[0];
          hits.push(
            `${stack.dataset.layout ?? String(stack.className).split(' ')[0]} 第${i + 1}项(${label})后实测 ${Math.round(gap)} ≠ gap ${Math.round(expected)}`
          );
        }
      }
    }
    return hits;
  });
  expect(
    hits,
    `stack 子项间距偏离父级 gap（外边距穿透或非标准间距）：${JSON.stringify(hits)}`
  ).toEqual([]);
}

/**
 * 页签按作用域落位（FRONTEND-LAYOUT）：决定整页内容的页签在页头区（ds-app-page__header，AppPage.tabList），
 * 决定卡片内容的页签在所属卡片内，浮层内的页签挂在弹层表面；不得裸放在正文背景上。
 */
export async function expectTabsWithinSurface(page: Page) {
  const hits = await page.evaluate(() =>
    Array.from(document.querySelectorAll<HTMLElement>('.ds-responsive-tabs'))
      .filter((tabs) => {
        if (tabs.closest('.ds-app-page__header, .ant-card, .ant-modal, .ant-drawer')) return false;
        // 页级视图切换：页签决定其后的整个内容区（多块表面），自带 choice-group 外框即表面；
        // 只有页签紧随一张卡（页签 + 单卡 = 全部内容）才说明它属于那张卡，应收进卡内
        const next = tabs.nextElementSibling;
        return Boolean(next?.matches('.ant-card, .ds-table-panel') && !next.nextElementSibling);
      })
      .map((tabs) => {
        const labels = [...tabs.querySelectorAll<HTMLElement>("[role='tab']")]
          .map((tab) => tab.innerText.trim().replace(/\s+/g, ' '))
          .join('/');
        const host = (tabs.parentElement?.className || tabs.parentElement?.tagName || '?')
          .toString()
          .split(' ')[0];
        return `${labels}（父级 ${host}）`;
      })
  );
  expect(hits, `页签未落在页头区或卡片内：${JSON.stringify(hits)}`).toEqual([]);
}
