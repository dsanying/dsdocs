import { PageStack, QueryErrorAlert } from '@/components/ui';
import { request } from '@/services';
import { LoginOutlined, SaveOutlined } from '@ant-design/icons';
import { Button, Form, Input } from 'antd';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import './style.css';
export default function LoginPage({ setup = false }: { setup?: boolean }) {
  const { t } = useTranslation();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>();
  return (
    <main className="login-page">
      <PageStack>
        <h1>{t('common.brand')}</h1>
        <p>{setup ? t('dsdocs.setupHint') : t('dsdocs.loginHint')}</p>
        <QueryErrorAlert error={error} />
        <Form
          layout="vertical"
          onFinish={async (values) => {
            setBusy(true);
            setError(undefined);
            try {
              await request(
                setup ? '/__dsdocs_accounts/me' : '/__dsdocs_auth/sign-in/username',
                setup ? 'PATCH' : 'POST',
                { username: values.username, password: values.password }
              );
              location.replace(setup ? '/login?changed=1' : '/');
            } catch (error) {
              setError(error);
            } finally {
              setBusy(false);
            }
          }}
        >
          <div>
            <Form.Item
              name="username"
              label={setup ? t('dsdocs.newUsername') : t('common.vocab.username')}
              rules={[
                { required: true, pattern: /^[A-Za-z0-9._-]{3,64}$/ },
                ...(setup
                  ? [
                      {
                        validator: (_: unknown, value: string) =>
                          value?.toLowerCase() === 'admin'
                            ? Promise.reject(new Error(t('dsdocs.changeDefaultUsername')))
                            : Promise.resolve(),
                      },
                    ]
                  : []),
              ]}
            >
              <Input allowClear autoComplete="username" />
            </Form.Item>
            <Form.Item
              name="password"
              label={setup ? t('common.vocab.newPassword') : t('common.vocab.password')}
              rules={[{ required: true, min: setup ? 8 : 1, max: 128 }]}
            >
              <Input.Password
                allowClear
                autoComplete={setup ? 'new-password' : 'current-password'}
              />
            </Form.Item>
            {setup && (
              <Form.Item
                name="confirm"
                label={t('dsdocs.confirmPassword')}
                dependencies={['password']}
                rules={[
                  { required: true },
                  ({ getFieldValue }) => ({
                    validator: (_, value) =>
                      !value || getFieldValue('password') === value
                        ? Promise.resolve()
                        : Promise.reject(new Error(t('dsdocs.passwordMismatch'))),
                  }),
                ]}
              >
                <Input.Password allowClear autoComplete="new-password" />
              </Form.Item>
            )}
          </div>
          <Button
            type="primary"
            htmlType="submit"
            loading={busy}
            icon={setup ? <SaveOutlined aria-hidden /> : <LoginOutlined aria-hidden />}
          >
            {setup ? t('common.actions.save') : t('common.vocab.signIn')}
          </Button>
        </Form>
      </PageStack>
    </main>
  );
}
