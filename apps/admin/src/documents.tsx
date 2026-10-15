import { lazy, Suspense, useState } from 'react';
import { App, Button, Form, Input, Popconfirm, Tag, Tabs, Descriptions, Collapse } from 'antd';
import {
  PlusOutlined,
  DownloadOutlined,
  EditOutlined,
  TranslationOutlined,
  CloudUploadOutlined,
  StopOutlined,
  DeleteOutlined,
} from '@ant-design/icons';
import { Link, useNavigate, useParams } from 'react-router';
import { api, downloadFiles, errorMessage, type Document, type Revision } from './api';
import { Action, Page, DataTable, Value, Feedback, useResource, pagination, Actions } from './ui';
import { useText } from './i18n';
const EditDocument = lazy(() =>
  import('./editor').then((module) => ({ default: module.EditDocument }))
);
export function Documents() {
  const { t } = useText(),
    { notification } = App.useApp(),
    navigate = useNavigate(),
    [page, setPage] = useState(1),
    [size, setSize] = useState(10),
    [keyword, setKeyword] = useState(''),
    [exporting, setExporting] = useState(false);
  const resource = useResource<{ data: Document[]; total: number }>(
    `documents?${new URLSearchParams({ page: String(page), limit: String(size), keyword })}`
  );
  async function download() {
    setExporting(true);
    try {
      await downloadFiles();
      notification.success({ title: t('succeeded') });
    } catch (error) {
      notification.error({ title: t('failed'), description: errorMessage(error) });
    } finally {
      setExporting(false);
    }
  }
  return (
    <Page
      title={t('documents')}
      actions={
        <>
          <Action
            icon={<DownloadOutlined aria-hidden />}
            label={t('export')}
            loading={exporting}
            onClick={() => void download()}
          />
          <Action
            type="primary"
            icon={<PlusOutlined aria-hidden />}
            label={t('create')}
            onClick={() => navigate('/documents/new')}
          />
        </>
      }
    >
      <Form
        layout="inline"
        onFinish={(values) => {
          setPage(1);
          setKeyword(values.keyword ?? '');
        }}
        className="query-form"
      >
        <Form.Item name="keyword" label={t('keyword')}>
          <Input allowClear />
        </Form.Item>
        <Button htmlType="submit">{t('search')}</Button>
      </Form>
      <Feedback error={resource.error} onRetry={resource.refresh} />
      <DataTable<Document>
        dataSource={resource.data?.data ?? []}
        loading={resource.loading}
        pagination={pagination(page, size, resource.data?.total ?? 0, (next, nextSize) => {
          setPage(next);
          setSize(nextSize);
        })}
        columns={[
          {
            key: 'title',
            title: t('title'),
            width: 260,
            render: (_, row) => (
              <Value>
                <Link to={`/documents/detail/${row.id}`}>{row.draft.title}</Link>
              </Value>
            ),
          },
          {
            key: 'path',
            title: t('path'),
            width: 260,
            render: (_, row) => <Value>{row.draft.path}</Value>,
          },
          {
            key: 'locale',
            title: t('locale'),
            width: 160,
            render: (_, row) => <Value>{row.draft.locale === 'zh' ? t('zh') : t('en')}</Value>,
          },
          {
            key: 'status',
            title: t('published'),
            width: 200,
            render: (_, row) => <Status document={row} />,
          },
        ]}
      />
    </Page>
  );
}
function Status({ document }: { document: Document }) {
  const { t } = useText();
  return (
    <Tag color={document.publishedRevision === null ? 'default' : 'success'}>
      {t(
        document.publishedRevision === null
          ? 'draft'
          : document.publishedRevision === document.revision
            ? 'published'
            : 'changed'
      )}
    </Tag>
  );
}
export function DocumentRoute({ mode }: { mode: 'new' | 'edit' | 'detail' }) {
  const { id } = useParams();
  return (
    <Suspense fallback={<Feedback loading />}>
      {mode === 'new' ? (
        <EditDocument />
      ) : mode === 'edit' ? (
        <EditDocument key={id} id={id} />
      ) : (
        <Details key={id} id={id!} />
      )}
    </Suspense>
  );
}
function Details({ id }: { id: string }) {
  const { t } = useText(),
    navigate = useNavigate(),
    { notification } = App.useApp(),
    resource = useResource<Document>(`documents/${id}`),
    translations = useResource<Array<{ id: string; locale: string }>>(
      `documents/${id}/translations`
    ),
    [tab, setTab] = useState('source'),
    [busy, setBusy] = useState(false);
  const history = useResource<Revision[]>(tab === 'history' ? `documents/${id}/revisions` : null),
    doc = resource.data;
  if (!doc)
    return (
      <Feedback error={resource.error} loading={resource.loading} onRetry={resource.refresh} />
    );
  const document = doc;
  const targetLocale = document.draft.locale === 'zh' ? 'en' : 'zh',
    translation = translations.data?.find((item) => item.locale === targetLocale);
  async function change(action: 'publish' | 'unpublish' | 'restore' | 'delete', revision?: number) {
    if (busy) return;
    setBusy(true);
    try {
      await api(
        action === 'delete' ? `documents/${id}` : `documents/${id}/${action}`,
        action === 'delete' ? 'DELETE' : 'POST',
        {
          expectedRevision: document.revision,
          operationId: crypto.randomUUID(),
          ...(revision === undefined ? {} : { revision }),
        }
      );
      notification.success({ title: t('succeeded') });
      if (action === 'delete') navigate('/documents');
      else {
        resource.refresh();
        history.refresh();
      }
    } catch (error) {
      notification.error({ title: t('failed'), description: errorMessage(error) });
    } finally {
      setBusy(false);
    }
  }
  return (
    <Page
      title={document.draft.title}
      actions={
        <>
          <Button onClick={() => navigate('/documents')}>{t('back')}</Button>
          <Action
            icon={<EditOutlined aria-hidden />}
            label={t('edit')}
            onClick={() => navigate(`/documents/detail/${id}/edit`)}
          />
          <Action
            icon={<TranslationOutlined aria-hidden />}
            label={t(translation ? 'viewTranslation' : 'addTranslation')}
            disabled={translations.loading || !!translations.error}
            onClick={() =>
              navigate(
                translation
                  ? `/documents/detail/${translation.id}`
                  : `/documents/new?${new URLSearchParams({ translationKey: document.draft.translationKey, locale: targetLocale, path: document.draft.path })}`
              )
            }
          />
          <Action
            type="primary"
            icon={<CloudUploadOutlined aria-hidden />}
            label={t('publish')}
            loading={busy}
            onClick={() => void change('publish')}
          />
          {document.publishedRevision !== null ? (
            <Popconfirm
              title={t('confirm')}
              description={t('unpublishHint')}
              onConfirm={() => change('unpublish')}
            >
              <Action
                danger
                icon={<StopOutlined aria-hidden />}
                label={t('unpublish')}
                disabled={busy}
              />
            </Popconfirm>
          ) : null}
          <Popconfirm
            title={t('confirm')}
            description={t('deleteHint')}
            onConfirm={() => change('delete')}
          >
            <Action
              danger
              icon={<DeleteOutlined aria-hidden />}
              label={t('remove')}
              disabled={busy}
            />
          </Popconfirm>
        </>
      }
    >
      <Feedback error={resource.error} onRetry={resource.refresh} />
      <Feedback error={translations.error} onRetry={translations.refresh} />
      <Status document={document} />
      <Descriptions
        layout="vertical"
        column={{ xs: 1, sm: 2, md: 3 }}
        items={[
          { key: 'path', label: t('path'), children: document.draft.path },
          { key: 'locale', label: t('locale'), children: document.draft.locale },
          { key: 'group', label: t('group'), children: document.draft.group || '—' },
          { key: 'order', label: t('order'), children: document.draft.order },
          {
            key: 'description',
            label: t('description'),
            span: 'filled',
            children: document.draft.description || '—',
          },
        ]}
      />
      <Tabs
        activeKey={tab}
        onChange={setTab}
        items={[
          {
            key: 'source',
            label: t('source'),
            children: <pre className="source-content">{document.draft.mdx}</pre>,
          },
          {
            key: 'history',
            label: t('history'),
            children: (
              <>
                <Feedback
                  loading={history.loading}
                  error={history.error}
                  onRetry={history.refresh}
                />
                <Collapse
                  items={(history.data ?? []).map((revision) => ({
                    key: revision.number,
                    label: `${revision.number} · ${new Date(revision.createdAt).toLocaleString()}`,
                    children: (
                      <>
                        <Actions>
                          <Button
                            loading={busy}
                            onClick={() => void change('restore', revision.number)}
                          >
                            {t('restore')}
                          </Button>
                        </Actions>
                        <pre className="source-content">{revision.mdx}</pre>
                      </>
                    ),
                  }))}
                />
              </>
            ),
          },
        ]}
      />
    </Page>
  );
}
