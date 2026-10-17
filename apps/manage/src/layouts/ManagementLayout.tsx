import { useManagement } from '@/hooks/useManagement';
import DocumentsPage from '@/pages/DocumentsPage';
import SettingsPage from '@/pages/SettingsPage';
import { menuRoutes } from '@/routes';
import { request } from '@/services';
import { notifyActionFailed } from '@/utils/feedback';
import { useTranslation } from 'react-i18next';
import { Navigate, Outlet, useLocation, useNavigate } from 'react-router';
import BasicLayout from './BasicLayout';
import './ManagementLayout.css';

export default function ManagementLayout() {
  const { t } = useTranslation();
  const { current, siteName } = useManagement();
  const location = useLocation();
  const navigate = useNavigate();
  const documents = location.pathname === '/';
  const settings = location.pathname === '/settings';
  return (
    <BasicLayout
      brand={siteName}
      menuEntries={menuRoutes
        .filter((entry) => entry.path !== '/accounts' || current)
        .map((entry) =>
          entry.path === '/accounts' && current?.role !== 'superadmin'
            ? { ...entry, label: () => t('dsdocs.myAccount') }
            : entry
        )}
      accountMenu={{
        items: [
          { key: 'account', label: t('dsdocs.myAccount'), onClick: () => navigate('/accounts') },
        ],
        logout: {
          label: t('common.actions.logout'),
          onClick: () => {
            void request('/__dsdocs_accounts/logout', 'POST', {})
              .then(() => locationAssign('/login'))
              .catch((error) => notifyActionFailed('logout', error));
          },
        },
      }}
    >
      <div className="ds-management-workspace" hidden={!documents}>
        <DocumentsPage visible={documents} />
      </div>
      <div className="ds-management-workspace" hidden={!settings}>
        <SettingsPage visible={settings} />
      </div>
      {!documents &&
        !settings &&
        (location.pathname === '/login' ? <Navigate to="/" replace /> : <Outlet />)}
    </BasicLayout>
  );
}
function locationAssign(path: string) {
  window.location.assign(path);
}
