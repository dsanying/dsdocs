import { LogoutOutlined, UserOutlined } from '@ant-design/icons';
import { Avatar, Dropdown, type MenuProps, type MenuRef } from 'antd';
import { useRef, useState, type RefAttributes, type ReactNode } from 'react';
import { designTokens } from '@/design/tokens';
import { SidebarMenu } from './SidebarMenu';

export type AccountLogout = { label: ReactNode; disabled?: boolean } & (
  { onClick: () => void; href?: never } | { href: string; onClick?: never }
);
export type AccountMenuProps = {
  name: string;
  avatar?: string;
  label?: string;
  compact?: boolean;
  items?: MenuProps['items'];
  onAction?: MenuProps['onClick'];
  logout?: AccountLogout;
};

const LOGOUT_KEY = '__account_logout';

/** 身份、真实业务项与可选登出；登出由共享层追加，始终为最后一项。 */
export function AccountMenu({
  name,
  avatar,
  label = name,
  compact = false,
  items = [],
  onAction,
  logout,
}: AccountMenuProps) {
  const [open, setOpen] = useState(false);
  const [keyboard, setKeyboard] = useState(false);
  const triggerRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<MenuRef>(null);
  const menu: MenuProps & RefAttributes<MenuRef> = {
    ref: menuRef,
    onKeyDown: (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        setOpen(false);
        triggerRef.current?.focus();
      }
    },
    items: [
      ...items,
      ...(logout
        ? [
            {
              key: LOGOUT_KEY,
              icon: <LogoutOutlined aria-hidden />,
              label: logout.href ? <a href={logout.href}>{logout.label}</a> : logout.label,
              disabled: logout.disabled,
            },
          ]
        : []),
    ],
    onClick: (event) => {
      setOpen(false);
      if (event.key === LOGOUT_KEY) logout?.onClick?.();
      else onAction?.(event);
    },
  };
  const hasMenu = items.length > 0 || Boolean(logout);
  const trigger = (
    <div
      ref={triggerRef}
      className={compact ? 'ds-account-menu ds-account-menu--compact' : 'ds-account-menu'}
      role={hasMenu ? 'button' : undefined}
      tabIndex={hasMenu ? 0 : undefined}
      aria-label={label}
      aria-haspopup={hasMenu ? 'menu' : undefined}
      aria-expanded={hasMenu ? open : undefined}
      onMouseEnter={() => {
        if (hasMenu && !open) {
          setKeyboard(false);
          setOpen(true);
        }
      }}
      onClick={() => {
        if (hasMenu && !keyboard) {
          if (open) menuRef.current?.focus();
          setKeyboard(true);
          setOpen(true);
        }
      }}
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          event.preventDefault();
          setOpen(false);
        }
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          if (open) menuRef.current?.focus();
          setKeyboard(true);
          setOpen(true);
        }
      }}
    >
      <SidebarMenu
        compact={compact}
        selectable={false}
        tabIndex={-1}
        items={[
          {
            key: 'account',
            role: 'presentation',
            tabIndex: -1,
            icon: (
              <Avatar
                style={{
                  backgroundColor: 'transparent',
                  color: 'inherit',
                  fontSize: designTokens.font.sizeLg,
                }}
                size={designTokens.font.sizeLg}
                src={avatar}
                icon={<UserOutlined aria-hidden />}
              />
            ),
            label: name,
          },
        ]}
      />
    </div>
  );
  const account = hasMenu ? (
    <Dropdown
      mouseEnterDelay={0}
      menu={menu}
      classNames={{ root: 'ds-account-menu__popup' }}
      open={open}
      onOpenChange={setOpen}
      trigger={keyboard ? ['click'] : ['hover']}
      autoFocus={keyboard}
      placement="topLeft"
    >
      {trigger}
    </Dropdown>
  ) : (
    trigger
  );
  return account;
}
