import { useState } from 'react';
import { App, Button, Dropdown, Drawer, Menu, Tooltip } from 'antd';
import {
  FileTextOutlined,
  FileImageOutlined,
  TeamOutlined,
  AuditOutlined,
  CodeOutlined,
  MenuOutlined,
  TranslationOutlined,
  BgColorsOutlined,
  LogoutOutlined,
} from '@ant-design/icons';
import { Outlet, useLocation, useNavigate } from 'react-router';
import { api, errorMessage } from './api';
import { useSession } from './session';
import { useText } from './i18n';
import { useSettings } from './settings';
export function Shell() {
  const { t, locale, setLocale } = useText(),
    { preference, setPreference } = useSettings(),
    { user, accept } = useSession(),
    { notification } = App.useApp(),
    location = useLocation(),
    navigate = useNavigate(),
    [mobile, setMobile] = useState(false);
  const items = [
    { key: '/documents', label: t('documents'), icon: <FileTextOutlined aria-hidden /> },
    { key: '/assets', label: t('assets'), icon: <FileImageOutlined aria-hidden /> },
    { key: '/components', label: t('components'), icon: <CodeOutlined aria-hidden /> },
    { key: '/users', label: t('users'), icon: <TeamOutlined aria-hidden /> },
    { key: '/audit', label: t('audit'), icon: <AuditOutlined aria-hidden /> },
  ];
  const navigation = (
    <Menu
      mode="inline"
      selectedKeys={[`/${location.pathname.split('/')[1]}`]}
      items={items}
      onClick={({ key }) => {
        navigate(key);
        setMobile(false);
      }}
    />
  );
  async function logout() {
    try {
      await api('logout', 'POST', {});
      accept(null);
      navigate('/login');
    } catch (error) {
      notification.error({ title: t('failed'), description: errorMessage(error) });
    }
  }
  return (
    <div className="admin-shell">
      <aside className="sidebar">
        <a
          className="brand"
          href="#"
          onClick={(event) => {
            event.preventDefault();
            navigate('/documents');
          }}
        >
          dsdocs
        </a>
        <nav aria-label={t('navigation')}>{navigation}</nav>
      </aside>
      <div className="main-column">
        <header className="topbar">
          <Button
            className="mobile-menu"
            icon={<MenuOutlined aria-hidden />}
            aria-label={t('navigation')}
            onClick={() => setMobile(true)}
          />
          <span className="mobile-brand">dsdocs</span>
          <div className="topbar-actions">
            <span className="account-name">{user?.username}</span>
            <Dropdown
              trigger={['click']}
              menu={{
                selectedKeys: [locale],
                items: [
                  { key: 'zh', label: '简体中文' },
                  { key: 'en', label: 'English' },
                ],
                onClick: ({ key }) => setLocale(key === 'zh' ? 'zh' : 'en'),
              }}
            >
              <Button aria-label={t('language')} icon={<TranslationOutlined aria-hidden />} />
            </Dropdown>
            <Dropdown
              trigger={['click']}
              menu={{
                selectedKeys: [preference],
                items: [
                  { key: 'light', label: t('light') },
                  { key: 'dark', label: t('dark') },
                  { key: 'system', label: t('system') },
                ],
                onClick: ({ key }) =>
                  setPreference(key === 'light' ? 'light' : key === 'dark' ? 'dark' : 'system'),
              }}
            >
              <Button aria-label={t('theme')} icon={<BgColorsOutlined aria-hidden />} />
            </Dropdown>
            <Tooltip title={t('logout')}>
              <Button
                aria-label={t('logout')}
                icon={<LogoutOutlined aria-hidden />}
                onClick={() => void logout()}
              />
            </Tooltip>
          </div>
        </header>
        <main className="main-content">
          <Outlet />
        </main>
      </div>
      <Drawer
        open={mobile}
        title="dsdocs"
        placement="left"
        width={260}
        onClose={() => setMobile(false)}
      >
        {navigation}
      </Drawer>
    </div>
  );
}
