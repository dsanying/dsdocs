import { useEffect, useState } from 'react';
import { Button, Alert, Form, Input, Select, Typography } from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined, ReloadOutlined } from '@ant-design/icons';
import { DrawerForm, Table, PageStack, Stack, Popconfirm, AtomicValue } from '@/components/ui';
import { notifyActionFailed, notifyActionSuccess } from '@/utils/feedback';
import { content, request, upload, type Account, type Folder } from '../services';
export function Accounts({ current }: { current: Account }) {
  const [rows, setRows] = useState<Account[]>([]),
    [error, setError] = useState(''),
    [editing, setEditing] = useState<Partial<Account> | null>(null);
  async function load() {
    try {
      setRows(await request('/__dsdocs_accounts'));
      setError('');
    } catch (e) {
      setError((e as Error).message);
    }
  }
  useEffect(() => {
    void load();
  }, []);
  return (
    <PageStack>
      <Typography.Title level={1}>
        {current.role === 'superadmin' ? '账号管理' : '我的账号'}
      </Typography.Title>
      {error && (
        <Alert
          type="error"
          title={error}
          action={
            <Button icon={<ReloadOutlined aria-hidden />} onClick={() => void load()}>
              重试
            </Button>
          }
        />
      )}{' '}
      {current.role === 'superadmin' && (
        <Button icon={<PlusOutlined aria-hidden />} onClick={() => setEditing({})}>
          创建账号
        </Button>
      )}
      <Table
        rowKey="id"
        dataSource={rows}
        orderBy={(x) => x.username}
        columns={[
          { title: '用户名', dataIndex: 'username', render: (x) => <AtomicValue text={x} /> },
          {
            title: '身份',
            dataIndex: 'role',
            render: (x) => (x === 'superadmin' ? '超级管理员' : '管理员'),
          },
          {
            title: '操作',
            render: (_, row) => (
              <Stack direction="row" gap="control" wrap align="center">
                <Button icon={<EditOutlined aria-hidden />} onClick={() => setEditing(row)}>
                  修改
                </Button>
                {row.role !== 'superadmin' && current.role === 'superadmin' && (
                  <Popconfirm
                    title="删除该管理员？其会话将立即失效。"
                    onConfirm={async () => {
                      try {
                        await request(`/__dsdocs_accounts/${row.id}`, 'DELETE', {});
                        await load();
                        notifyActionSuccess('delete');
                      } catch (e) {
                        notifyActionFailed('delete', e);
                      }
                    }}
                  >
                    <Button danger icon={<DeleteOutlined aria-hidden />}>
                      删除
                    </Button>
                  </Popconfirm>
                )}
              </Stack>
            ),
          },
        ]}
        pagination={{
          defaultPageSize: 10,
          pageSizeOptions: [10, 20, 50, 100],
          showSizeChanger: true,
        }}
      />
      <DrawerForm
        title={editing?.id ? '修改账号' : '创建账号'}
        open={!!editing}
        onOpenChange={(open) => {
          if (!open) setEditing(null);
        }}
        initialValues={{ username: editing?.username ?? '', password: '', currentPassword: '' }}
        onFinish={async (values) => {
          try {
            const self = editing?.id === current.id;
            const data = {
              username: values.username,
              password: values.password,
              ...(self ? { currentPassword: values.currentPassword } : {}),
            };
            const result = await request(
              editing?.id
                ? self
                  ? '/__dsdocs_accounts/me'
                  : `/__dsdocs_accounts/${editing.id}`
                : '/__dsdocs_accounts',
              editing?.id ? 'PATCH' : 'POST',
              data
            );
            if (result.relogin) {
              location.assign('/login');
              return true;
            }
            await load();
            notifyActionSuccess('save');
            return true;
          } catch (e) {
            notifyActionFailed('save', e);
            return false;
          }
        }}
      >
        <Form.Item
          name="username"
          label="用户名"
          tooltip="3–64 位字母、数字、点、下划线或连字符。"
          rules={[{ required: true, pattern: /^[A-Za-z0-9._-]{3,64}$/ }]}
        >
          <Input autoComplete="username" />
        </Form.Item>
        {editing?.id === current.id && (
          <Form.Item name="currentPassword" label="当前密码" rules={[{ required: true }]}>
            <Input.Password autoComplete="current-password" />
          </Form.Item>
        )}
        <Form.Item
          name="password"
          label={editing?.id ? '新密码' : '密码'}
          tooltip="8–128 个字符；修改账号时留空保留原密码。密码仅保存哈希，不显示原密码。"
          rules={[{ required: !editing?.id }, { min: 8, max: 128 }]}
        >
          <Input.Password autoComplete="new-password" />
        </Form.Item>
      </DrawerForm>
    </PageStack>
  );
}
export function Folders() {
  const [rows, setRows] = useState<Folder[]>([]),
    [editing, setEditing] = useState<Partial<Folder> | null>(null),
    [error, setError] = useState('');
  async function load() {
    try {
      setRows((await content()).folders);
      setError('');
    } catch (e) {
      setError((e as Error).message);
    }
  }
  useEffect(() => {
    void load();
  }, []);
  return (
    <PageStack>
      <Typography.Title level={1}>目录管理</Typography.Title>
      {error && (
        <Alert
          type="error"
          title={error}
          action={
            <Button icon={<ReloadOutlined aria-hidden />} onClick={() => void load()}>
              重试
            </Button>
          }
        />
      )}
      <Button icon={<PlusOutlined aria-hidden />} onClick={() => setEditing({})}>
        新建目录
      </Button>
      <Table
        rowKey="id"
        dataSource={rows}
        orderBy={(x) => x.title}
        columns={[
          { title: '中文名称', dataIndex: 'title' },
          { title: '英文名称', dataIndex: 'titleEn' },
          {
            title: '父目录',
            dataIndex: 'parent',
            render: (id) => rows.find((x) => x.id === id)?.title ?? '—',
          },
          {
            title: '操作',
            render: (_, row) => (
              <Stack direction="row" gap="control" wrap align="center">
                <Button icon={<EditOutlined aria-hidden />} onClick={() => setEditing(row)}>
                  修改
                </Button>
                <Popconfirm
                  title="删除空目录？"
                  onConfirm={async () => {
                    try {
                      await content(`/folders/${row.id}`, 'DELETE', {});
                      await load();
                      notifyActionSuccess('delete');
                    } catch (e) {
                      notifyActionFailed('delete', e);
                    }
                  }}
                >
                  <Button danger icon={<DeleteOutlined aria-hidden />}>
                    删除
                  </Button>
                </Popconfirm>
              </Stack>
            ),
          },
        ]}
        pagination={{ defaultPageSize: 10 }}
      />
      <DrawerForm
        title={editing?.id ? '修改目录' : '新建目录'}
        open={!!editing}
        onOpenChange={(open) => {
          if (!open) setEditing(null);
        }}
        initialValues={{
          title: editing?.title ?? '',
          titleEn: editing?.titleEn ?? '',
          parent: editing?.parent ?? undefined,
        }}
        onFinish={async (values) => {
          try {
            await content(
              `/folders${editing?.id ? `/${editing.id}` : ''}`,
              editing?.id ? 'PATCH' : 'POST',
              values
            );
            await load();
            notifyActionSuccess('save');
            return true;
          } catch (e) {
            notifyActionFailed('save', e);
            return false;
          }
        }}
      >
        <Form.Item name="title" label="中文名称" rules={[{ required: true }]}>
          <Input />
        </Form.Item>
        <Form.Item name="titleEn" label="英文名称" rules={[{ required: true }]}>
          <Input />
        </Form.Item>
        <Form.Item name="parent" label="父目录">
          <Select
            allowClear
            options={rows
              .filter((x) => x.id !== editing?.id)
              .map((x) => ({ label: x.title, value: x.id }))}
          />
        </Form.Item>
      </DrawerForm>
    </PageStack>
  );
}
export function Assets() {
  const [rows, setRows] = useState<{ id: string; name: string; size: number }[]>([]),
    [error, setError] = useState('');
  async function load() {
    try {
      setRows(await content('/assets'));
      setError('');
    } catch (e) {
      setError((e as Error).message);
    }
  }
  useEffect(() => {
    void load();
  }, []);
  return (
    <PageStack>
      <Typography.Title level={1}>附件管理</Typography.Title>
      {error && (
        <Alert
          type="error"
          title={error}
          action={
            <Button icon={<ReloadOutlined aria-hidden />} onClick={() => void load()}>
              重试
            </Button>
          }
        />
      )}
      <Button
        icon={<PlusOutlined aria-hidden />}
        onClick={() => document.getElementById('asset-upload')?.click()}
      >
        上传附件
      </Button>
      <input
        id="asset-upload"
        type="file"
        hidden
        accept=".png,.jpg,.jpeg,.webp,.pdf,.txt"
        onChange={async (e) => {
          const file = e.target.files?.[0];
          e.target.value = '';
          if (!file) return;
          try {
            await upload(file);
            await load();
            notifyActionSuccess('upload');
          } catch (e) {
            notifyActionFailed('upload', e);
          }
        }}
      />
      <Table
        rowKey="id"
        dataSource={rows}
        orderBy={(x) => x.name}
        columns={[
          { title: '名称', dataIndex: 'name' },
          { title: '大小（字节）', dataIndex: 'size' },
          {
            title: '操作',
            render: (_, row) => (
              <Popconfirm
                title="删除附件？有文档引用时会阻止删除。"
                onConfirm={async () => {
                  try {
                    await content(`/assets/${row.id}`, 'DELETE', {});
                    await load();
                    notifyActionSuccess('delete');
                  } catch (e) {
                    notifyActionFailed('delete', e);
                  }
                }}
              >
                <Button danger icon={<DeleteOutlined aria-hidden />}>
                  删除
                </Button>
              </Popconfirm>
            ),
          },
        ]}
        pagination={{
          defaultPageSize: 10,
          pageSizeOptions: [10, 20, 50, 100],
          showSizeChanger: true,
        }}
      />
    </PageStack>
  );
}
