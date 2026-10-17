import { designTokens } from '@/design/tokens';
import {
  BarChart,
  GraphChart,
  HeatmapChart,
  LineChart,
  PieChart,
  ScatterChart,
  TreemapChart,
} from 'echarts/charts';
import {
  DatasetComponent,
  GridComponent,
  LegendComponent,
  TooltipComponent,
  VisualMapComponent,
} from 'echarts/components';
import { init, registerTheme, use as registerEChartsModules } from 'echarts/core';
import type { ECharts, EChartsOption } from 'echarts';
import { LabelLayout } from 'echarts/features';
import { CanvasRenderer } from 'echarts/renderers';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useThemeStore } from '@/stores/useThemeStore';
import { buildChartTheme } from './chartTheme';
import { useChartColors } from './useChartColors';
import './ReactEcharts.css';

// 所有业务图表统一从此处注册能力，避免每个图表分块都打入完整 ECharts。
// 不注册 DataZoom / Toolbox：图表不提供缩放、放大与类型切换，形态与范围由页面筛选决定。
registerEChartsModules([
  BarChart,
  GraphChart,
  HeatmapChart,
  LineChart,
  PieChart,
  ScatterChart,
  TreemapChart,
  DatasetComponent,
  GridComponent,
  LegendComponent,
  TooltipComponent,
  VisualMapComponent,
  CanvasRenderer,
  LabelLayout,
]);

interface ReactEChartsProps {
  option: EChartsOption;
  style?: React.CSSProperties;
  className?: string;
  /** 内容决定高度的图（如正方形格热力图）为 content；视口随所在行高伸展的图（如继承图与操作面板并排）为 fill，可见高度不低于 CHART_HEIGHT。 */
  'data-chart-fit'?: 'content' | 'fill';
  notMerge?: boolean;
  lazyUpdate?: boolean;
  onChartReady?: (chart: ECharts) => void;
}

type AnyRecord = Record<string, unknown>;
const asList = <T,>(value: T | T[] | undefined): T[] =>
  value === undefined ? [] : Array.isArray(value) ? value : [value];

/** 图例一行的高度（顶部固定一行，放不下时内置分页）与坐标轴轴名一行的高度。 */
const LEGEND_ROW = designTokens.space.xxxl;
const AXIS_NAME_ROW = designTokens.space.xxxl;
const AXIS_NAME_COLUMN = designTokens.space.xxxl + designTokens.space.sm;

/**
 * 全部图表统一的版式（业务 option 只声明数据与形态，位置由这里决定）：
 * - 图例固定在绘图区上方一行、居中，条目放不下时用内置分页图例左右翻页（ECharts 按 option 的 `type` 决定组件实现，主题改不了）；
 * - 直角坐标网格按"有无图例 / 有无轴名"留出上、下、左的固定行高，其余留白取主题默认；
 * - 环形图圆心随图例存在与否下移，保证图例与圆环不重叠；
 * - 例外：纯环形图画布明显横宽（宽高比 ≥ WIDE_PIE_ASPECT，常见于单列整行的卡片）时，圆环本身是正方形，
 *   上方图例会让左右留下大片空白——此时图例改为右侧竖排、圆心左移，圆环与图例共同占满画布。
 * 共享层组件（BarList 等）可先给出自己的值，这里只补缺省。
 */
const WIDE_PIE_ASPECT = 1.6;

function withSharedLayout(option: EChartsOption, wide = false): EChartsOption {
  const next: AnyRecord = { ...(option as AnyRecord) };
  const series = asList(option.series as AnyRecord | AnyRecord[] | undefined);
  const pieOnly = series.length > 0 && series.every((item) => item.type === 'pie');
  const names = [
    ...new Set(
      series
        .map((item) => item.name)
        .filter((name): name is string => typeof name === 'string' && name.length > 0)
    ),
  ];
  // 分类色必须能被识别：多命名系列及环形分片默认提供图例；显式配置仍由调用方决定。
  const defaultLegend = pieOnly ? {} : names.length > 1 ? { data: names } : undefined;
  const legends = asList((option.legend ?? defaultLegend) as AnyRecord | AnyRecord[] | undefined);
  const legendShown = legends.some((legend) => legend.show !== false);
  const sideLegend = wide && pieOnly && legendShown;
  if (legends.length) {
    next.legend = legends.map(
      ({ top: _top, bottom: _bottom, left: _left, right: _right, orient: _orient, ...rest }) =>
        sideLegend
          ? {
              type: 'scroll',
              orient: 'vertical',
              top: 'middle',
              bottom: 'auto',
              right: designTokens.space.xl,
              left: 'auto',
              ...rest,
            }
          : {
              type: 'scroll',
              orient: 'horizontal',
              top: 0,
              bottom: 'auto',
              left: 'center',
              right: 'auto',
              ...rest,
            }
    );
  }
  const xAxes = asList(option.xAxis as AnyRecord | AnyRecord[] | undefined);
  const yAxes = asList(option.yAxis as AnyRecord | AnyRecord[] | undefined);
  const hasCartesian = xAxes.length > 0 || yAxes.length > 0;
  const axesHidden = hasCartesian && [...xAxes, ...yAxes].every((axis) => axis.show === false);
  if (hasCartesian && !axesHidden) {
    const grids = asList(option.grid as AnyRecord | AnyRecord[] | undefined);
    const grid = grids[0] ?? {};
    const geometry = grid.width !== undefined || grid.height !== undefined;
    if (!geometry) {
      next.grid = {
        ...grid,
        top: grid.top ?? (legendShown ? LEGEND_ROW : designTokens.space.sm),
        bottom:
          grid.bottom ?? (xAxes.some((axis) => axis.name) ? AXIS_NAME_ROW : designTokens.space.sm),
        ...(yAxes.some((axis) => axis.name) && grid.left === undefined
          ? { left: AXIS_NAME_COLUMN }
          : {}),
      };
    }
  }
  if (series.some((item) => item.type === 'pie')) {
    const center = sideLegend ? ['38%', '50%'] : ['50%', legendShown ? '56%' : '50%'];
    next.series = series.map((item) =>
      item.type === 'pie' && item.center === undefined ? { ...item, center } : item
    );
  }
  return next as EChartsOption;
}

/**
 * ECharts 的唯一 React 入口：按当前主题注册并挂载 dsdocs-light/dark 图表主题，
 * 业务只传数据形态的 option；主题切换时重建实例并重新通知 onChartReady。
 */
const ReactECharts = React.forwardRef<ECharts | null, ReactEChartsProps>(
  (
    {
      option,
      style,
      className,
      notMerge = false,
      lazyUpdate = false,
      onChartReady,
      'data-chart-fit': chartFit,
    },
    ref
  ) => {
    const mergedStyle: React.CSSProperties = { width: '100%', height: 400, ...style };
    const containerRef = useRef<HTMLDivElement>(null);
    const chartRef = useRef<ECharts | null>(null);
    const mode = useThemeStore((s) => s.mode);
    const colors = useChartColors();
    const themeName = useMemo(() => {
      const name = `dsdocs-${mode}`;
      registerTheme(name, buildChartTheme(colors, mode));
      return name;
    }, [colors, mode]);
    const [instance, setInstance] = useState<ECharts | null>(null);
    // 画布是否明显横宽：决定环形图图例放上方还是右侧（见 withSharedLayout）
    const [wide, setWide] = useState(false);

    useEffect(() => {
      if (!containerRef.current) return;
      // ECharts v6 的完整入口与 core 入口分别声明了私有字段，公开实例类型因此不兼容；运行时是同一套 API。
      const chart = init(containerRef.current, themeName) as unknown as ECharts;
      chartRef.current = chart;
      setInstance(chart);
      if (typeof ref === 'function') ref(chart);
      else if (ref) ref.current = chart;
      return () => {
        chart.dispose();
        if (chartRef.current === chart) chartRef.current = null;
      };
    }, [ref, themeName]);

    useEffect(() => {
      if (instance && onChartReady) onChartReady(instance);
    }, [instance, onChartReady]);

    useEffect(() => {
      instance?.setOption(withSharedLayout(option, wide), { notMerge, lazyUpdate });
    }, [instance, option, notMerge, lazyUpdate, wide]);

    // 容器尺寸变化（不只是 window）时重排画布。
    useEffect(() => {
      if (!instance || !containerRef.current) return;
      const handleResize = () => {
        instance.resize();
        const box = containerRef.current?.getBoundingClientRect();
        if (box && box.height > 0) setWide(box.width / box.height >= WIDE_PIE_ASPECT);
      };
      handleResize();
      const observer = new ResizeObserver(handleResize);
      observer.observe(containerRef.current);
      window.addEventListener('resize', handleResize);
      return () => {
        observer.disconnect();
        window.removeEventListener('resize', handleResize);
      };
    }, [instance]);

    return (
      <div ref={containerRef} className={className} style={mergedStyle} data-chart-fit={chartFit} />
    );
  }
);

ReactECharts.displayName = 'ReactECharts';

export default ReactECharts;
