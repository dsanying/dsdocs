import { useEffect, useRef, useState } from 'react';
import { App, Form, Input, Radio, Drawer, Tag, Typography } from 'antd';
import { PlusOutlined, EditOutlined, SaveOutlined, CloseOutlined } from '@ant-design/icons';
import { api, errorMessage, type User } from './api';
import { Action, Page, DataTable, Feedback, Value, useResource, pagination } from './ui';
import { useText } from './i18n';
import { naturalName } from './model';
type InputValues = { username: string; password: string; disabled: boolean };
export function Users() {
  const { t } = useText(),
    resource = useResource<User[]>('users'),
    [dialog, setDialog] = useState<{ user?: User }>(),
    [page, setPage] = useState(1),
    [size, setSize] = useState(10);
  const users = [...(resource.data ?? [])].sort(
    (a, b) => naturalName(a.username, b.username) || a.id.localeCompare(b.id)
  );
  return (
    <Page
      title={t('users')}
      actions={
        <Action
          type="primary"
          icon={<PlusOutlined aria-hidden />}
          label={t('create')}
          onClick={() => setDialog({})}
        />
      }
    >
      <Feedback error={resource.error} onRetry={resource.refresh} />
      <DataTable<User>
        dataSource={users}
        loading={resource.loading}
        pagination={pagination(page, size, users.length, (next, nextSize) => {
          setPage(next);
          setSize(nextSize);
        })}
        columns={[
          {
            key: 'username',
            title: t('username'),
            width: 260,
            render: (_, row) => <Value>{row.username}</Value>,
          },
          {
            key: 'access',
            title: t('access'),
            width: 240,
            render: (_, row) => (
              <Tag color={row.disabled ? 'default' : 'success'}>
                {t(row.disabled ? 'denied' : 'allowed')}
              </Tag>
            ),
          },
          {
            key: 'action',
            title: t('actions'),
            width: 120,
            fixed: 'right',
            render: (_, row) => (
              <Action
                icon={<EditOutlined aria-hidden />}
                label={t('edit')}
                onClick={() => setDialog({ user: row })}
              />
            ),
          },
        ]}
      />
      {dialog ? (
        <AccountForm
          key={dialog.user?.id ?? 'new'}
          user={dialog.user}
          onClose={() => setDialog(undefined)}
          onSaved={() => {
            setDialog(undefined);
            resource.refresh();
          }}
        />
      ) : null}
    </Page>
  );
}
function AccountForm({
  user,
  onClose,
  onSaved,
}: {
  user?: User;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { t } = useText(),
    { notification } = App.useApp(),
    [form] = Form.useForm<InputValues>(),
    [busy, setBusy] = useState(false),
    [baseline] = useState<InputValues>(() => ({
      username: user?.username ?? '',
      password: '',
      disabled: Boolean(user?.disabled),
    }));
  const locked = useRef(false);
  const values = Form.useWatch([], form) as InputValues | undefined,
    dirty = values && JSON.stringify(values) !== JSON.stringify(baseline);
  useEffect(() => {
    form.setFieldsValue(baseline);
  }, [form, baseline]);
  async function save() {
    if (locked.current) return;
    locked.current = true;
    try {
      const input = await form.validateFields();
      setBusy(true);
      if (user)
        await api(`users/${user.id}`, 'PATCH', {
          disabled: input.disabled,
          ...(input.password ? { password: input.password } : {}),
        });
      else await api('users', 'POST', { username: input.username, password: input.password });
      notification.success({ title: t('succeeded') });
      onSaved();
    } catch (error) {
      if (!(error && typeof error === 'object' && 'errorFields' in error))
        notification.error({ title: t('failed'), description: errorMessage(error) });
    } finally {
      setBusy(false);
      locked.current = false;
    }
  }
  return (
    <Drawer
      open
      title={t(user ? 'editUser' : 'newUser')}
      width={520}
      onClose={onClose}
      closable={!busy}
      maskClosable={!busy}
      keyboard={!busy}
      footer={
        dirty ? (
          <div className="edit-footer">
            <Action
              label={t('cancel')}
              icon={<CloseOutlined aria-hidden />}
              onClick={onClose}
              disabled={busy}
            />
            <Action
              label={t('save')}
              icon={<SaveOutlined aria-hidden />}
              type="primary"
              loading={busy}
              onClick={() => void save()}
            />
          </div>
        ) : null
      }
    >
      <Form form={form} initialValues={baseline} layout="vertical" disabled={busy}>
        <Form.Item
          name="username"
          label={t('username')}
          rules={[{ required: true, pattern: /^[a-zA-Z0-9_.-]{3,80}$/ }]}
        >
          {user ? <ReadonlyAccount /> : <Input autoComplete="off" allowClear />}
        </Form.Item>
        <Form.Item
          name="password"
          label={t('password')}
          tooltip={t('passwordHint')}
          rules={[{ required: !user, min: 12, max: 256 }]}
        >
          <Input.Password autoComplete="new-password" allowClear />
        </Form.Item>
        {user ? (
          <Form.Item name="disabled" label={t('access')} tooltip={t('accessHint')}>
            <Radio.Group
              options={[
                { label: t('allowed'), value: false },
                { label: t('denied'), value: true },
              ]}
            />
          </Form.Item>
        ) : null}
      </Form>
    </Drawer>
  );
}
function ReadonlyAccount({ value }: { value?: string }) {
  return <Typography.Text className="readonly-content">{value}</Typography.Text>;
}
