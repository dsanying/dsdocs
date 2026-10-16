import { useEffect, useRef, useState } from 'react';
import { Button, Alert, Form, Input, Select, Typography, Drawer, Grid, Popover } from 'antd';
import {
  PlusOutlined,
  UploadOutlined,
  SendOutlined,
  ReloadOutlined,
  DeleteOutlined,
} from '@ant-design/icons';
import {
  MDXEditor,
  headingsPlugin,
  listsPlugin,
  quotePlugin,
  thematicBreakPlugin,
  markdownShortcutPlugin,
  linkPlugin,
  linkDialogPlugin,
  imagePlugin,
  tablePlugin,
  codeBlockPlugin,
  codeMirrorPlugin,
  directivesPlugin,
  AdmonitionDirectiveDescriptor,
  toolbarPlugin,
  diffSourcePlugin,
  DiffSourceToggleWrapper,
  UndoRedo,
  BoldItalicUnderlineToggles,
  ListsToggle,
  BlockTypeSelect,
  CreateLink,
  InsertImage,
  InsertTable,
  InsertThematicBreak,
  InsertCodeBlock,
  InsertAdmonition,
  ConditionalContents,
  ChangeCodeMirrorLanguage,
  type MDXEditorMethods,
} from '@mdxeditor/editor';
import '@mdxeditor/editor/style.css';
import {
  DrawerForm,
  SidebarMenu,
  PageStack,
  Stack,
  Popconfirm,
  ScrollRegion,
} from '@/components/ui';
import { notifyActionSuccess, notifyActionFailed } from '@/utils/feedback';
import { useThemeStore } from '@/stores/useThemeStore';
import { content, upload, type Doc, type Folder } from '../services';
export function Documents({ visible = true }: { visible?: boolean }) {
  const mobile = Grid.useBreakpoint().lg === false;
  const [treeOpen, setTreeOpen] = useState(false),
    [infoOpen, setInfoOpen] = useState(false),
    [moreOpen, setMoreOpen] = useState(false);
  useEffect(() => {
    if (!mobile) {
      setTreeOpen(false);
      setMoreOpen(false);
    }
  }, [mobile]);
  const theme = useThemeStore((state) => state.mode);
  const [docs, setDocs] = useState<Doc[]>([]),
    [folders, setFolders] = useState<Folder[]>([]),
    [active, setActive] = useState<Doc | null>(null),
    [error, setError] = useState(''),
    [status, setStatus] = useState('已保存'),
    [creating, setCreating] = useState(false),
    [busy, setBusy] = useState(false),
    [history, setHistory] = useState<{ id: number; createdAt: string }[] | null>(null);
  const draft = useRef<Doc | null>(null),
    dirty = useRef(false),
    pending = useRef<Promise<void> | null>(null),
    timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined),
    editor = useRef<MDXEditorMethods>(null),
    selection = useRef(0);
  async function load() {
    try {
      const data = await content();
      setDocs(data.documents);
      setFolders(data.folders);
      if (!dirty.current) setError('');
    } catch (e) {
      setError((e as Error).message);
    }
  }
  useEffect(() => {
    if (visible) void load();
  }, [visible]);
  useEffect(() => () => clearTimeout(timer.current), []);
  useEffect(() => {
    const guard = (e: BeforeUnloadEvent) => {
      if (dirty.current || pending.current) e.preventDefault();
    };
    window.addEventListener('beforeunload', guard);
    return () => window.removeEventListener('beforeunload', guard);
  }, []);
  async function flush(): Promise<void> {
    clearTimeout(timer.current);
    if (pending.current) {
      await pending.current;
      if (dirty.current) return flush();
      return;
    }
    if (!dirty.current || !draft.current) return;
    pending.current = (async () => {
      while (dirty.current && draft.current) {
        const snapshot = { ...draft.current };
        dirty.current = false;
        setStatus('保存中');
        try {
          const result: Doc = await content(`/documents/${snapshot.id}`, 'PATCH', {
            version: snapshot.version,
            title: snapshot.title,
            slug: snapshot.slug,
            locale: snapshot.locale,
            description: snapshot.description,
            folder: snapshot.folder,
            body: snapshot.body,
          });
          draft.current = {
            ...draft.current,
            version: result.version,
            published: result.published,
          };
          setActive({ ...draft.current });
          setStatus(dirty.current ? '待保存' : '已保存');
          setError('');
          setDocs((previous) => previous.map((x) => (x.id === result.id ? result : x)));
        } catch (e) {
          dirty.current = true;
          setStatus('保存失败');
          setError((e as Error).message);
          throw e;
        }
      }
    })().finally(() => {
      pending.current = null;
    });
    return pending.current;
  }
  function change(patch: Partial<Doc>) {
    if (!draft.current) return;
    draft.current = { ...draft.current, ...patch };
    setActive({ ...draft.current });
    dirty.current = true;
    setStatus('待保存');
    clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      void flush().catch(() => {});
    }, 600);
  }
  async function select(id: string) {
    const generation = ++selection.current;
    try {
      await flush();
      const data = await content();
      setDocs(data.documents);
      if (generation !== selection.current) return;
      const next = data.documents.find((x: Doc) => x.id === id);
      if (!next) throw new Error('文档已不存在，请刷新目录。');
      draft.current = next;
      dirty.current = false;
      setActive(next);
      setTreeOpen(false);
      setStatus('已保存');
      setError('');
    } catch (e) {
      setError((e as Error).message);
    }
  }
  async function reloadDraft() {
    const id = draft.current?.id;
    if (!id) {
      await load();
      return;
    }
    clearTimeout(timer.current);
    await pending.current?.catch(() => {});
    try {
      const data = await content();
      const next = data.documents.find((item: Doc) => item.id === id);
      if (!next) throw new Error('文档已不存在。');
      if (draft.current?.id !== id) return;
      dirty.current = false;
      draft.current = next;
      setActive(next);
      setDocs(data.documents);
      editor.current?.setMarkdown(next.body);
      setStatus('已保存');
      setError('');
    } catch (error) {
      setError((error as Error).message);
    }
  }
  async function publish() {
    if (busy || !draft.current) return;
    const id = draft.current.id;
    setBusy(true);
    try {
      await flush();
      if (draft.current?.id !== id) throw new Error('文档已切换，请在目标文档重新发布。');
      const result = await content(`/documents/${id}/publish`, 'POST', {
        version: draft.current!.version,
      });
      if (draft.current?.id === id) {
        draft.current = { ...draft.current, published: result.published };
        setActive({ ...draft.current });
      }
      await load();
      notifyActionSuccess('publish');
    } catch (e) {
      notifyActionFailed('publish', e);
    } finally {
      setBusy(false);
    }
  }
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
    <aside className="document-tree" aria-label="文档目录">
      <Button icon={<PlusOutlined aria-hidden />} onClick={() => setCreating(true)}>
        新建文档
      </Button>
      <ScrollRegion label="文档目录列表" axis="y" className="document-tree-scroll">
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
      <Button
        onClick={async () => {
          try {
            await flush();
            setHistory(await content(`/documents/${active.id}/revisions`));
            setMoreOpen(false);
          } catch (e) {
            setError((e as Error).message);
          }
        }}
      >
        历史版本
      </Button>
      <Button
        icon={mobile ? undefined : <UploadOutlined aria-hidden />}
        onClick={() => {
          document.getElementById('document-attachment')?.click();
          setMoreOpen(false);
        }}
      >
        插入附件
      </Button>
      <Popconfirm
        title="撤下此文档？读者端将不再显示。"
        onConfirm={async () => {
          await flush();
          await content(`/documents/${active.id}/unpublish`, 'POST', {});
          await load();
          setMoreOpen(false);
          notifyActionSuccess('update');
        }}
      >
        <Button>撤下</Button>
      </Popconfirm>
      <Popconfirm
        title="删除文档及其历史版本？"
        onConfirm={async () => {
          await flush();
          await content(`/documents/${active.id}`, 'DELETE', {});
          draft.current = null;
          setActive(null);
          await load();
          setMoreOpen(false);
          notifyActionSuccess('delete');
        }}
      >
        <Button danger icon={mobile ? undefined : <DeleteOutlined aria-hidden />}>
          删除
        </Button>
      </Popconfirm>
    </>
  ) : null;
  return (
    <div className="documents">
      {!mobile && documentTree}
      <Drawer
        title="文档列表"
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
        <PageStack>
          <div className="document-heading">
            <Typography.Title level={1}>文档编辑</Typography.Title>
            <div className="mobile-document-tools">
              <Button onClick={() => setTreeOpen(true)}>文档列表</Button>
              {active && (
                <Button aria-expanded={infoOpen} onClick={() => setInfoOpen(!infoOpen)}>
                  文档信息
                </Button>
              )}
            </div>
          </div>
          {error && (
            <Alert
              title={error}
              type="error"
              action={
                <Stack direction="row" gap="control" wrap align="center">
                  <Button
                    icon={<ReloadOutlined aria-hidden />}
                    onClick={() => {
                      if (!active) void load();
                      else void flush().catch(() => {});
                    }}
                  >
                    {active ? '重试保存' : '重试读取'}
                  </Button>
                  {active && (
                    <Popconfirm
                      title="重新加载将丢弃当前未保存的改动，继续？"
                      onConfirm={reloadDraft}
                    >
                      <Button icon={<ReloadOutlined aria-hidden />}>重新加载</Button>
                    </Popconfirm>
                  )}
                </Stack>
              }
            />
          )}
          {active ? (
            <>
              <ScrollRegion label="文档操作" axis="x" className="document-actions">
                <Stack direction="row" gap="control" align="center">
                  <span role="status">{status}</span>
                  <Button
                    icon={mobile ? undefined : <SendOutlined aria-hidden />}
                    type="primary"
                    loading={busy}
                    onClick={() => void publish()}
                  >
                    发布
                  </Button>
                  {mobile ? (
                    <Popover
                      placement="bottomRight"
                      trigger="click"
                      open={moreOpen}
                      onOpenChange={setMoreOpen}
                      content={<Stack gap="control">{secondaryActions}</Stack>}
                    >
                      <Button>更多操作</Button>
                    </Popover>
                  ) : (
                    secondaryActions
                  )}
                </Stack>
              </ScrollRegion>
              <Form layout="vertical" className="document-metadata" hidden={mobile && !infoOpen}>
                <Form.Item label="标题">
                  <Input
                    aria-label="标题"
                    value={active.title}
                    onChange={(e) => change({ title: e.target.value })}
                  />
                </Form.Item>
                <Form.Item label="路径" tooltip="小写字母、数字、连字符，可用斜线分级。">
                  <Input
                    aria-label="路径"
                    value={active.slug}
                    onChange={(e) => change({ slug: e.target.value })}
                  />
                </Form.Item>
                <Form.Item label="简介">
                  <Input
                    aria-label="简介"
                    value={active.description}
                    onChange={(e) => change({ description: e.target.value })}
                  />
                </Form.Item>
                <Form.Item label="所属目录">
                  <Select
                    aria-label="所属目录"
                    allowClear
                    value={active.folder ?? undefined}
                    options={folders.map((f) => ({ label: f.title, value: f.id }))}
                    onChange={(value) => change({ folder: value ?? null })}
                  />
                </Form.Item>
              </Form>
              <div className="markdown-editor">
                <ScrollRegion label="文档正文" axis="y" className="document-body-scroll">
                  <MDXEditor
                    className={theme === 'dark' ? 'dark-theme' : undefined}
                    key={active.id}
                    readOnly={busy}
                    ref={editor}
                    markdown={active.body}
                    suppressHtmlProcessing
                    onChange={(body) => {
                      if (body !== draft.current?.body) change({ body });
                    }}
                    onError={({ error }) => setError(`正文格式错误：${error}`)}
                    contentEditableClassName="document-prose"
                    plugins={[
                      headingsPlugin(),
                      listsPlugin(),
                      quotePlugin(),
                      thematicBreakPlugin(),
                      markdownShortcutPlugin(),
                      linkPlugin(),
                      linkDialogPlugin(),
                      imagePlugin({
                        imagePreviewHandler: async (src) =>
                          src.replace('/docs/assets/', '/__dsdocs_content/assets/'),
                        imageUploadHandler: async (file) => (await upload(file)).src,
                      }),
                      tablePlugin(),
                      codeBlockPlugin({ defaultCodeBlockLanguage: 'text' }),
                      codeMirrorPlugin({
                        codeBlockLanguages: {
                          text: '纯文本',
                          bash: 'Shell',
                          json: 'JSON',
                          python: 'Python',
                          js: 'JavaScript',
                          ts: 'TypeScript',
                          yaml: 'YAML',
                          sql: 'SQL',
                        },
                      }),
                      directivesPlugin({ directiveDescriptors: [AdmonitionDirectiveDescriptor] }),
                      diffSourcePlugin(),
                      toolbarPlugin({
                        toolbarClassName: 'document-toolbar',
                        toolbarContents: () => (
                          <DiffSourceToggleWrapper>
                            <UndoRedo />
                            <BoldItalicUnderlineToggles options={['Bold', 'Italic']} />
                            <ListsToggle />
                            <BlockTypeSelect />
                            <CreateLink />
                            <InsertImage />
                            <InsertTable />
                            <InsertAdmonition />
                            <InsertThematicBreak />
                            <ConditionalContents
                              options={[
                                {
                                  when: (e) => e?.editorType === 'codeblock',
                                  contents: () => <ChangeCodeMirrorLanguage />,
                                },
                                { fallback: () => <InsertCodeBlock /> },
                              ]}
                            />
                          </DiffSourceToggleWrapper>
                        ),
                      }),
                    ]}
                  />
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
                  try {
                    const asset = await upload(file);
                    editor.current?.insertMarkdown(
                      `\n[${asset.name.replace(/[\[\]\\]/g, '')}](${asset.src})\n`
                    );
                    notifyActionSuccess('upload');
                  } catch (error) {
                    notifyActionFailed('upload', error);
                  }
                }}
              />
            </>
          ) : (
            <p>从目录选择文档，或新建第一篇文档。</p>
          )}
        </PageStack>
      </section>
      <DrawerForm
        title="新建文档"
        open={creating}
        onOpenChange={setCreating}
        initialValues={{ locale: 'zh', description: '' }}
        onFinish={async (values) => {
          try {
            await flush();
            const next = await content('/documents', 'POST', values);
            await load();
            await select(next.id);
            notifyActionSuccess('create');
            return true;
          } catch (e) {
            notifyActionFailed('create', e);
            return false;
          }
        }}
      >
        <Form.Item name="title" label="标题" rules={[{ required: true }]}>
          <Input />
        </Form.Item>
        <Form.Item
          name="slug"
          label="路径"
          tooltip="例如 getting-started，发布后作为访问路径。"
          rules={[{ required: true }]}
        >
          <Input />
        </Form.Item>
        <Form.Item name="locale" label="语言" rules={[{ required: true }]}>
          <Select
            options={[
              { label: '简体中文', value: 'zh' },
              { label: 'English', value: 'en' },
            ]}
          />
        </Form.Item>
        <Form.Item
          name="translationId"
          label="关联翻译"
          tooltip="选择对应的另一语言文档；留空表示独立文档。"
        >
          <Select
            allowClear
            options={docs.map((x) => ({
              label: `${x.title} · ${x.locale}`,
              value: x.translationId,
            }))}
          />
        </Form.Item>
        <Form.Item name="folder" label="所属目录">
          <Select allowClear options={folders.map((x) => ({ label: x.title, value: x.id }))} />
        </Form.Item>
      </DrawerForm>
      <DrawerForm
        title="恢复历史到草稿"
        open={history !== null}
        onOpenChange={(open) => {
          if (!open) setHistory(null);
        }}
        initialValues={{ revision: undefined }}
        onFinish={async (values) => {
          try {
            await flush();
            const restored = await content(`/documents/${draft.current!.id}/restore`, 'POST', {
              revision: values.revision,
              version: draft.current!.version,
            });
            draft.current = restored;
            dirty.current = false;
            setActive(restored);
            editor.current?.setMarkdown(restored.body);
            setStatus('已保存');
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
          name="revision"
          label="发布版本"
          tooltip="恢复只更新草稿；点击发布后才替换读者内容。"
          rules={[{ required: true }]}
        >
          <Select
            options={(history ?? []).map((item) => ({ label: item.createdAt, value: item.id }))}
          />
        </Form.Item>
      </DrawerForm>
    </div>
  );
}
