import { Children, type HTMLAttributes } from 'react';

import './ResponsiveGrid.css';

/**
 * 网格版式：cards 指标卡（最小 280px），charts 图表（最小 400px），
 * wide-narrow / narrow-wide 两项按 2:1 / 1:2 并排（窄项最小 320px），
 * split 两栏等宽（每栏最小 420px，顶端对齐，适合表单 + 预览、树 + 明细）。
 */
export type ResponsiveGridLayout = 'cards' | 'charts' | 'wide-narrow' | 'narrow-wide' | 'split';

export type ResponsiveGridProps = HTMLAttributes<HTMLDivElement> & {
  layout: ResponsiveGridLayout;
};

/**
 * 卡片与图表的唯一并排容器：按自身可用宽度（容器查询）选择能整除子项数的列数，
 * 放不下时整体降为单列，不按视口断点硬塞多列，也不留孤儿行。子项直接放卡片，不再包 Col。
 */
export function ResponsiveGrid({ layout, className, children, ...props }: ResponsiveGridProps) {
  const count = Children.toArray(children).length;

  return (
    <div {...props} className={['ds-responsive-grid', className].filter(Boolean).join(' ')}>
      <div className="ds-responsive-grid__track" data-layout={layout} data-count={count}>
        {children}
      </div>
    </div>
  );
}
