import type { HTMLAttributes } from 'react';

import './FormGrid.css';

export type FormGridProps = HTMLAttributes<HTMLDivElement> & {
  /** 最多几列：默认 3；中等文本传 2，五项短字段的完整组合传 5。 */
  columns?: 2 | 3 | 5;
  /**
   * 字段的最小宽度档：`short` 给数字 + 单位、开关、候选很短的下拉（120px），
   * `medium`（默认）给日期时间与短文本（200px）。决定同样宽的表单里能并排几列。
   */
  field?: 'short' | 'medium';
  /**
   * 行间距：放 `Form.Item` 时由表单项自身的下边距隔开（默认 none）；
   * 放裸控件（列表编辑器里每一项的多个输入框）时传 `control`，换行后行与行之间留控件间距。
   */
  rowGap?: 'none' | 'control';
  /**
   * 首项是短标识（类型标签等）：按自身宽度占一列，其余两项均分剩余宽度，三项一行；
   * 放不下时标识独占一行、其余两项并排或单列。不让一个小标签吃掉三分之一行宽。
   */
  lead?: boolean;
};

/**
 * 表单字段并排的唯一容器：子项直接放 `Form.Item`，按表单自身宽度排成 3 / 2 / 1 列，
 * 不再用 Row / Col 按视口断点手排。条件组、富文本、列表编辑器等宽字段放在网格外独占一行。
 */
export function FormGrid({
  columns = 3,
  field = 'medium',
  rowGap = 'none',
  lead = false,
  className,
  children,
  ...props
}: FormGridProps) {
  return (
    <div {...props} className={['ds-form-grid', className].filter(Boolean).join(' ')}>
      <div
        className="ds-form-grid__track"
        data-columns={lead ? undefined : columns}
        data-field={lead ? undefined : field}
        data-lead={lead ? 'true' : undefined}
        data-row-gap={rowGap}
      >
        {children}
      </div>
    </div>
  );
}
