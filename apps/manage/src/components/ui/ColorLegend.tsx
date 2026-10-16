import type { ReactNode } from 'react';

import './ColorLegend.css';

/** 色块可用的颜色 token：与 useChartColors 读取的语义色同名，图例才和图上实际取色同源。 */
export type ColorLegendToken =
  | 'primary'
  | 'info'
  | 'info-surface'
  | 'success'
  | 'warning'
  | 'error'
  | 'surface-muted'
  | 'border-strong';

const SWATCH_COLOR: Record<ColorLegendToken, string> = {
  primary: 'var(--ds-color-primary)',
  info: 'var(--ds-color-info)',
  'info-surface': 'var(--ds-color-info-surface)',
  success: 'var(--ds-color-success)',
  warning: 'var(--ds-color-warning)',
  error: 'var(--ds-color-error)',
  'surface-muted': 'var(--ds-color-surface-muted)',
  'border-strong': 'var(--ds-color-border-strong)',
};

export type ColorLegendItem = {
  key: string;
  label: ReactNode;
  /** 色块颜色：与图上实际取色同源的 token，图例才不会和图对不上。 */
  token: ColorLegendToken;
};

export type ColorLegendProps = {
  items: ColorLegendItem[];
  label: string;
};

/**
 * 自绘图（关系图、层级图等 ECharts 图例不覆盖的场景）的图例：色块 + 文字，
 * 色块直接引用图上取色的同一个 token，不用状态标签之类另一套配色去“模仿”。
 */
export function ColorLegend({ items, label }: ColorLegendProps) {
  return (
    <ul className="ds-color-legend" aria-label={label} data-kind="color-legend">
      {items.map((item) => (
        <li key={item.key} className="ds-color-legend__item">
          <span
            className="ds-color-legend__swatch"
            style={{ background: SWATCH_COLOR[item.token] }}
            aria-hidden="true"
          />
          <span>{item.label}</span>
        </li>
      ))}
    </ul>
  );
}
