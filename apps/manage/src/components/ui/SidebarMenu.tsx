import { Menu, type MenuProps } from 'antd';
import type { AriaAttributes, HTMLAttributes } from 'react';
import './SidebarMenu.css';

export type SidebarMenuItem =
  | (Exclude<NonNullable<MenuProps['items']>[number], null> &
      AriaAttributes &
      Pick<HTMLAttributes<HTMLElement>, 'role' | 'tabIndex'>)
  | null;
export type SidebarMenuProps = Omit<
  MenuProps,
  'mode' | 'theme' | 'className' | 'style' | 'inlineCollapsed' | 'items'
> & {
  items?: SidebarMenuItem[];
  compact?: boolean;
};

/** 上下两区只改变位置；几何、颜色与交互均由同一个 Ant Menu 和主题提供。 */
export function SidebarMenu({ compact = false, ...props }: SidebarMenuProps) {
  return (
    <Menu
      {...props}
      mode="inline"
      theme="light"
      inlineCollapsed={compact}
      className="ds-sidebar-menu"
    />
  );
}
