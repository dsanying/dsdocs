import type { ReactNode } from 'react';

import './ResponsiveTableToolbar.css';

export type ResponsiveActionsProps = {
  children: ReactNode;
  className?: string;
  /** 页头、卡片 extra、表单/步骤底部收尾操作靠右（默认）；表格行内和字段旁局部操作靠左。 */
  justify?: 'start' | 'end';
};

/**
 * 并列操作（Button/IconButton/ActionLink）的唯一容器：flex 垂直居中、统一 8px 间距、
 * 窄屏按完整控件换行；页面不得用 div/Space/空 span 自行拼排导致上下错位与间距不一。
 */
export function ResponsiveActions({
  children,
  className,
  justify = 'end',
}: ResponsiveActionsProps) {
  return (
    <div
      className={['ds-responsive-actions', className].filter(Boolean).join(' ')}
      data-layout="responsive-actions"
      data-justify={justify}
    >
      {children}
    </div>
  );
}
