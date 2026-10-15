import { StrictMode, useState } from 'react';
import { createRoot } from 'react-dom/client';
import {
  createBrowserRouter,
  RouterProvider,
  Navigate,
  useNavigate,
  useLocation,
} from 'react-router';
import { App, Form, Input, Button } from 'antd';
import { login, errorMessage } from './api';
import { LanguageProvider, useText } from './i18n';
import { Settings } from './settings';
import { SessionProvider, AuthGate, useSession } from './session';
import { Shell } from './shell';
import { Documents, DocumentRoute } from './documents';
import { Users } from './users';
import { Assets, Components, AuditLog } from './resources';
import './styles.css';
function Login() {
  const { t } = useText(),
    { accept } = useSession(),
    { notification } = App.useApp(),
    navigate = useNavigate(),
    location = useLocation(),
    [busy, setBusy] = useState(false);
  async function submit(input: { username: string; password: string }) {
    if (busy) return;
    setBusy(true);
    try {
      accept(await login(input.username, input.password));
      const target = location.state?.returnTo;
      navigate(
        typeof target === 'string' && target.startsWith('/') && !target.startsWith('//')
          ? target
          : '/documents',
        { replace: true }
      );
    } catch (error) {
      notification.error({ title: t('failed'), description: errorMessage(error) });
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="login-page">
      <section className="login-panel">
        <h1>dsdocs</h1>
        <p>{t('loginRequired')}</p>
        <Form layout="vertical" disabled={busy} onFinish={(input) => void submit(input)}>
          <Form.Item name="username" label={t('username')} rules={[{ required: true }]}>
            <Input autoComplete="username" />
          </Form.Item>
          <Form.Item name="password" label={t('password')} rules={[{ required: true }]}>
            <Input.Password autoComplete="current-password" />
          </Form.Item>
          <Button block type="primary" loading={busy} htmlType="submit">
            {t('login')}
          </Button>
        </Form>
      </section>
    </main>
  );
}
function NotFound() {
  const { t } = useText();
  return <h1>{t('notFound')}</h1>;
}
const router = createBrowserRouter(
  [
    { path: '/login', element: <Login /> },
    {
      path: '/',
      element: (
        <AuthGate>
          <Shell />
        </AuthGate>
      ),
      children: [
        { index: true, element: <Navigate to="/documents" replace /> },
        { path: 'documents', element: <Documents /> },
        { path: 'documents/new', element: <DocumentRoute mode="new" /> },
        { path: 'documents/detail/:id', element: <DocumentRoute mode="detail" /> },
        { path: 'documents/detail/:id/edit', element: <DocumentRoute mode="edit" /> },
        { path: 'assets', element: <Assets /> },
        { path: 'components', element: <Components /> },
        { path: 'users', element: <Users /> },
        { path: 'audit', element: <AuditLog /> },
        { path: '*', element: <NotFound /> },
      ],
    },
  ],
  { basename: import.meta.env.BASE_URL.replace(/\/$/, '') }
);
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <LanguageProvider>
      <Settings>
        <SessionProvider>
          <RouterProvider router={router} />
        </SessionProvider>
      </Settings>
    </LanguageProvider>
  </StrictMode>
);
