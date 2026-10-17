import {
  GlobalOutlined,
  MenuFoldOutlined,
  MenuOutlined,
  MenuUnfoldOutlined,
  MoonOutlined,
  SunOutlined,
} from '@ant-design/icons';
import { Drawer, Grid, Layout, type MenuProps } from 'antd';
import { useMemo, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { generatePath, Link, matchPath, Outlet, useLocation } from 'react-router';

import { CurrentUser } from '@/components/CurrentUser';
import {
  AtomicValue,
  IconButton,
  PageFooterSlotProvider,
  RouteCrumbsContext,
  SidebarFrame,
  SidebarMenu,
  ViewportFrame,
  type AccountMenuProps,
  type RouteCrumb,
} from '@/components/ui';
import { designTokens } from '@/design/tokens';
import { menuRoutes, type MenuEntry } from '@/routes';
import { hasVisibleChildren, matchMenuChain, selectedMenuKey } from '@/routes/menuMatch';

import { useThemeStore } from '@/stores/useThemeStore';

import './BasicLayout.css';

const BrandHeader: React.FC<{ brand?: string }> = ({ brand }) => {
  const { t } = useTranslation();
  const siteName = brand ?? t('common.brand');
  return (
    <Link to="/" className="ds-brand-header">
      <span className="ds-brand-header__icon" aria-hidden="true">
        {Array.from(siteName).find((letter) => /[\p{Letter}\p{Number}]/u.test(letter)) ?? 'A'}
      </span>
      <AtomicValue className="ds-brand-header__title" text={siteName} />
    </Link>
  );
};

function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

type MenuItem = NonNullable<MenuProps['items']>[number];

/** 导航树 → Ant Menu items：叶子渲染为路由链接，进菜单的节点才出现。 */
function toMenuItems(entries: MenuEntry[], t: Parameters<MenuEntry['label']>[0]): MenuItem[] {
  return entries
    .filter((entry) => !entry.hideInMenu)
    .map((entry) => {
      const children = entry.children ? toMenuItems(entry.children, t) : [];
      const label = entry.label(t);
      return children.length > 0
        ? { key: entry.path, icon: entry.icon, label, children }
        : { key: entry.path, icon: entry.icon, label: <Link to={entry.path}>{label}</Link> };
    });
}

/** 底部与顶部共用 SidebarMenu；业务只提供项和真实账户动作。 */
const SiderFooter: React.FC<{
  compact?: boolean;
  items?: MenuProps['items'];
  account?: ReactNode;
}> = ({ compact = false, items = [], account }) => {
  const { t, i18n } = useTranslation();
  const mode = useThemeStore((s) => s.mode);
  const toggle = useThemeStore((s) => s.toggle);
  const other = i18n.language === 'en-US' ? 'zh-CN' : 'en-US';
  const nativeName = i18n.getFixedT(other)(
    other === 'zh-CN' ? 'common.vocab.chinese' : 'common.language.short.enUS'
  );
  return (
    <div className="ds-basic-layout__sider-footer">
      <SidebarMenu
        compact={compact}
        selectable={false}
        items={[
          ...items,
          {
            key: 'theme',
            icon: mode === 'dark' ? <SunOutlined aria-hidden /> : <MoonOutlined aria-hidden />,
            label: t('common.theme.toggle'),
            'aria-label': t('common.theme.toggle'),
            onClick: toggle,
          },
          {
            key: 'language',
            icon: <GlobalOutlined aria-hidden />,
            label: <span lang={other}>{nativeName}</span>,
            'aria-label': t('common.language.switch'),
            onClick: () => void i18n.changeLanguage(other),
          },
        ]}
      />
      {account ?? <CurrentUser compact={compact} />}
    </div>
  );
};

const SIDER_COLLAPSED_KEY = 'dsdocs-sider-collapsed';

/** 折叠状态是每位使用者自己的偏好：记在浏览器里，读写失败（隐私模式等）按展开处理。 */
function readSiderCollapsed(): boolean {
  try {
    return window.localStorage.getItem(SIDER_COLLAPSED_KEY) === 'true';
  } catch {
    return false;
  }
}

function writeSiderCollapsed(collapsed: boolean) {
  try {
    window.localStorage.setItem(SIDER_COLLAPSED_KEY, String(collapsed));
  } catch {
    // 存不下就只在本次会话生效
  }
}

/**
 * 应用壳（Ant Layout）：左侧固定导航栏 + 内容区；窄屏时导航栏收进抽屉，由顶栏菜单键打开。
 * 按当前地址算出导航链，供菜单高亮/展开与页面面包屑、默认标题使用。
 */
export type BasicLayoutProps = {
  brand?: string;
  children?: ReactNode;
  menuEntries?: MenuEntry[];
  footerItems?: MenuProps['items'];
  account?: (compact: boolean) => ReactNode;
  accountMenu?: Omit<AccountMenuProps, 'name' | 'avatar' | 'compact'>;
};

const BasicLayout: React.FC<BasicLayoutProps> = ({
  brand,
  children,
  menuEntries,
  footerItems,
  account,
  accountMenu,
}) => {
  const entries = menuEntries ?? menuRoutes;
  const location = useLocation();
  const { t } = useTranslation();
  const siteName = brand ?? t('common.brand');
  const screens = Grid.useBreakpoint();
  const mobile = screens.md === false;
  const [collapsed, setCollapsedState] = useState(readSiderCollapsed);
  const setCollapsed = (next: boolean) => {
    setCollapsedState(next);
    writeSiderCollapsed(next);
  };
  const [drawerOpen, setDrawerOpen] = useState(false);

  const chain = useMemo(
    () => matchMenuChain(entries, location.pathname),
    [entries, location.pathname]
  );
  const selectedKey = selectedMenuKey(chain);
  const [openKeys, setOpenKeys] = useState<string[]>(() =>
    chain.slice(0, -1).map((node) => node.path)
  );
  // 地址变化时（渲染期同步派生，不走 effect）：展开所属分组、关闭移动端抽屉；用户手动收起/展开的其他分组保持不动
  const [renderedPathname, setRenderedPathname] = useState(location.pathname);
  if (renderedPathname !== location.pathname) {
    setRenderedPathname(location.pathname);
    setOpenKeys(Array.from(new Set([...openKeys, ...chain.slice(0, -1).map((node) => node.path)])));
    setDrawerOpen(false);
  }

  const items = useMemo(() => toMenuItems(entries, t), [entries, t]);
  const crumbs = useMemo<RouteCrumb[]>(() => {
    // 祖先节点的动态段（详情页的 :id）取自当前地址，面包屑才能真正链回“这个对象”的详情
    const matched =
      chain.length > 0
        ? (matchPath({ path: chain[chain.length - 1].path, end: true }, location.pathname)
            ?.params ?? {})
        : {};
    // location.pathname 里的动态段仍是编码形态，generatePath 会再编码一次：先解码，避免 %25 双重编码
    const params = Object.fromEntries(
      Object.entries(matched).map(([key, value]) => [key, safeDecode(value ?? '')])
    );
    return chain.map((node) => ({
      path: generatePath(node.path, params),
      title: node.label(t),
      // 只有菜单分组（下面还有菜单项、本身没有页面）不可点；详情这类不进菜单的页面同样可以点回去
      linkable: !hasVisibleChildren(node),
      object: node.path.includes('/:'),
    }));
  }, [chain, location.pathname, t]);

  const menu = (
    <SidebarMenu
      compact={collapsed && !mobile}
      items={items}
      selectedKeys={selectedKey ? [selectedKey] : []}
      openKeys={collapsed && !mobile ? undefined : openKeys}
      onOpenChange={setOpenKeys}
    />
  );

  return (
    <PageFooterSlotProvider>
      {(slot) => (
        <RouteCrumbsContext.Provider value={crumbs}>
          <ViewportFrame>
            <Layout className="ds-basic-layout" hasSider={!mobile}>
              {mobile ? (
                <>
                  <Layout.Header className="ds-basic-layout__topbar">
                    <IconButton
                      type="text"
                      icon={<MenuOutlined />}
                      label={t('common.vocab.menu')}
                      onClick={() => setDrawerOpen(true)}
                    />
                    <BrandHeader brand={brand} />
                  </Layout.Header>
                  <Drawer
                    classNames={{ section: 'ds-basic-layout__navigation' }}
                    placement="left"
                    size={designTokens.layout.siderWidth}
                    open={drawerOpen}
                    onClose={() => setDrawerOpen(false)}
                    title={<BrandHeader brand={brand} />}
                    // 底部用户区自带分隔线与内边距，去掉 Drawer 页脚自己的那一条线
                    styles={{
                      body: { padding: `${designTokens.space.sm}px 0` },
                      footer: { padding: 0, borderTop: 0 },
                    }}
                    footer={
                      <SiderFooter
                        items={footerItems}
                        account={account?.(false) ?? <CurrentUser {...accountMenu} />}
                      />
                    }
                  >
                    {menu}
                  </Drawer>
                </>
              ) : (
                // 折叠入口在侧栏顶部、与品牌同一行（不用 Ant 默认的底部触发条）；
                // 折叠后品牌只剩图标，这个图标本身就是展开按钮，悬停 / 聚焦时换成展开图标
                <Layout.Sider
                  className="ds-basic-layout__sider"
                  width={designTokens.layout.siderWidth}
                  collapsible
                  collapsed={collapsed}
                  trigger={null}
                  theme="light"
                >
                  <SidebarFrame
                    className="ds-basic-layout__sider-inner"
                    label={t('common.vocab.menu')}
                    header={
                      <>
                        <div
                          className="ds-basic-layout__sider-header"
                          data-collapsed={collapsed ? 'true' : undefined}
                        >
                          {collapsed ? (
                            <IconButton
                              type="text"
                              className="ds-basic-layout__expand"
                              label={t('common.vocab.expandSidebar')}
                              icon={
                                <span className="ds-basic-layout__expand-icon">
                                  <span className="ds-brand-header__icon" aria-hidden="true">
                                    {Array.from(siteName).find((letter) =>
                                      /[\p{Letter}\p{Number}]/u.test(letter)
                                    ) ?? 'A'}
                                  </span>
                                  <span
                                    className="ds-basic-layout__expand-unfold"
                                    aria-hidden="true"
                                  >
                                    <MenuUnfoldOutlined />
                                  </span>
                                </span>
                              }
                              onClick={() => setCollapsed(false)}
                            />
                          ) : (
                            <>
                              <BrandHeader brand={brand} />
                              <IconButton
                                type="text"
                                label={t('common.vocab.collapseSidebar')}
                                icon={<MenuFoldOutlined />}
                                onClick={() => setCollapsed(true)}
                              />
                            </>
                          )}
                        </div>
                      </>
                    }
                    footer={
                      <SiderFooter
                        compact={collapsed}
                        items={footerItems}
                        account={
                          account?.(collapsed) ?? (
                            <CurrentUser {...accountMenu} compact={collapsed} />
                          )
                        }
                      />
                    }
                  >
                    {menu}
                  </SidebarFrame>
                </Layout.Sider>
              )}
              <Layout className="ds-basic-layout__main">
                <Layout.Content className="ds-basic-layout__content">
                  {children ?? <Outlet />}
                </Layout.Content>
                {slot}
              </Layout>
            </Layout>
          </ViewportFrame>
        </RouteCrumbsContext.Provider>
      )}
    </PageFooterSlotProvider>
  );
};

export default BasicLayout;
