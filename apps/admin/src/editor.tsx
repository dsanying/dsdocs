import { componentRegistry } from '../../site/src/content/registry';
import { useEffect, useLayoutEffect, useRef, useState, type Ref, type RefObject } from 'react';
import { App, Button, Form, Input, InputNumber, Radio, Alert } from 'antd';
import { EyeOutlined, SaveOutlined, CloseOutlined } from '@ant-design/icons';
import { useBlocker, useNavigate, useSearchParams } from 'react-router';
import {
  MdxEditor,
  fumadocsUiComponents,
  type MdxEditorRef,
  useSourceText,
} from '@fumadocs-editor/ui';
import { api, errorMessage, upload, type Content, type Document, type Diagnostic } from './api';
import { emptyContent, equalContent, formContent } from './model';
import { Page, Action, Feedback, useResource } from './ui';
import { useText } from './i18n';
import { useSettings } from './settings';
import '@fumadocs-editor/ui/styles.css';
const componentNames = new Set(Object.keys(componentRegistry));
const editorComponents = fumadocsUiComponents.filter((component) =>
  componentNames.has(component.name)
);
const media = {
  async upload(file: File) {
    return (await upload(file)).url;
  },
};
// The ref serializes the last parsed document. Observe the live text separately so
// pending or malformed source edits remain saveable without waiting for the parser.
function SourceSnapshot({
  snapshot,
  onChange,
}: {
  snapshot: RefObject<string>;
  onChange?: (value: string) => void;
}) {
  const { value } = useSourceText(),
    callback = useRef(onChange);
  useEffect(() => {
    callback.current = onChange;
  }, [onChange]);
  useLayoutEffect(() => {
    snapshot.current = value;
    callback.current?.(value);
  }, [value, snapshot]);
  return null;
}
function SourceField({
  value = '',
  onChange,
  editorRef,
  snapshot,
  disabled,
}: {
  value?: string;
  onChange?: (text: string) => void;
  editorRef: Ref<MdxEditorRef>;
  snapshot: RefObject<string>;
  disabled?: boolean;
}) {
  const { t } = useText(),
    { mode } = useSettings();
  return (
    <div role="group" aria-label={t('source')} className="mdx-editor">
      <MdxEditor
        ref={editorRef}
        defaultValue={value}
        editable={!disabled}
        theme={mode}
        components={editorComponents}
        syntax={{ math: true, headingSuffixes: false }}
        media={media}
        header={{ end: <SourceSnapshot snapshot={snapshot} onChange={onChange} /> }}
      />
    </div>
  );
}
export function EditDocument({ id }: { id?: string }) {
  const resource = useResource<Document>(id ? `documents/${id}` : null);
  if (id && !resource.data)
    return (
      <Feedback loading={resource.loading} error={resource.error} onRetry={resource.refresh} />
    );
  return <Editor key={id ?? 'new'} document={resource.data} />;
}
function Editor({ document }: { document?: Document }) {
  const { t } = useText(),
    { notification, modal } = App.useApp(),
    navigate = useNavigate(),
    [query] = useSearchParams();
  const [form] = Form.useForm<Content>(),
    editor = useRef<MdxEditorRef>(null),
    locked = useRef(false),
    leaving = useRef(false);
  const [baseline] = useState<Content>(() =>
    document
      ? formContent(document)
      : {
          ...emptyContent,
          translationKey: query.get('translationKey') ?? crypto.randomUUID(),
          locale: query.get('locale') === 'en' ? 'en' : 'zh',
          path: query.get('path') ?? '',
        }
  );
  const sourceSnapshot = useRef(baseline.mdx);
  const currentSource = () =>
    editor.current?.getMode() === 'source'
      ? sourceSnapshot.current
      : (editor.current?.getMarkdown() ?? sourceSnapshot.current);
  const fields = Form.useWatch([], form) as Content | undefined,
    dirty = fields ? !equalContent({ ...baseline, ...fields }, baseline) : false;
  const [saving, setSaving] = useState(false),
    [preview, setPreview] = useState(''),
    [previewBusy, setPreviewBusy] = useState(false),
    [previewError, setPreviewError] = useState<unknown>(),
    [diagnostics, setDiagnostics] = useState<Diagnostic[]>([]);
  const operation = useRef<{ fingerprint: string; id: string } | undefined>(undefined),
    back = document ? `/documents/detail/${document.id}` : '/documents';
  const blocker = useBlocker(
    () =>
      !leaving.current &&
      (dirty ||
        Boolean(
          editor.current &&
          (editor.current.getMode() === 'source'
            ? sourceSnapshot.current
            : editor.current.getMarkdown()) !== baseline.mdx
        ))
  );
  useEffect(() => {
    if (blocker.state !== 'blocked') return;
    const prompt = modal.confirm({
      title: t('unsaved'),
      okText: t('leave'),
      cancelText: t('stay'),
      onOk: () => blocker.proceed(),
      onCancel: () => blocker.reset(),
    });
    return () => prompt.destroy();
  }, [blocker, modal, t]);
  useEffect(() => {
    const guard = (event: BeforeUnloadEvent) => {
      if (
        !leaving.current &&
        (dirty ||
          saving ||
          Boolean(
            editor.current &&
            (editor.current.getMode() === 'source'
              ? sourceSnapshot.current
              : editor.current.getMarkdown()) !== baseline.mdx
          ))
      ) {
        event.preventDefault();
        event.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', guard);
    return () => window.removeEventListener('beforeunload', guard);
  }, [dirty, saving, baseline.mdx]);
  async function save() {
    if (locked.current) return;
    locked.current = true;
    try {
      const values = await form.validateFields(),
        content = { ...baseline, ...values, mdx: currentSource() };
      const fingerprint = JSON.stringify(content);
      if (operation.current?.fingerprint !== fingerprint)
        operation.current = { fingerprint, id: crypto.randomUUID() };
      setSaving(true);
      const result = await api<{ document: Document; diagnostics: Diagnostic[] }>(
        document ? `documents/${document.id}` : 'documents',
        document ? 'PUT' : 'POST',
        {
          document: content,
          expectedRevision: document?.revision ?? 0,
          operationId: operation.current.id,
        }
      );
      setDiagnostics(result.diagnostics);
      notification.success({ title: t('succeeded') });
      leaving.current = true;
      navigate(`/documents/detail/${result.document.id}`);
    } catch (error) {
      if (!(error && typeof error === 'object' && 'errorFields' in error))
        notification.error({ title: t('failed'), description: errorMessage(error) });
    } finally {
      setSaving(false);
      locked.current = false;
    }
  }
  async function inspect() {
    setPreviewBusy(true);
    setPreview('');
    setPreviewError(undefined);
    try {
      const result = await api<{ url: string }>('preview', 'POST', {
        source: currentSource(),
        title: form.getFieldValue('title') ?? '',
      });
      setPreview(result.url);
    } catch (error) {
      setPreviewError(error);
    } finally {
      setPreviewBusy(false);
    }
  }
  return (
    <Page
      title={document?.draft.title ?? t('create')}
      actions={
        <>
          <Button onClick={() => navigate(back)}>{t('back')}</Button>
          <Action
            icon={<EyeOutlined aria-hidden />}
            label={t('preview')}
            loading={previewBusy}
            onClick={() => void inspect()}
          />
        </>
      }
    >
      <Form
        form={form}
        layout="vertical"
        initialValues={baseline}
        disabled={saving}
        onFinish={() => void save()}
      >
        <div className="metadata-grid">
          <Form.Item
            name="title"
            label={t('title')}
            rules={[{ required: true, max: 200, whitespace: true }]}
          >
            <Input allowClear />
          </Form.Item>
          <Form.Item
            name="path"
            label={t('path')}
            tooltip={t('pathHint')}
            rules={[
              {
                required: true,
                max: 240,
                pattern: /^[a-z0-9][a-z0-9_-]*(?:\/[a-z0-9][a-z0-9_-]*)*$/,
              },
            ]}
          >
            <Input allowClear />
          </Form.Item>
          <Form.Item name="locale" label={t('locale')}>
            <Radio.Group
              disabled={!!document}
              options={[
                { label: t('zh'), value: 'zh' },
                { label: t('en'), value: 'en' },
              ]}
            />
          </Form.Item>
          <Form.Item
            name="group"
            label={t('group')}
            tooltip={t('groupHint')}
            rules={[{ max: 200 }]}
          >
            <Input allowClear />
          </Form.Item>
          <Form.Item name="order" label={t('order')} rules={[{ required: true }]}>
            <InputNumber min={0} max={100000} />
          </Form.Item>
        </div>
        <Form.Item name="description" label={t('description')} rules={[{ max: 1000 }]}>
          <Input.TextArea autoSize={{ minRows: 2, maxRows: 6 }} />
        </Form.Item>
        <Form.Item name="mdx" label={t('body')} tooltip={t('sourceHint')}>
          <SourceField editorRef={editor} snapshot={sourceSnapshot} disabled={saving} />
        </Form.Item>
        {dirty ? (
          <div className="edit-footer">
            <Action
              icon={<CloseOutlined aria-hidden />}
              label={t('cancel')}
              disabled={saving}
              onClick={() => {
                leaving.current = true;
                navigate(back);
              }}
            />
            <Action
              icon={<SaveOutlined aria-hidden />}
              label={t('save')}
              type="primary"
              loading={saving}
              htmlType="submit"
            />
          </div>
        ) : null}
      </Form>
      {diagnostics.length ? (
        <Alert
          type="warning"
          title={t('source')}
          description={diagnostics.map((item) => (
            <div key={`${item.line}:${item.column}:${item.code}`}>
              {item.line}:{item.column} {item.message}
            </div>
          ))}
        />
      ) : null}
      <Feedback error={previewError} onRetry={() => void inspect()} />
      {preview ? <iframe className="preview-frame" title={t('preview')} src={preview} /> : null}
    </Page>
  );
}
