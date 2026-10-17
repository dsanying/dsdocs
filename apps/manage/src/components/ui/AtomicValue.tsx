import type { CSSProperties, ReactNode } from 'react';

import { CopyableValue } from './CopyableValue';

import './AtomicValue.css';

export type AtomicValueProps = {
  /** 原值；未传 children 时直接显示。 */
  text: string;
  /** 可见内容（如高亮后的片段）；缺省显示原值。 */
  children?: ReactNode;
  /** 为标识符、哈希、密钥标识等需要精确复用的原值提供统一复制入口；空值占位符不可复制。 */
  copyable?: boolean;
  className?: string;
  style?: CSSProperties;
};

const EMPTY_PLACEHOLDER = '-';

/**
 * 标识符、哈希、ID、路径、名称等单行值的统一入口：只占一行、宽度跟着容器走，
 * 放不下时在自身范围内左右滚动——全文始终在页面上，不省略、不靠悬停 Tooltip 才能看全。
 * 是否溢出由 overflowScroll 统一标记（真溢出才可滚动、可键盘聚焦）。
 */
export function AtomicValue({ text, children, copyable, className, style }: AtomicValueProps) {
  const value = (
    <span style={style} className={['ds-atomic-value', className].filter(Boolean).join(' ')}>
      {children ?? text}
    </span>
  );

  if (!copyable || !text || text === EMPTY_PLACEHOLDER) return value;
  return <CopyableValue text={text}>{value}</CopyableValue>;
}
