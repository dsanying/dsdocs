import { Card, type CardProps } from 'antd';
import type { ReactNode } from 'react';

import './TablePanel.css';

export type TablePanelProps = {
  /** 面板标题；不传则为无标题面板（列表页）。 */
  title?: ReactNode;
  /** 标题行右侧操作组。 */
  extra?: CardProps['extra'];
  /** 查询条（QueryForm），位于表格上方。 */
  query?: ReactNode;
  /** 表格上方的汇总（SummaryStrip / InformationFieldGrid 等）。 */
  summary?: ReactNode;
  /** 唯一的 DataTable。 */
  children: ReactNode;
  /** 已处于页签面板等外框之内时不再套卡片，只保留内部纵向布局。 */
  embedded?: boolean;
  className?: string;
};

/**
 * “框里放完整表格”的唯一实现（参照 shadcn Tasks / Tremor Table 的版式）：
 * 卡片标题行 → 查询条/工具栏 → 表格 → 分页，三者只以 16px 间距分隔；
 * 表格自身不填充表头、不画外框，只有表头底线与行间 1px 线，因此放在卡片内边距里不会形成第二个“小框”。
 */
export function TablePanel({
  title,
  extra,
  query,
  summary,
  children,
  embedded,
  className,
}: TablePanelProps) {
  const body = (
    <div className="ds-table-panel__body">
      {query ? <div className="ds-table-panel__query">{query}</div> : null}
      {summary}
      {children}
    </div>
  );
  if (embedded) {
    return (
      <div
        className={['ds-table-panel', 'ds-table-panel--embedded', className]
          .filter(Boolean)
          .join(' ')}
      >
        {body}
      </div>
    );
  }
  return (
    <Card
      title={title}
      extra={extra}
      variant="borderless"
      className={['ds-table-panel', className].filter(Boolean).join(' ')}
    >
      {body}
    </Card>
  );
}
