import { designTokens, readCssColorToken } from '@/design/tokens';
import type { ChartColors } from './useChartColors';

export type GraphNodeTone = 'enabled' | 'disabled' | 'cycle' | 'current';

/**
 * 关系图节点是“带文字的徽标”而不是纯色块：表面色底 + 语义描边 + 正文文字，与标签/卡片同一视觉语言；
 * 状态只编码在描边与底色语义上，当前节点用主色实底反白。外观统一由这里产出，业务只按语义挑选。
 */
export function graphNodeTones(
  colors: ChartColors
): Record<GraphNodeTone, { itemStyle: Record<string, unknown>; labelColor: string }> {
  const infoBorder = readCssColorToken('--ds-color-info-border');
  const errorSurface = readCssColorToken('--ds-color-error-surface');
  const primaryForeground = readCssColorToken('--ds-color-primary-foreground');
  const base = { borderRadius: designTokens.radius.xs, borderWidth: 1 };
  return {
    enabled: {
      itemStyle: { ...base, color: colors.surfaceElevated, borderColor: infoBorder },
      labelColor: colors.text,
    },
    disabled: {
      itemStyle: { ...base, color: colors.surfaceMuted, borderColor: colors.border },
      labelColor: colors.textTertiary,
    },
    cycle: {
      itemStyle: { ...base, borderWidth: 2, color: errorSurface, borderColor: colors.error },
      labelColor: colors.text,
    },
    current: {
      itemStyle: { ...base, borderWidth: 2, color: colors.primary, borderColor: colors.primary },
      labelColor: primaryForeground,
    },
  };
}

/**
 * 全站图表的唯一外观来源：以 ECharts 主题（registerTheme）承载文字、色板、提示框、图例、坐标轴
 * 与各系列类型的默认样式，业务图表只声明数据与形态，不再逐图手写 tooltip/legend/axis 样式。
 *
 * 版式依据（dataviz）：细标记、2px 线、≥8px 点、系列间 2px 表面间隙、实线细网格、
 * 提示框用表面色 + 前景文字（不是反色块），文字只用前景 token。
 */
export function buildChartTheme(colors: ChartColors, mode: 'light' | 'dark') {
  const font = {
    fontFamily: designTokens.font.family,
    fontSize: designTokens.font.sizeXs,
  };
  const label = { ...font, color: colors.textSecondary, textBorderWidth: 0 };
  const hairline = { lineStyle: { color: colors.border, width: 1, type: 'solid' as const } };
  const axis = {
    axisLine: { show: true, ...hairline },
    axisTick: { show: false },
    splitLine: { show: true, ...hairline },
    splitArea: { show: false },
    axisLabel: { ...label, color: colors.textTertiary },
    nameTextStyle: { ...label, color: colors.textTertiary },
  };
  const surfaceGap = { borderColor: colors.surface, borderWidth: 2 };
  const seriesLabel = { ...label };
  return {
    darkMode: mode === 'dark',
    backgroundColor: 'transparent',
    color: colors.dataExtended,
    textStyle: { ...font, color: colors.text },
    title: { textStyle: { ...font, color: colors.text, fontWeight: 600 } },
    legend: {
      top: 0,
      icon: 'circle',
      itemWidth: 8,
      itemHeight: 8,
      itemGap: designTokens.space.md,
      textStyle: { ...label },
      pageTextStyle: { ...label },
      pageIconColor: colors.textSecondary,
      pageIconInactiveColor: colors.textDisabled,
    },
    tooltip: {
      className: 'ds-chart-tooltip',
      confine: true,
      enterable: true,
      backgroundColor: colors.surfaceElevated,
      borderColor: colors.border,
      borderWidth: 1,
      padding: [designTokens.space.sm, designTokens.space.md],
      textStyle: { ...font, color: colors.text },
      extraCssText: 'box-shadow: var(--ds-shadow-raised); border-radius: 8px;',
      axisPointer: {
        lineStyle: { color: colors.borderStrong, width: 1 },
        crossStyle: { color: colors.borderStrong, width: 1 },
        label: { ...label, backgroundColor: colors.surfaceMuted, color: colors.text },
        triggerEmphasis: false,
      },
    },
    // 轴指示器只负责提示框与行阴影带，不再替整行触发 emphasis（内置开关）：
    // 它的批量高亮会与鼠标所指图元的 focus 聚焦互相抵消，导致所指的点反而不亮；聚焦一律由所指图元自己触发
    axisPointer: {
      lineStyle: { color: colors.borderStrong, width: 1 },
      crossStyle: { color: colors.borderStrong, width: 1 },
      label: { ...label, backgroundColor: colors.surfaceMuted, color: colors.text },
      triggerEmphasis: false,
    },
    // 上/下/左随图例与轴名由共享入口（withSharedLayout）决定，这里只放没有图例、轴名时的基础留白
    grid: {
      left: designTokens.space.sm,
      right: designTokens.space.md,
      top: designTokens.space.sm,
      bottom: designTokens.space.sm,
      containLabel: true,
    },
    categoryAxis: { ...axis, splitLine: { show: false }, axisLine: { show: true, ...hairline } },
    // 轴名居中放在轴外侧（不放轴末：末端轴名会挤出网格、溢出卡片）
    valueAxis: {
      ...axis,
      axisLine: { show: false },
      nameLocation: 'middle',
      nameGap: designTokens.space.xxl,
    },
    logAxis: { ...axis, axisLine: { show: false } },
    timeAxis: { ...axis, splitLine: { show: false } },
    visualMap: {
      textStyle: { ...label },
      inRange: { color: [colors.surfaceMuted, colors.data[0]] },
      itemWidth: 12,
      itemHeight: 120,
    },
    line: {
      lineStyle: { width: 2 },
      symbol: 'circle',
      symbolSize: 8,
      showSymbol: false,
      // 折线走弧线；x 单调约束避免平滑在尖峰处过冲出假拐点
      smooth: true,
      smoothMonotone: 'x',
      label: seriesLabel,
      // 内置聚焦选项：多条线叠在一起时把被指的那条整体拎出来，其它线虚化
      emphasis: { focus: 'series' },
    },
    bar: {
      barMaxWidth: 28,
      barGap: '20%',
      barCategoryGap: '35%',
      itemStyle: { ...surfaceGap, borderRadius: designTokens.radius.xs },
      label: seriesLabel,
      // 内置聚焦选项：只保留被指的那根柱，虚化范围限定在本系列——同一行并排对照的其它系列（如用户数点）
      // 不受影响；轴触发提示框会把同一行的各系列图元一起点亮，行内互不虚化，整行就被突出出来
      emphasis: { focus: 'self', blurScope: 'series' },
    },
    pie: {
      radius: ['55%', '84%'],
      // 扇区四角走中档圆角：环形段两端收圆，靠 2px 表面间隙衬出分块
      itemStyle: { ...surfaceGap, borderRadius: designTokens.radius.md },
      label: { show: false },
      labelLine: { show: false },
      // 内置聚焦选项：只保留被指的那一片
      emphasis: { focus: 'self' },
    },
    scatter: {
      symbolSize: 10,
      itemStyle: { ...surfaceGap, opacity: 0.9 },
      label: seriesLabel,
      // 内置聚焦选项：只保留被指的那个点，虚化范围限定在本系列（与柱并排对照时不虚化柱）
      emphasis: { focus: 'self', blurScope: 'series' },
    },
    heatmap: {
      itemStyle: { ...surfaceGap },
      label: seriesLabel,
      // 内置聚焦选项：只保留被指的那个格
      emphasis: { focus: 'self' },
    },
    treemap: {
      breadcrumb: { show: false },
      roam: false,
      nodeClick: false,
      itemStyle: { ...surfaceGap, gapWidth: 2 },
      upperLabel: { show: false },
      label: { ...font, color: colors.surface, textBorderWidth: 0, overflow: 'truncate' },
      // 内置聚焦选项：只保留被指的那块
      emphasis: { focus: 'self' },
    },
    sankey: {
      nodeWidth: 16,
      nodeGap: 10,
      draggable: false,
      itemStyle: { ...surfaceGap },
      lineStyle: { color: 'gradient', curveness: 0.5, opacity: 0.35 },
      label: seriesLabel,
      // 库自带的聚焦选项：悬停节点/边时只保留相邻流向，其余按默认虚化（流向图的合适内置选项）
      emphasis: { focus: 'adjacency' },
    },
    graph: {
      roam: false,
      draggable: false,
      // 关系图节点是“带文字的框”而不是圆点：圆角矩形按文字量定宽，文字居中放在框内
      symbol: 'roundRect',
      lineStyle: { color: colors.borderStrong, width: 1.5, curveness: 0.1 },
      itemStyle: { ...surfaceGap },
      label: { ...label, color: colors.text },
      emphasis: { focus: 'adjacency' },
    },
  };
}
