import { DrawerForm } from '@/components/ui';
import { type Account } from '@/services';
import { Form, Input } from 'antd';
import { useTranslation } from 'react-i18next';

export function AccountEditor({
  editing,
  onClose,
  onFinish,
  current,
}: {
  editing: Partial<Account> | null;
  onClose: () => void;
  onFinish: (values: Record<string, unknown>) => Promise<boolean>;
  current: Account;
}) {
  const { t } = useTranslation();
  return (
    <DrawerForm
      title={editing?.id ? t('common.vocab.editAccount') : t('dsdocs.createAccount')}
      open={!!editing}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      initialValues={{ username: editing?.username ?? '', password: '', currentPassword: '' }}
      onFinish={onFinish}
    >
      <Form.Item
        name="username"
        label={t('common.vocab.username')}
        tooltip={t('dsdocs.usernameHint')}
        rules={[{ required: true, pattern: /^[A-Za-z0-9._-]{3,64}$/ }]}
      >
        <Input allowClear autoComplete="username" />
      </Form.Item>
      {editing?.id === current.id && (
        <Form.Item
          name="currentPassword"
          label={t('common.vocab.currentPassword')}
          rules={[{ required: true }]}
        >
          <Input.Password allowClear autoComplete="current-password" />
        </Form.Item>
      )}
      <Form.Item
        name="password"
        label={editing?.id ? t('common.vocab.newPassword') : t('common.vocab.password')}
        tooltip={t('dsdocs.passwordHint')}
        rules={[{ required: !editing?.id }, { min: 8, max: 128 }]}
      >
        <Input.Password allowClear autoComplete="new-password" />
      </Form.Item>
    </DrawerForm>
  );
}
