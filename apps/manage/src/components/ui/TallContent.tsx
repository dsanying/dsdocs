import type { ReactNode } from 'react';

import './TallContent.css';

export type TallContentProps = {
  /** 可访问名称（列名/字段名），读屏时说明这段可滚动内容是什么。 */
  label: string;
  children: ReactNode;
  className?: string;
};

/**
 * 表格单元格里的多行结构化内容（条件树、JSON 备注）：直接写在格内、宽度跟列走，
 * 高度封顶在 `--ds-layout-cell-max-height`，超出部分在格内上下滚动——不再折叠成“N 个字段 + 查看”再弹窗。
 * 单行长文本用 `LongText`（左右滚动），多行内容用本组件（上下滚动）。
 */
export function TallContent({ label, children, className }: TallContentProps) {
  return (
    <div
      tabIndex={0}
      aria-label={label}
      className={['ds-tall-content', className].filter(Boolean).join(' ')}
      data-kind="tall-content"
    >
      {children}
    </div>
  );
}
