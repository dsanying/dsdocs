import type { ECharts, EChartsOption } from 'echarts';
import React, { useCallback, useMemo, useRef } from 'react';
import { designTokens } from '@/design/tokens';
import ReactECharts from './index';
import { ChartViewport } from './ChartViewport';
import {
  barListHeight,
  CHART_LIST_CHROME,
  categoryAxisLabel,
  chartAxisFormatters,
  chartValueFormatters,
  valueLabelGridRight,
} from './chartOptions';

export interface BarListSeries {
  name: string;
  data: number[];
}

export interface BarListProps {
  /** 可访问名称（滚动区域的 aria-label）。 */
  label: string;
  /** 类目（行），按业务给定顺序自上而下显示。 */
  categories: string[];
  series: BarListSeries[];
  /** 多系列时是否堆叠在同一条上。 */
  stacked?: boolean;
  /** 数值格式：默认金额。 */
  valueKind?: keyof typeof chartValueFormatters;
  /** 单系列时在条末直接标值。 */
  showValueLabel?: boolean;
  /** 点击已有排行项，返回业务原顺序的类目与索引；不改变图表视觉。 */
  onSelect?: (category: string, index: number) => void;
}

/**
 * 横向条形清单：所有行都画出来，视口固定为十行高度（CHART_HEIGHT）、其余上下滚动查看；
 * 数值轴放在顶部随视口留下，条末标值让每行自带数字。
 */
export function BarList({
  label,
  categories,
  series,
  stacked,
  valueKind = 'currency',
  showValueLabel,
  onSelect,
}: BarListProps) {
  const clickBinding = useRef<
    | { chart: ECharts; handler: (event: { componentType?: string; dataIndex?: number }) => void }
    | undefined
  >(undefined);
  const handleChartReady = useCallback(
    (chart: ECharts) => {
      const previous = clickBinding.current;
      if (previous && !previous.chart.isDisposed()) previous.chart.off('click', previous.handler);
      clickBinding.current = undefined;
      if (!onSelect) return;
      const handler = (event: { componentType?: string; dataIndex?: number }) => {
        if (event.componentType !== 'series' || !Number.isInteger(event.dataIndex)) return;
        const index = categories.length - 1 - event.dataIndex!;
        if (index >= 0 && index < categories.length) onSelect(categories[index], index);
      };
      chart.on('click', handler);
      clickBinding.current = { chart, handler };
    },
    [categories, onSelect]
  );
  const valueFormatter = chartValueFormatters[valueKind];
  const axisFormatter =
    valueKind === 'currency' ? chartAxisFormatters.currency : chartAxisFormatters.compact;
  // 横向条形自下而上绘制：反转后第一项在最上面
  const reversed = useMemo(() => [...categories].reverse(), [categories]);
  const option: EChartsOption = useMemo(
    () => ({
      tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' }, valueFormatter },
      legend: series.length > 1 ? {} : { show: false },
      grid: {
        top:
          series.length > 1
            ? designTokens.space.xxxl + designTokens.space.lg
            : designTokens.space.xxl,
        // 单系列标值时按最长数值标签留白，保证条末数字完整可见；否则保留数值轴末端刻度的常规留白
        right:
          showValueLabel && series.length === 1
            ? valueLabelGridRight(series[0].data.map((value) => String(valueFormatter(value))))
            : designTokens.space.xxxl + designTokens.space.xl,
        left: 0,
      },
      xAxis: {
        type: 'value',
        position: 'top',
        axisLabel: { formatter: axisFormatter, hideOverlap: true },
      },
      yAxis: { type: 'category', data: reversed, axisLabel: categoryAxisLabel(reversed) },
      series: series.map((item) => ({
        name: item.name,
        type: 'bar',
        ...(stacked ? { stack: 'total' } : {}),
        data: [...item.data].reverse(),
        ...(showValueLabel && series.length === 1
          ? {
              label: {
                show: true,
                position: 'right',
                formatter: (params: { value: unknown }) => valueFormatter(params.value),
              },
            }
          : {}),
      })),
    }),
    [reversed, series, stacked, valueFormatter, axisFormatter, showValueLabel]
  );
  const fullHeight = barListHeight(
    categories.length,
    undefined,
    series.length > 1 ? CHART_LIST_CHROME + 32 : CHART_LIST_CHROME
  );
  return (
    <ChartViewport label={label}>
      <ReactECharts
        option={option}
        style={{ height: fullHeight }}
        onChartReady={handleChartReady}
      />
    </ChartViewport>
  );
}
