import type { ReactNode } from 'react';

import './LongText.css';

export type LongTextProps = {
  /** 可访问名称（列名/字段名），读屏时说明这段可滚动文本是什么。 */
  label: string;
  children: ReactNode;
  className?: string;
};

/**
 * 表格单元格里的长说明/备注：只占一行、宽度跟列走（列宽由 `columnWidth.long` 决定），
 * 超过的部分在格内左右滚动——不换行把行撑到七八行，也不把列撑宽，更不省略隐藏。
 */
export function LongText({ label, children, className }: LongTextProps) {
  // 真溢出时才是滚动容器并进入 Tab 序列（overflowScroll 统一标记）
  return (
    <div
      aria-label={label}
      className={['ds-long-text', className].filter(Boolean).join(' ')}
      data-kind="long-text"
    >
      {children}
    </div>
  );
}
