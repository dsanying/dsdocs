import type { ReactNode } from 'react';
import { ScrollRegion } from '@/components/ui';
import { CHART_HEIGHT } from './chartOptions';

/**
 * 图表统一视口：固定为十行清单的高度（CHART_HEIGHT），内容更高时在区域内上下滚动，
 * 页面上所有图表卡片因此等高，不会有的图把卡片撑得很长。
 */
export function ChartViewport({ label, children }: { label: string; children: ReactNode }) {
  return (
    <ScrollRegion label={label} axis="y" style={{ maxHeight: CHART_HEIGHT }}>
      {children}
    </ScrollRegion>
  );
}
