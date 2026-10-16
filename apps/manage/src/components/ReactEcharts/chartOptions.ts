import { designTokens } from '@/design/tokens';
import { measureTextWidth } from '@/components/ui';
import {
  formatCompactNumber,
  formatCurrency,
  formatInteger,
  formatNumber,
  formatPercent,
} from '@/utils/number';

/**
 * 业务图表可用的少量组合件：数值格式统一走 utils/number（≤3 位小数），
 * 提示框只用 ECharts 自带 valueFormatter，坐标轴用模板串，不手写 HTML formatter。
 */
export const chartValueFormatters = {
  decimal: (value: unknown) =>
    typeof value === 'number' ? formatNumber(value) : String(value ?? ''),
  currency: (value: unknown) => formatCurrency(value as number),
  integer: (value: unknown) => formatInteger(value as number),
  compact: (value: unknown) => formatCompactNumber(Number(value)),
  percent: (value: unknown) => formatPercent(value as number),
} as const;

/** 坐标轴刻度：紧凑数值（1.2K / 3.4M），金额加前缀，避免长数字在窄轴上互相重叠。 */
export const chartAxisFormatters = {
  currency: (value: number) => `￥${formatCompactNumber(value)}`,
  compact: (value: number) => formatCompactNumber(value),
} as const;

/** 清单类图表的行高与一屏行数：一屏 10 行，超出在区域内滚动。 */
export const CHART_ROW_HEIGHT = 28;
export const CHART_VISIBLE_ROWS = 10;
/** 清单顶部数值轴 + 图例的固定余量。 */
export const CHART_LIST_CHROME = 56;

/** 全站图表画布的统一高度 = 十行清单的高度；非清单图（趋势/环形/热力/散点）也用这一值，卡片高度整齐。 */
export const CHART_HEIGHT = CHART_VISIBLE_ROWS * CHART_ROW_HEIGHT + CHART_LIST_CHROME;

/** 横向条形清单的完整画布高度：每行固定行高，外加坐标轴与图例余量。 */
export function barListHeight(
  rowCount: number,
  rowHeight = CHART_ROW_HEIGHT,
  chrome = CHART_LIST_CHROME,
  min = CHART_HEIGHT
) {
  return Math.max(min, rowCount * rowHeight + chrome);
}

/** 第二条数值轴（另一量纲）：不再画网格线，避免同一图里出现两套网格。 */
export const secondaryValueAxis = { splitLine: { show: false } } as const;

/**
 * 条末数值标签所需的网格右侧留白：量出最长标签的渲染宽度再加标签与条之间的间距，
 * 不用固定留白（固定值在窄卡片里放不下长金额，标签被画布裁掉）。
 */
export function valueLabelGridRight(labels: readonly string[]) {
  const font = `${designTokens.font.sizeXs}px ${designTokens.font.family}`;
  const widest = labels.reduce((max, text) => Math.max(max, measureTextWidth(text, font)), 0);
  return Math.ceil(widest) + designTokens.space.md;
}

/** 类目轴标签列的最大宽度：超过的名称截断并在提示框里看全名。 */
export const CATEGORY_LABEL_MAX_WIDTH = 140;

/**
 * 类目轴标签按内容定宽：量出最长名称的渲染宽度并封顶，标签列不预留固定空白
 * （固定 width 会在名称很短时留下大片左侧空白）。
 */
export function categoryAxisLabel(names: readonly string[], maxWidth = CATEGORY_LABEL_MAX_WIDTH) {
  const font = `${designTokens.font.sizeXs}px ${designTokens.font.family}`;
  const widest = names.reduce((max, name) => Math.max(max, measureTextWidth(name, font)), 0);
  // 渲染器截断时会扣除 1px；整数字宽（尤其中文姓名）必须保留此余量，避免刚好放得下也被省略。
  return { width: Math.min(Math.ceil(widest) + 1, maxWidth), overflow: 'truncate' } as const;
}
