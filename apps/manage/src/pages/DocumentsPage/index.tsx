import { LazyBoundary, LoadingState, QueryErrorAlert, ResponsiveActions } from '@/components/ui';
import { formatDateTime } from '@/utils/dateTime';
import {
  DeleteOutlined,
  FolderOutlined,
  HistoryOutlined,
  InfoCircleOutlined,
  MoreOutlined,
  StopOutlined,
  PlusOutlined,
  ReloadOutlined,
  SendOutlined,
  UploadOutlined,
} from '@ant-design/icons';
import { Button, Drawer, Form, Input, Popover, Select } from 'antd';
import { lazy, Suspense } from 'react';
import { useTranslation } from 'react-i18next';
const MarkdownEditor = lazy(() =>
  import('@/components/MarkdownEditor').then((module) => ({ default: module.MarkdownEditor }))
);

import {
  AppPage,
  DrawerForm,
  FormGrid,
  PageStack,
  Popconfirm,
  ScrollRegion,
  SidebarMenu,
  Stack,
} from '@/components/ui';
import './style.css';
import { useDocumentEditor } from './useDocumentEditor';
export default function DocumentsPage({ visible = true }: { visible?: boolean }) {
  const { t } = useTranslation();
  const {
    mobile,
    treeOpen,
    setTreeOpen,
    infoOpen,
    setInfoOpen,
    moreOpen,
    setMoreOpen,
    theme,
    docs,
    folders,
    active,
    error,
    setError,
    status,
    creating,
    setCreating,
    busy,
    history,
    setHistory,
    editorRef,
    load,
    flush,
    change,
    select,
    reloadDraft,
    publish,
    showHistory,
    unpublishDocument,
    deleteDocument,
    createDocument,
    restoreRevision,
    workspaceRef,
    changeBody,
    insertAttachment,
  } = useDocumentEditor(visible);
  const folderItems = (parent: string | null): any[] =>
    folders
      .filter((x) => x.parent === parent)
      .map((f) => ({
        key: `folder:${f.id}`,
        label: f.title,
        children: [
          ...folderItems(f.id),
          ...docs
            .filter((x) => x.folder === f.id)
            .map((x) => ({ key: x.id, label: `${x.title} · ${x.locale}` })),
        ],
      }));
  const documentTree = (
    <aside className="document-tree" aria-label={t('common.vocab.documentTree')}>
      <Button icon={<PlusOutlined aria-hidden />} onClick={() => setCreating(true)}>
        {t('common.actions.create')}
      </Button>
      <ScrollRegion label={t('dsdocs.documentTreeList')} axis="y" className="document-tree-scroll">
        <SidebarMenu
          selectedKeys={active ? [active.id] : []}
          onClick={({ key }) => {
            if (!key.startsWith('folder:')) void select(key);
          }}
          items={[
            ...folderItems(null),
            ...docs
              .filter((x) => !x.folder)
              .map((x) => ({ key: x.id, label: `${x.title} · ${x.locale}` })),
          ]}
        />
      </ScrollRegion>
    </aside>
  );
  const secondaryActions = active ? (
    <>
      <Button icon={<HistoryOutlined aria-hidden />} onClick={showHistory}>
        {t('common.vocab.revisionHistory')}
      </Button>
      <Button
        icon={<UploadOutlined aria-hidden />}
        onClick={() => {
          document.getElementById('document-attachment')?.click();
          setMoreOpen(false);
        }}
      >
        {t('dsdocs.insertAsset')}
      </Button>
      <Popconfirm
        title={t('common.confirm.execute')}
        description={t('dsdocs.unpublishConfirm')}
        onConfirm={unpublishDocument}
      >
        <Button color="danger" variant="outlined" icon={<StopOutlined aria-hidden />}>
          {t('common.actions.unpublish')}
        </Button>
      </Popconfirm>
      <Popconfirm
        title={t('common.confirm.execute')}
        description={t('dsdocs.deleteDocumentConfirm')}
        onConfirm={deleteDocument}
      >
        <Button color="danger" variant="outlined" icon={<DeleteOutlined aria-hidden />}>
          {t('common.actions.delete')}
        </Button>
      </Popconfirm>
    </>
  ) : null;
  return (
    <AppPage
      className="documents-page"
      extra={
        mobile ? (
          <ResponsiveActions>
            <Button icon={<FolderOutlined aria-hidden />} onClick={() => setTreeOpen(true)}>
              {t('dsdocs.documentList')}
            </Button>
            {active && (
              <Button
                icon={<InfoCircleOutlined aria-hidden />}
                aria-expanded={infoOpen}
                onClick={() => setInfoOpen(!infoOpen)}
              >
                {t('dsdocs.documentInfo')}
              </Button>
            )}
          </ResponsiveActions>
        ) : undefined
      }
    >
      <div ref={workspaceRef} className={mobile ? 'documents documents--compact' : 'documents'}>
        {!mobile && documentTree}
        <Drawer
          title={t('dsdocs.documentList')}
          placement="left"
          open={mobile && treeOpen}
          onClose={() => setTreeOpen(false)}
          size={360}
          styles={{
            wrapper: { maxWidth: 'calc(100vw - 32px)' },
            body: { padding: 0, overflow: 'hidden' },
          }}
        >
          {mobile && documentTree}
        </Drawer>
        <section className={`editor-pane${mobile && infoOpen ? ' editor-pane--info' : ''}`}>
          <PageStack className="document-editor-stack">
            {error && (
              <>
                <QueryErrorAlert
                  error={new Error(error)}
                  onRetry={() => {
                    if (!active) void load();
                    else void flush().catch(() => {});
                  }}
                />
                {active && (
                  <Popconfirm
                    title={t('common.confirm.execute')}
                    description={t('dsdocs.reloadConfirm')}
                    onConfirm={reloadDraft}
                  >
                    <Button icon={<ReloadOutlined aria-hidden />}>
                      {t('common.vocab.reload')}
                    </Button>
                  </Popconfirm>
                )}
              </>
            )}
            {active ? (
              <>
                <ScrollRegion
                  label={t('dsdocs.documentActions')}
                  axis="x"
                  className="document-actions"
                >
                  <ResponsiveActions className="document-actions-stack">
                    <span role="status">
                      {
                        {
                          saved: t('dsdocs.saved'),
                          saving: t('dsdocs.saving'),
                          pending: t('common.vocab.unsaved'),
                          saveFailed: t('dsdocs.saveFailed'),
                        }[status]
                      }
                    </span>
                    <Button
                      icon={<SendOutlined aria-hidden />}
                      type="primary"
                      loading={busy}
                      onClick={() => void publish()}
                    >
                      {t('common.actions.publish')}
                    </Button>
                    {mobile ? (
                      <Popover
                        placement="bottomRight"
                        trigger="click"
                        open={moreOpen}
                        onOpenChange={setMoreOpen}
                        content={<Stack gap="control">{secondaryActions}</Stack>}
                      >
                        <Button icon={<MoreOutlined aria-hidden />}>
                          {t('dsdocs.moreActions')}
                        </Button>
                      </Popover>
                    ) : (
                      secondaryActions
                    )}
                  </ResponsiveActions>
                </ScrollRegion>
                <Form layout="vertical" className="document-metadata" hidden={mobile && !infoOpen}>
                  <FormGrid columns={2}>
                    <Form.Item label={t('common.vocab.title')}>
                      <Input
                        allowClear
                        aria-label={t('common.vocab.title')}
                        value={active.title}
                        onChange={(e) => change({ title: e.target.value })}
                      />
                    </Form.Item>
                    <Form.Item label={t('common.vocab.path')} tooltip={t('dsdocs.slugHint')}>
                      <Input
                        allowClear
                        aria-label={t('common.vocab.path')}
                        value={active.slug}
                        onChange={(e) => change({ slug: e.target.value })}
                      />
                    </Form.Item>
                    <Form.Item label={t('common.vocab.description')}>
                      <Input
                        allowClear
                        aria-label={t('common.vocab.description')}
                        value={active.description}
                        onChange={(e) => change({ description: e.target.value })}
                      />
                    </Form.Item>
                    <Form.Item label={t('common.vocab.folder')}>
                      <Select
                        aria-label={t('common.vocab.folder')}
                        allowClear
                        value={active.folder ?? undefined}
                        options={folders.map((f) => ({ label: f.title, value: f.id }))}
                        onChange={(value) => change({ folder: value ?? null })}
                      />
                    </Form.Item>
                  </FormGrid>
                </Form>
                <div className="markdown-editor">
                  <ScrollRegion label={t('dsdocs.body')} axis="y" className="document-body-scroll">
                    <LazyBoundary>
                      <Suspense fallback={<LoadingState label={t('common.loadingPage')} />}>
                        <MarkdownEditor
                          key={active.id}
                          theme={theme}
                          active={active}
                          busy={busy}
                          editor={editorRef}
                          onChange={changeBody}
                          onError={(message) => setError(message)}
                        />
                      </Suspense>
                    </LazyBoundary>
                  </ScrollRegion>
                </div>
                <input
                  id="document-attachment"
                  type="file"
                  hidden
                  accept=".png,.jpg,.jpeg,.webp,.pdf,.txt"
                  onChange={async (e) => {
                    const file = e.target.files?.[0];
                    e.target.value = '';
                    if (!file) return;
                    await insertAttachment(file);
                  }}
                />
              </>
            ) : (
              <p>{t('dsdocs.chooseDocument')}</p>
            )}
          </PageStack>
        </section>
      </div>
      <DrawerForm
        title={t('dsdocs.createDocument')}
        open={creating}
        onOpenChange={setCreating}
        initialValues={{ locale: 'zh', description: '' }}
        onFinish={createDocument}
      >
        <Form.Item name="title" label={t('common.vocab.title')} rules={[{ required: true }]}>
          <Input allowClear />
        </Form.Item>
        <Form.Item
          name="slug"
          label={t('common.vocab.path')}
          tooltip={t('dsdocs.newSlugHint')}
          rules={[{ required: true }]}
        >
          <Input allowClear />
        </Form.Item>
        <Form.Item name="locale" label={t('common.vocab.language')} rules={[{ required: true }]}>
          <Select
            allowClear
            options={[
              { label: t('dsdocs.chinese'), value: 'zh' },
              { label: 'English', value: 'en' },
            ]}
          />
        </Form.Item>
        <Form.Item
          name="translationId"
          label={t('common.vocab.linkedTranslation')}
          tooltip={t('dsdocs.translationHint')}
        >
          <Select
            allowClear
            options={docs.map((x) => ({
              label: `${x.title} · ${x.locale}`,
              value: x.translationId,
            }))}
          />
        </Form.Item>
        <Form.Item name="folder" label={t('common.vocab.folder')}>
          <Select allowClear options={folders.map((x) => ({ label: x.title, value: x.id }))} />
        </Form.Item>
      </DrawerForm>
      <DrawerForm
        title={t('dsdocs.restoreDraft')}
        open={history !== null}
        onOpenChange={(open) => {
          if (!open) setHistory(null);
        }}
        initialValues={{ revision: undefined }}
        onFinish={restoreRevision}
      >
        <Form.Item
          name="revision"
          label={t('dsdocs.publishedVersion')}
          tooltip={t('dsdocs.restoreHint')}
          rules={[{ required: true }]}
        >
          <Select
            allowClear
            options={(history ?? []).map((item) => ({
              label: formatDateTime(item.createdAt),
              value: item.id,
            }))}
          />
        </Form.Item>
      </DrawerForm>
    </AppPage>
  );
}
