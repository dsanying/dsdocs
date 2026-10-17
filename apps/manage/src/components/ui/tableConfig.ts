import type { PaginationProps, TableProps } from 'antd';
import type { ColumnsType } from 'antd/es/table';

import { measureTextWidth, readBodyFont } from './measureText';
import i18n from '@/i18n';
import { designTokens } from '@/design/tokens';

export const DEFAULT_PAGE_SIZE = 10;
const DEFAULT_PAGE_SIZE_OPTIONS: PaginationProps['pageSizeOptions'] = [10, 20, 50, 100];

export type TablePaginationState = Pick<
  PaginationProps,
  'current' | 'pageSize' | 'total' | 'onChange' | 'onShowSizeChange' | 'disabled'
>;

/** 表格分页唯一入口；页面只传受控业务状态，不覆写展示机制。 */
export const buildTablePagination = (state: TablePaginationState = {}): PaginationProps => {
  const { current, pageSize, total, onChange, onShowSizeChange, disabled } = state;

  return {
    ...(current === undefined ? {} : { current }),
    ...(pageSize === undefined ? {} : { pageSize }),
    ...(total === undefined ? {} : { total }),
    ...(onChange === undefined ? {} : { onChange }),
    ...(onShowSizeChange === undefined ? {} : { onShowSizeChange }),
    ...(disabled === undefined ? {} : { disabled }),
    defaultPageSize: DEFAULT_PAGE_SIZE,
    showSizeChanger: true,
    pageSizeOptions: DEFAULT_PAGE_SIZE_OPTIONS,
    responsive: true,
    showLessItems: true,
    showTotal: (totalCount) =>
      i18n.t('app.pagination.totalData', {
        total: totalCount,
      }),
  };
};

export type TableScroll = NonNullable<TableProps<unknown>['scroll']>;

/**
 * 列宽标度：表格列只从这里取宽度（20 的倍数，整表看起来整齐），配合 `tableLayout="fixed"` 使用——
 * 固定布局下声明了宽度的列就是那么宽，**每张表恰好留一列不写宽度作为主列**（名称/主体/标题），
 * 剩余空间全部由主列吸收，长内容列不会再把后面的列挤到很远。
 */
export const columnWidth = {
  /** 拖动手柄、单个纯图标操作。 */
  handle: 40,
  /** ID、序号。 */
  id: 80,
  /** 状态、开关、枚举标签（最多五个汉字的 Tag 连同内边距刚好放下）、生效效果。 */
  badge: 120,
  /** 数量、金额（到万位带三位小数的货币）、百分比、优先级等数值。 */
  number: 140,
  /** 日期时间。 */
  time: 160,
  /** 名称、类型、渠道/模型名等短文本。 */
  name: 200,
  /** 标识符、哈希、权限键、路径等原子长值。 */
  code: 240,
  /** 来源说明、规则表达式等较长但仍单行的文本。 */
  text: 320,
  /** 集合（InlineList）与长说明（LongText）列。 */
  long: designTokens.layout.longColumnWidth,
  /** 操作列：文字动作每个 100，纯图标动作每个 40（窄屏时文字动作自动收成仅图标）。 */
  actions: (textCount: number, iconCount = 0) => textCount * 100 + iconCount * 40,
} as const;

/** 单元格左右内边距之和：与 theme.ts `cellPaddingInline = space.sm` 同源，改 token 自动同步。 */
const HEADER_CELL_CHROME = designTokens.space.sm * 2;
/** 排序图标在表头的占位宽度。 */
const HEADER_SORTER_CHROME = 24;
const WIDTH_STEP = 20;

/**
 * 列标题必须整体占一行：按标题文字的渲染宽度（表头字重 600）+ 内边距 + 排序图标算出下限，
 * 声明宽度不够时抬到该下限（向上取整到 20 的倍数）。标题不是字符串时按声明宽度。
 */
export function titleFitWidth(
  title: unknown,
  declared: number,
  sortable: boolean,
  renderedFont?: string,
  renderedTextWidth?: number
): number {
  if (typeof title !== 'string' || !title) return declared;
  const font = renderedFont ?? readBodyFont().replace(/^\S+/, '600');
  const needed =
    (renderedTextWidth ?? measureTextWidth(title, font)) +
    HEADER_CELL_CHROME +
    (sortable ? HEADER_SORTER_CHROME : 0);
  return Math.max(declared, Math.ceil(needed / WIDTH_STEP) * WIDTH_STEP);
}

/** 表头文字按真实 DOM 字形测量；画布 font 简写不包含 font-stretch、字距等生效属性。 */
export function measureHeaderText(header: HTMLElement | undefined): number | undefined {
  if (!header) return undefined;
  const walker = document.createTreeWalker(header, NodeFilter.SHOW_TEXT);
  let width = 0;
  while (walker.nextNode()) {
    if (!walker.currentNode.textContent?.trim()) continue;
    const range = document.createRange();
    range.selectNodeContents(walker.currentNode);
    width += range.getBoundingClientRect().width;
    range.detach();
  }
  return width;
}

/**
 * 短内容整列放得下的上限：最宽内容不超过 `text` 标度（320）的列按内容放宽，一格都不滚动；
 * 更长的内容才在格内左右滚动。
 */
export const SHORT_CONTENT_MAX_WIDTH = columnWidth.text;

/**
 * 按当前页内容量出一列真正需要的宽度：取“最宽单元格内容 + 内边距”并向上取整到 20，下限是标题宽度——
 * 内容比声明窄时收紧（多余空间还给主列，不再出现 200px 的列只放一个 “chat”）；
 * 内容比声明宽但仍是短内容（日期时间、键名、金额）时放宽到刚好放下，上限 `SHORT_CONTENT_MAX_WIDTH`，
 * 不让两三个字符的尾巴在格内滚动。
 * 只有全部由行内内容（文字、标签、按钮、行内比例值）组成的单元格参与测量；含块级子元素的列（操作组、集合、条件树）
 * 无法区分“内容多宽”和“格子多宽”，保持声明宽度。
 */
export function contentFitWidth(
  contentWidth: number | undefined,
  titleWidth: number,
  declared: number
): number {
  if (contentWidth === undefined) return declared;
  const needed = Math.ceil((contentWidth + HEADER_CELL_CHROME) / WIDTH_STEP) * WIDTH_STEP;
  return Math.min(Math.max(declared, SHORT_CONTENT_MAX_WIDTH), Math.max(titleWidth, needed));
}

/**
 * 整表放不下时的收紧宽度：少数长值不再把列抬到短内容上限，只保留标题、该列最宽的短内容，
 * 以及“不超过声明宽度”的内容宽度；长值在格内滚动。结果不超过常规适配宽度。
 */
export function squeezedFitWidth(
  contentWidths: readonly number[],
  titleWidth: number,
  declared: number
): number {
  const needed = contentWidths.map(
    (width) => Math.ceil((width + HEADER_CELL_CHROME) / WIDTH_STEP) * WIDTH_STEP
  );
  const widest = Math.max(0, ...needed);
  const shortWidest = Math.max(0, ...needed.filter((width) => width <= SHORT_CONTENT_MAX_WIDTH));
  const fit = contentFitWidth(
    contentWidths.length ? Math.max(...contentWidths) : undefined,
    titleWidth,
    declared
  );
  return Math.min(fit, Math.max(titleWidth, shortWidest, Math.min(declared, widest)));
}

/** 操作列只保留图标时的最小宽度：每个动作 32px、动作间距 8px 与单元格内边距 16px，向上取整到列宽步长，留出百分比列宽的亚像素余量。 */
export function actionIconOnlyWidth(count: number): number {
  return (
    Math.ceil((count * 32 + Math.max(0, count - 1) * 8 + HEADER_CELL_CHROME) / WIDTH_STEP) *
    WIDTH_STEP
  );
}

/**
 * 同一轮列宽测量先批量解除所有内容上限，再集中读取几何，最后批量恢复。
 * 主列量最宽子项，普通列只量行内内容；避免每格交替写样式与读布局造成整表重复排版。
 */
export function measureCellWidths(
  cells: readonly { cell: HTMLElement; intrinsic: boolean }[]
): Map<HTMLElement, number | undefined> {
  const widths = new Map<HTMLElement, number | undefined>();
  const measurable = cells.filter(({ cell, intrinsic }) => {
    const allowed =
      intrinsic ||
      [...cell.children].every((child) => {
        const display = getComputedStyle(child).display;
        return display.startsWith('inline') || display === 'contents';
      });
    if (!allowed) widths.set(cell, undefined);
    return allowed;
  });
  const original = measurable.flatMap(({ cell }) =>
    [...cell.children]
      .filter((child): child is HTMLElement => child instanceof HTMLElement)
      .map((child) => ({ child, width: child.style.width, maxWidth: child.style.maxWidth }))
  );
  for (const { child } of original) {
    child.style.width = 'max-content';
    child.style.maxWidth = 'none';
  }
  const range = document.createRange();
  try {
    for (const { cell, intrinsic } of measurable) {
      if (!intrinsic) {
        range.selectNodeContents(cell);
        widths.set(cell, range.getBoundingClientRect().width);
        continue;
      }
      let widest = 0;
      for (const node of cell.childNodes) {
        if (node instanceof HTMLElement)
          widest = Math.max(widest, node.getBoundingClientRect().width);
        else if (node.nodeType === Node.TEXT_NODE) {
          range.selectNodeContents(node);
          widest = Math.max(widest, range.getBoundingClientRect().width);
        }
      }
      widths.set(cell, widest);
    }
  } finally {
    range.detach();
    for (const { child, width, maxWidth } of original) {
      child.style.width = width;
      child.style.maxWidth = maxWidth;
    }
  }
  return widths;
}

/** 主列按短内容确定保底宽度；超长内容在列内滚动，不把保底宽度抬高到短内容上限。 */
export function flexColumnMinWidth(contentWidth: number | undefined, titleWidth: number): number {
  if (contentWidth === undefined) return Math.max(FLEX_COLUMN_MIN_WIDTH_BASE, titleWidth);
  const needed = Math.ceil((contentWidth + HEADER_CELL_CHROME) / WIDTH_STEP) * WIDTH_STEP;
  return Math.max(
    FLEX_COLUMN_MIN_WIDTH_BASE,
    titleWidth,
    needed <= SHORT_CONTENT_MAX_WIDTH ? needed : 0
  );
}

const FLEX_COLUMN_MIN_WIDTH_BASE = columnWidth.name;

/** 所有表头和正文统一从列起点阅读；保留用途名称以兼容已有列定义。 */
export const columnAlign = { text: 'left', number: 'left', control: 'left' } as const;

/** 默认正文对齐；不得从宽度或 action 键猜测内容用途。 */
type ColumnAlignment = NonNullable<ColumnsType<unknown>[number]['align']>;

export function defaultColumnAlign(_column: { align?: ColumnAlignment }): ColumnAlignment {
  return columnAlign.text;
}

/** 主列（不写宽度的那一列）的保底宽度：容器再窄也不会被其它列挤成零宽；共享 Table 按内容量出后经 `flexMinWidth` 抬高。 */
const FLEX_COLUMN_MIN_WIDTH = columnWidth.name;

/** 一列在像素总宽里的份额：声明宽度，主列按保底宽度（量过内容时用 `flexMinWidth`）计。 */
function columnPixelWidth(column: { width?: unknown; flexMinWidth?: number }): number {
  if (typeof column.width === 'number') return column.width;
  return column.flexMinWidth ?? FLEX_COLUMN_MIN_WIDTH;
}

/** 列宽之和（主列按保底宽度计）：容器比它窄时表格横向滚动的像素总宽。 */
export function columnsTotalWidth<TRow>(columns: ColumnsType<TRow> | undefined): number {
  return (columns ?? []).reduce(
    (sum, column) =>
      sum +
      ('children' in column && column.children?.length
        ? columnsTotalWidth(column.children)
        : columnPixelWidth(column)),
    0
  );
}

/**
 * 按列定义算出表格的最小宽度：声明宽度之和 + 每个主列的保底宽度。
 * 容器比它窄时表格在自身边界内横向滚动，各列回到声明宽度。
 */
export function tableScroll<TRow>(
  columns: ColumnsType<TRow> | undefined,
  y?: TableScroll['y'],
  auxiliaryWidth = 0
): TableScroll {
  const x = columnsTotalWidth(columns) + auxiliaryWidth;
  return { x: x || '100%', ...(y === undefined ? {} : { y }) };
}

/**
 * 把像素列宽换算成占总宽的百分比交给 Ant：表格宽度 = max(像素总宽, 容器宽)，
 * 容器更宽时多出的空间按各列原宽度比例摊给每一列（不再全堆到主列），容器更窄时百分比乘回像素总宽就是声明宽度。
 */
export function proportionalColumns<TRow>(
  columns: ColumnsType<TRow> | undefined,
  auxiliaryWidth = 0
): ColumnsType<TRow> | undefined {
  const total = columnsTotalWidth(columns) + auxiliaryWidth;
  if (!columns || total <= 0) return columns;
  const convert = (entries: ColumnsType<TRow>): ColumnsType<TRow> =>
    entries.map((sourceColumn) => {
      // 分组不是数据列：总宽和比例均按叶列计算，不给组容器另加宽度。
      if ('children' in sourceColumn && sourceColumn.children?.length) {
        const { width: _groupWidth, ...group } = sourceColumn;
        return { ...group, children: convert(sourceColumn.children) };
      }
      // flexMinWidth 只用于像素总宽计算，不交给 Ant
      const { flexMinWidth: _flexMinWidth, ...column } = sourceColumn as typeof sourceColumn & {
        flexMinWidth?: number;
      };
      const flex = typeof column.width !== 'number';
      return {
        ...column,
        width: `${(columnPixelWidth(sourceColumn) / total) * 100}%`,
        // 主列在表头上打标，运行时门禁据此区分“吸收剩余空间的主列”与“按内容收紧的声明列”
        ...(flex
          ? {
              onHeaderCell: (data: unknown, index?: number) => ({
                ...(column.onHeaderCell?.(data as never, index as never) ?? {}),
                'data-flex-column': 'true',
              }),
            }
          : {}),
      };
    });
  return convert(columns);
}
