import '../../../packages/content/prose.css';
import { StrictMode, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, useSearchParams } from 'react-router';
import { Button, ConfigProvider, App as AntApp, Layout, Alert, Drawer, Grid } from 'antd';
import zhCN from 'antd/locale/zh_CN';
import {
  FileTextOutlined,
  FolderOutlined,
  PaperClipOutlined,
  UserOutlined,
  MoonOutlined,
  SunOutlined,
  SettingOutlined,
  SyncOutlined,
  MenuOutlined,
} from '@ant-design/icons';
import i18n from '@/i18n';
import '@/design/tokens.css';
import './global.css';
import './style.css';
import { buildThemeConfig } from '@/config/theme';
import { bootstrapPersistedTheme, useThemeStore } from '@/stores/useThemeStore';
import {
  SidebarMenu,
  IconLabelHint,
  modalDefaults,
  notificationDefaults,
  installOverflowScroll,
  AccountMenu,
  ViewportFrame,
  SidebarFrame,
} from '@/components/ui';
import { setStaticInstances } from '@/utils/antdStatic';
import { Settings, FileSync } from './features/Settings';
import { Documents } from './features/Documents';
import { Accounts, Folders, Assets } from './features/Resources';
import { content, request, type Account } from './services';
function Bridge() {
  const { notification } = AntApp.useApp();
  useEffect(() => {
    setStaticInstances({ notification });
  }, [notification]);
  return <IconLabelHint />;
}
function Shell() {
  const [current, setCurrent] = useState<Account | null>(null),
    [ready, setReady] = useState(false),
    [error, setError] = useState(''),
    [siteName, setSiteName] = useState('DSdocs');
  const mobile = Grid.useBreakpoint().lg === false;
  const [navigationOpen, setNavigationOpen] = useState(false);
  const [params, setParams] = useSearchParams();
  useEffect(() => {
    if (!mobile) setNavigationOpen(false);
  }, [mobile]);
  const page = ['folders', 'assets', 'accounts', 'settings', 'files'].includes(
    params.get('page') ?? ''
  )
    ? params.get('page')!
    : 'documents';
  const setPage = (next: string) => {
    setParams(next === 'documents' ? {} : { page: next });
    setNavigationOpen(false);
  };
  const mode = useThemeStore((x) => x.mode),
    setPreference = useThemeStore((x) => x.setPreference);
  useEffect(() => {
    request('/__dsdocs_accounts/capabilities')
      .then((value) => {
        setCurrent(value.user);
        setReady(true);
        void content('/settings')
          .then((value) => setSiteName(value.data.siteName))
          .catch(() => {});
      })
      .catch((e) => setError(e.message));
  }, []);
  const sidebar = (
    <SidebarFrame
      header={<div className="brand">{siteName}</div>}
      footer={
        <div className="account-menu">
          {current && (
            <AccountMenu
              name={current.username}
              items={[{ key: 'account', label: '我的账号', onClick: () => setPage('accounts') }]}
              logout={{
                label: '退出登录',
                onClick: () => {
                  void request('/__dsdocs_accounts/logout', 'POST', {}).then(() =>
                    location.assign('/login')
                  );
                },
              }}
            />
          )}
          <Button
            icon={mode === 'dark' ? <SunOutlined aria-hidden /> : <MoonOutlined aria-hidden />}
            onClick={() => setPreference(mode === 'dark' ? 'light' : 'dark')}
          >
            切换主题
          </Button>
        </div>
      }
      label="主导航"
    >
      <SidebarMenu
        selectedKeys={[page]}
        onClick={({ key }) => setPage(key)}
        items={[
          { key: 'documents', icon: <FileTextOutlined aria-hidden />, label: '文档' },
          { key: 'folders', icon: <FolderOutlined aria-hidden />, label: '目录' },
          { key: 'assets', icon: <PaperClipOutlined aria-hidden />, label: '附件' },
          { key: 'settings', icon: <SettingOutlined aria-hidden />, label: '网站设置' },
          { key: 'files', icon: <SyncOutlined aria-hidden />, label: '文件同步' },
          ...(current
            ? [
                {
                  key: 'accounts',
                  icon: <UserOutlined aria-hidden />,
                  label: current.role === 'superadmin' ? '账号管理' : '我的账号',
                },
              ]
            : []),
        ]}
      />
    </SidebarFrame>
  );
  return (
    <ViewportFrame>
      <Layout className="management-shell">
        <Layout.Sider className="desktop-sidebar" trigger={null} theme="light">
          {!mobile && sidebar}
        </Layout.Sider>
        <Drawer
          title="导航"
          placement="left"
          open={mobile && navigationOpen}
          onClose={() => setNavigationOpen(false)}
          size={320}
          className="management-navigation-drawer"
          styles={{
            wrapper: { maxWidth: 'calc(100vw - 32px)' },
            body: { padding: 0, overflow: 'hidden' },
          }}
        >
          {mobile && sidebar}
        </Drawer>
        <Layout.Content className="management-content">
          <header className="mobile-app-header">
            <Button
              icon={<MenuOutlined aria-hidden />}
              aria-label="打开导航"
              onClick={() => setNavigationOpen(true)}
            />
            <span className="mobile-site-name">{siteName}</span>
          </header>
          {error && <Alert type="error" title={error} />}{' '}
          {ready && (
            <>
              <div className="management-page" hidden={page !== 'documents'}>
                <Documents visible={page === 'documents'} />
              </div>
              <div className="management-page management-page--scroll" hidden={page !== 'settings'}>
                <Settings
                  onSaved={(value) => {
                    setSiteName(value.siteName);
                    document.title = value.siteName + ' · 管理';
                  }}
                />
              </div>
              {page === 'files' && (
                <div className="resource-page management-page management-page--scroll">
                  <FileSync />
                </div>
              )}
              {page === 'folders' && (
                <div className="resource-page management-page management-page--scroll">
                  <Folders />
                </div>
              )}
              {page === 'assets' && (
                <div className="resource-page management-page management-page--scroll">
                  <Assets />
                </div>
              )}
              {page === 'accounts' && current && (
                <div className="resource-page management-page management-page--scroll">
                  <Accounts current={current} />
                </div>
              )}
            </>
          )}
        </Layout.Content>
      </Layout>
    </ViewportFrame>
  );
}
function Root() {
  const mode = useThemeStore((x) => x.mode);
  return (
    <ConfigProvider locale={zhCN} theme={buildThemeConfig(mode)} modal={modalDefaults}>
      <AntApp notification={{ ...notificationDefaults, placement: 'topRight', duration: 3 }}>
        <Bridge />
        <Shell />
      </AntApp>
    </ConfigProvider>
  );
}
void i18n.changeLanguage('zh-CN');
bootstrapPersistedTheme();
installOverflowScroll(document.body);
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <Root />
    </BrowserRouter>
  </StrictMode>
);
