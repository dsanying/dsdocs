import {
  FileTextOutlined,
  FolderOutlined,
  PaperClipOutlined,
  SettingOutlined,
  SyncOutlined,
  UserOutlined,
} from '@ant-design/icons';
import type { TFunction } from 'i18next';
import type { ReactNode } from 'react';
import type { RouteObject } from 'react-router';
import ManagementLayout from '@/layouts/ManagementLayout';
import { nestHiddenRoutes } from './menuMatch';
import { lazyRoute } from './lazyRoute';
import { AccountsPage, FoldersPage, AssetsPage, FileSyncPage, NotFoundPage } from './pages';
export interface MenuEntry {
  path: string;
  label: (t: TFunction) => string;
  icon?: ReactNode;
  hideInMenu?: boolean;
  children?: MenuEntry[];
}
export const menuRoutes: MenuEntry[] = nestHiddenRoutes([
  {
    path: '/',
    label: (t: TFunction) => t('common.vocab.documents'),
    icon: <FileTextOutlined aria-hidden />,
  },
  {
    path: '/folders',
    label: (t: TFunction) => t('common.vocab.folders'),
    icon: <FolderOutlined aria-hidden />,
  },
  {
    path: '/assets',
    label: (t: TFunction) => t('common.vocab.attachments'),
    icon: <PaperClipOutlined aria-hidden />,
  },
  {
    path: '/settings',
    label: (t: TFunction) => t('common.vocab.siteSettings'),
    icon: <SettingOutlined aria-hidden />,
  },
  {
    path: '/files',
    label: (t: TFunction) => t('dsdocs.files'),
    icon: <SyncOutlined aria-hidden />,
  },
  {
    path: '/accounts',
    label: (t: TFunction) => t('dsdocs.accounts'),
    icon: <UserOutlined aria-hidden />,
  },
  { path: '/*', label: (t: TFunction) => t('app.404.title'), hideInMenu: true },
]);
export const routes: RouteObject[] = [
  {
    path: '/',
    element: <ManagementLayout />,
    children: [
      { index: true, element: null },
      { path: 'settings', element: null },
      { path: 'login', element: null },
      { path: 'folders', element: lazyRoute(FoldersPage) },
      { path: 'assets', element: lazyRoute(AssetsPage) },
      { path: 'accounts', element: lazyRoute(AccountsPage) },
      { path: 'files', element: lazyRoute(FileSyncPage) },
      { path: '*', element: lazyRoute(NotFoundPage) },
    ],
  },
];
