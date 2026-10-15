import { useState } from 'react';
import { App, Popconfirm, Upload } from 'antd';
import { UploadOutlined, DeleteOutlined, CopyOutlined } from '@ant-design/icons';
import { api, errorMessage, publicBase, upload, type Asset } from './api';
import { Action, Page, DataTable, Value, Feedback, useResource, pagination, Actions } from './ui';
import { useText } from './i18n';
import { naturalName } from './model';
export function Assets() {
  const { t } = useText(),
    { notification } = App.useApp(),
    resource = useResource<Asset[]>('assets'),
    [busy, setBusy] = useState(false),
    [page, setPage] = useState(1),
    [size, setSize] = useState(10);
  const assets = [...(resource.data ?? [])].sort(
    (a, b) => naturalName(a.name, b.name) || a.id.localeCompare(b.id)
  );
  async function add(file: File) {
    setBusy(true);
    try {
      if (file.size > 5 * 1024 * 1024) throw new Error(t('formatHint'));
      await upload(file);
      notification.success({ title: t('succeeded') });
      resource.refresh();
    } catch (error) {
      notification.error({ title: t('failed'), description: errorMessage(error) });
    } finally {
      setBusy(false);
    }
  }
  async function remove(id: string) {
    try {
      await api(`assets/${id}`, 'DELETE');
      notification.success({ title: t('succeeded') });
      resource.refresh();
    } catch (error) {
      notification.error({ title: t('failed'), description: errorMessage(error) });
    }
  }
  async function copy(id: string) {
    try {
      await navigator.clipboard.writeText(`${publicBase}/api/v1/assets/${id}`);
      notification.success({ title: t('succeeded') });
    } catch (error) {
      notification.error({ title: t('failed'), description: errorMessage(error) });
    }
  }
  return (
    <Page
      title={t('assets')}
      actions={
        <Upload
          accept="image/png,image/jpeg,image/webp,application/pdf"
          showUploadList={false}
          beforeUpload={(file) => {
            void add(file);
            return false;
          }}
          disabled={busy}
        >
          <Action
            type="primary"
            label={t('upload')}
            icon={<UploadOutlined aria-hidden />}
            loading={busy}
          />
        </Upload>
      }
    >
      <Feedback error={resource.error} onRetry={resource.refresh} />
      <DataTable<Asset>
        loading={resource.loading}
        dataSource={assets}
        pagination={pagination(page, size, assets.length, (next, nextSize) => {
          setPage(next);
          setSize(nextSize);
        })}
        columns={[
          {
            key: 'name',
            title: t('name'),
            width: 260,
            render: (_, row) => <Value>{row.name}</Value>,
          },
          { key: 'type', title: t('type'), dataIndex: 'mime', width: 200 },
          { key: 'size', title: t('size'), dataIndex: 'size', width: 120 },
          {
            key: 'path',
            title: t('path'),
            width: 320,
            render: (_, row) => <Value>{`${publicBase}/api/v1/assets/${row.id}`}</Value>,
          },
          {
            key: 'action',
            title: t('actions'),
            width: 200,
            fixed: 'right',
            render: (_, row) => (
              <Actions>
                <Action
                  icon={<CopyOutlined aria-hidden />}
                  label={t('copy')}
                  onClick={() => void copy(row.id)}
                />
                <Popconfirm
                  title={t('confirm')}
                  description={t('assetDeleteHint')}
                  onConfirm={() => remove(row.id)}
                >
                  <Action danger icon={<DeleteOutlined aria-hidden />} label={t('remove')} />
                </Popconfirm>
              </Actions>
            ),
          },
        ]}
      />
    </Page>
  );
}
export function Components() {
  const { t } = useText(),
    resource = useResource<Record<string, { props: string[]; description: string }>>('components');
  return (
    <Page title={t('components')}>
      <Feedback error={resource.error} onRetry={resource.refresh} />
      <DataTable<{ id: string; props: string[] }>
        loading={resource.loading}
        dataSource={Object.entries(resource.data ?? {}).map(([id, item]) => ({
          id,
          props: item.props,
        }))}
        pagination={{
          defaultPageSize: 10,
          pageSizeOptions: [10, 20, 50, 100],
          showSizeChanger: true,
        }}
        columns={[
          { key: 'name', title: t('name'), dataIndex: 'id', width: 220 },
          {
            key: 'props',
            title: t('properties'),
            width: 500,
            render: (_, row) => <Value>{row.props.join(', ') || '—'}</Value>,
          },
        ]}
      />
    </Page>
  );
}
type Audit = { id: number; actor: string; action: string; target: string; created_at: string };
export function AuditLog() {
  const { t } = useText(),
    resource = useResource<Audit[]>('audit');
  return (
    <Page title={t('audit')}>
      <Feedback error={resource.error} onRetry={resource.refresh} />
      <DataTable<Audit>
        loading={resource.loading}
        dataSource={resource.data ?? []}
        pagination={{
          defaultPageSize: 10,
          pageSizeOptions: [10, 20, 50, 100],
          showSizeChanger: true,
        }}
        columns={[
          {
            key: 'time',
            title: t('time'),
            width: 220,
            render: (_, row) => <Value>{new Date(row.created_at).toLocaleString()}</Value>,
          },
          {
            key: 'actor',
            title: t('actor'),
            width: 200,
            render: (_, row) => <Value>{row.actor}</Value>,
          },
          {
            key: 'action',
            title: t('operation'),
            width: 240,
            render: (_, row) => <Value>{row.action}</Value>,
          },
          {
            key: 'target',
            title: t('target'),
            width: 320,
            render: (_, row) => <Value>{row.target}</Value>,
          },
        ]}
      />
    </Page>
  );
}
