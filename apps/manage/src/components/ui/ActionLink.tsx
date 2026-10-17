import { Link, type LinkProps } from 'react-router';
import type { ReactNode } from 'react';

import './ActionLink.css';

export type ActionLinkProps = Omit<LinkProps, 'children' | 'className'> & {
  /** 与按钮同样的“图标 + 文字”；窄屏时文字视觉隐藏、仅留图标，文字仍是可访问名称。 */
  icon: ReactNode;
  children: string;
  className?: string;
  /**
   * action（默认）：“详情”“编辑”等动作，窄屏与按钮一起收成仅图标；
   * name：文字就是对象名称（资源名、规则来源等），任何宽度都保留文字，否则只剩一个无从分辨的图标。
   */
  variant?: 'action' | 'name';
};

/**
 * 站内导航链接的唯一入口（表格“详情”、名称跳转等）：外观与文本按钮一致，
 * 保留真实链接语义（新标签打开、复制地址），不用 Button 冒充。
 */
export function ActionLink({
  icon,
  children,
  className,
  variant = 'action',
  ...linkProps
}: ActionLinkProps) {
  return (
    <Link
      {...linkProps}
      className={['ds-action-link', className].filter(Boolean).join(' ')}
      data-variant={variant}
    >
      <span className="ds-action-link__icon" aria-hidden="true">
        {icon}
      </span>
      <span className="ds-action-link__label">{children}</span>
    </Link>
  );
}
