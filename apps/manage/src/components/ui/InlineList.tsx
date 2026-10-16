import type { Key, ReactNode } from 'react';

import { sortByText } from '@/utils/collation';

import './InlineList.css';

export type InlineListItem = {
  key: Key;
  /** 用于排序的可读文案。 */
  text: string;
};

export type InlineListProps<T extends InlineListItem> = {
  /** 可访问名称：说明这一行是什么（如“标签”“权限”）。 */
  label: string;
  items: readonly T[];
  renderItem: (item: T) => ReactNode;
  /**
   * 顺序："text"（默认）按统一比较器排，同样一组内容在任何地方顺序都一样；
   * "given" 只在顺序本身有含义时使用（如“生效结果在前、来源在后”），调用方要在注释里说明为什么。
   */
  order?: 'text' | 'given';
  className?: string;
};

/**
 * 表格单元格与紧凑区域里的标签/短项集合：只占一行，放不下时在行内左右滚动——
 * 不折叠成 +N（隐藏信息），也不换行摊开（把行撑高、整表参差不齐）；默认按文案排序。
 */
export function InlineList<T extends InlineListItem>({
  label,
  items,
  renderItem,
  order = 'text',
  className,
}: InlineListProps<T>) {
  const ordered = order === 'text' ? sortByText(items, (item) => item.text) : items;
  // 真溢出时才是滚动容器并进入 Tab 序列（overflowScroll 统一标记）
  return (
    <div
      role="list"
      aria-label={label}
      className={['ds-inline-list', className].filter(Boolean).join(' ')}
      data-kind="inline-list"
      data-order={order}
    >
      {ordered.map((item) => (
        <div key={item.key} role="listitem" className="ds-inline-list__item">
          {renderItem(item)}
        </div>
      ))}
    </div>
  );
}
