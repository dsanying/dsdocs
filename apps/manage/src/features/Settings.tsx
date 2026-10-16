import { useEffect, useState } from 'react';
import {
  Alert,
  Button,
  Form,
  Input,
  InputNumber,
  Select,
  Switch,
  Tabs,
  Typography,
  Upload,
  ColorPicker,
} from 'antd';
import { PlusOutlined, DeleteOutlined, ReloadOutlined } from '@ant-design/icons';
import { EntityEditPage, FormGrid, PageStack, Stack, InformationFieldGrid } from '@/components/ui';
import { useFormDirty } from '@/hooks/useFormDirty';
import { notifyActionFailed, notifyActionSuccess } from '@/utils/feedback';
import { content, upload, type Doc } from '../services';
import { defaultSettings, type SiteSettings } from '../../../../packages/content/settings.mjs';
type Snapshot = { version: number; data: SiteSettings };
function ImageField({
  value,
  onChange,
}: {
  value?: string | null;
  onChange?: (value: string | null) => void;
}) {
  const [busy, setBusy] = useState(false);
  return (
    <Stack direction="row" gap="control" align="center" wrap>
      {value && (
        <img
          width={40}
          height={40}
          style={{ objectFit: 'contain' }}
          src={`/__dsdocs_content/assets/${value}`}
          alt="当前图片"
        />
      )}
      <Upload
        accept="image/png,image/jpeg,image/webp"
        showUploadList={false}
        beforeUpload={async (file) => {
          setBusy(true);
          try {
            const item = await upload(file);
            onChange?.(item.id);
            notifyActionSuccess('upload');
          } catch (e) {
            notifyActionFailed('upload', e);
          } finally {
            setBusy(false);
          }
          return false;
        }}
      >
        <Button loading={busy}>上传图片</Button>
      </Upload>
      {value && <Button onClick={() => onChange?.(null)}>清除</Button>}
    </Stack>
  );
}
export function Settings({ onSaved }: { onSaved: (value: SiteSettings) => void }) {
  const [form] = Form.useForm<SiteSettings>();
  const [snapshot, setSnapshot] = useState<Snapshot>(),
    [error, setError] = useState(''),
    [loading, setLoading] = useState(true),
    [saving, setSaving] = useState(false),
    [docs, setDocs] = useState<Doc[]>([]),
    [runtime, setRuntime] = useState<Record<string, string>>({});
  const dirty = useFormDirty(form, snapshot?.data as unknown as Record<string, unknown>);
  async function load() {
    setLoading(true);
    try {
      const [value, workspace, info] = await Promise.all([
        content('/settings'),
        content(),
        content('/runtime'),
      ]);
      setSnapshot(value);
      onSaved(value.data);
      form.setFieldsValue(value.data);
      setDocs(workspace.documents.filter((doc: Doc) => doc.published));
      setRuntime(info);
      setError('');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    void load();
  }, []);
  useEffect(() => {
    const guard = (event: BeforeUnloadEvent) => {
      if (dirty) {
        event.preventDefault();
        event.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', guard);
    return () => window.removeEventListener('beforeunload', guard);
  }, [dirty]);
  async function save() {
    try {
      const data = await form.validateFields();
      setSaving(true);
      const next = await content('/settings', 'PATCH', { version: snapshot?.version, data });
      setSnapshot(next);
      form.setFieldsValue(next.data);
      onSaved(next.data);
      notifyActionSuccess('save');
    } catch (e) {
      notifyActionFailed('save', e);
    } finally {
      setSaving(false);
    }
  }
  const select = (values: { label: string; value: string }[]) => <Select options={values} />;
  return (
    <EntityEditPage
      title="网站设置"
      backTo="/"
      query={{ ready: !!snapshot, loading, error, onRetry: () => void load() }}
      actions={
        <Stack direction="row" gap="control">
          <Button
            disabled={dirty || saving || loading}
            icon={<ReloadOutlined aria-hidden />}
            onClick={() => void load()}
          >
            重新加载
          </Button>
          <Button
            disabled={saving || loading}
            onClick={() => form.setFieldsValue(structuredClone(defaultSettings))}
          >
            恢复默认值
          </Button>
        </Stack>
      }
      saveBar={{
        dirty,
        saving,
        onSave: () => void save(),
        onCancel: () => form.setFieldsValue(snapshot!.data),
      }}
    >
      <Form form={form} layout="vertical" disabled={saving || loading}>
        <Tabs
          items={[
            {
              key: 'basic',
              label: '基本信息',
              forceRender: true,
              children: (
                <>
                  <FormGrid columns={2}>
                    <Form.Item
                      name="siteName"
                      label="网站名称"
                      rules={[{ required: true, max: 80 }]}
                    >
                      <Input maxLength={80} />
                    </Form.Item>
                    <Form.Item
                      name="description"
                      label="网站简介"
                      tooltip="显示在网页描述信息中，最多 300 字。"
                    >
                      <Input maxLength={300} />
                    </Form.Item>
                    <Form.Item
                      name="logoAssetId"
                      label="网站标识"
                      tooltip="PNG、JPEG 或 WebP，最大 5 MiB；仅保存后对读者可见。"
                    >
                      <ImageField />
                    </Form.Item>
                    <Form.Item
                      name="faviconAssetId"
                      label="浏览器图标"
                      tooltip="使用 PNG、JPEG 或 WebP 图片。"
                    >
                      <ImageField />
                    </Form.Item>
                  </FormGrid>
                  <Form.Item name="footerText" label="页脚文字">
                    <Input.TextArea maxLength={500} rows={2} />
                  </Form.Item>
                  <Form.List name="footerLinks">
                    {(fields, { add, remove }) => (
                      <PageStack>
                        {fields.map((field) => (
                          <Stack key={field.key} direction="row" gap="control" align="start">
                            <Form.Item
                              name={[field.name, 'label']}
                              label="链接名称"
                              rules={[{ required: true, max: 40 }]}
                            >
                              <Input />
                            </Form.Item>
                            <Form.Item
                              name={[field.name, 'url']}
                              label="链接地址"
                              tooltip="支持 https://、http://、mailto:、/docs/ 站内路径及锚点。"
                              rules={[{ required: true, max: 500 }]}
                            >
                              <Input />
                            </Form.Item>
                            <Button
                              aria-label="删除链接"
                              danger
                              icon={<DeleteOutlined aria-hidden />}
                              onClick={() => remove(field.name)}
                            />
                          </Stack>
                        ))}
                        {fields.length < 5 && (
                          <Button
                            icon={<PlusOutlined aria-hidden />}
                            onClick={() => add({ label: '', url: '' })}
                          >
                            添加页脚链接
                          </Button>
                        )}
                      </PageStack>
                    )}
                  </Form.List>
                </>
              ),
            },
            {
              key: 'appearance',
              label: '阅读外观',
              forceRender: true,
              children: (
                <FormGrid columns={2}>
                  <Form.Item
                    name="baseFontSize"
                    label="基准字号"
                    tooltip="14–20 px，标题和控件随基准字号缩放。"
                  >
                    <InputNumber min={14} max={20} addonAfter="px" />
                  </Form.Item>
                  <Form.Item name="lineHeight" label="正文行高" tooltip="字号的 1.4–2.2 倍。">
                    <InputNumber min={1.4} max={2.2} step={0.05} />
                  </Form.Item>
                  <Form.Item name="fontFamily" label="正文字体">
                    {select([
                      { label: '系统无衬线', value: 'system' },
                      { label: '衬线字体', value: 'serif' },
                    ])}
                  </Form.Item>
                  <Form.Item
                    name="accentColor"
                    label="品牌色"
                    tooltip="链接等原生主题元素使用该色；明暗模式自动调整可读性。"
                    getValueFromEvent={(_, css) => css}
                  >
                    <ColorPicker disabledAlpha format="hex" showText />
                  </Form.Item>
                  <Form.Item
                    name="theme"
                    label="默认主题"
                    tooltip="新访客使用此主题；手动切换优先。"
                  >
                    {select([
                      { label: '跟随系统', value: 'system' },
                      { label: '浅色', value: 'light' },
                      { label: '深色', value: 'dark' },
                    ])}
                  </Form.Item>
                  <Form.Item name="contentWidth" label="阅读宽度">
                    {select([
                      { label: '标准', value: 'normal' },
                      { label: '宽屏', value: 'wide' },
                    ])}
                  </Form.Item>
                </FormGrid>
              ),
            },
            {
              key: 'reading',
              label: '导航与语言',
              forceRender: true,
              children: (
                <FormGrid columns={2}>
                  <Form.Item
                    name="defaultLanguage"
                    label="初始语言"
                    tooltip="仅首次进入 /docs 时生效；读者手动选择后记住该选择。"
                  >
                    {select([
                      { label: '浏览器语言', value: 'auto' },
                      { label: '简体中文', value: 'zh' },
                      { label: 'English', value: 'en' },
                    ])}
                  </Form.Item>
                  <Form.Item
                    name="homeTranslationId"
                    label="首页文档"
                    tooltip="选择已发布文档；切换语言时使用关联翻译，无可用翻译则使用默认首页。"
                    normalize={(value) => value ?? null}
                  >
                    <Select
                      allowClear
                      options={[
                        ...new Map(
                          docs.map((doc) => [
                            doc.translationId,
                            { value: doc.translationId, label: doc.title },
                          ])
                        ).values(),
                      ]}
                    />
                  </Form.Item>
                  {(
                    [
                      ['showToc', '本页目录'],
                      ['showBreadcrumb', '面包屑导航'],
                      ['showPreviousNext', '上一篇与下一篇'],
                      ['searchEnabled', '文档搜索'],
                    ] as const
                  ).map(([name, label]) => (
                    <Form.Item key={name} name={name} label={label} valuePropName="checked">
                      <Switch />
                    </Form.Item>
                  ))}
                </FormGrid>
              ),
            },
          ]}
        />
      </Form>
      <Typography.Title level={2}>运行信息</Typography.Title>
      <InformationFieldGrid
        items={Object.entries(runtime).map(([key, value]) => ({
          key,
          label:
            (
              { node: 'Node.js', database: '存储', workspace: '可编辑文件目录' } as Record<
                string,
                string
              >
            )[key] ?? key,
          value,
          ...(key === 'workspace' ? { span: 'full' as const } : {}),
        }))}
      />
    </EntityEditPage>
  );
}
type Issue = {
  key: string;
  path: string;
  message: string;
  fileHash: string | null;
  version: string | null;
  canUsePanel: boolean;
  canUseFile: boolean;
  fileText?: string;
  panelText?: string;
};
export function FileSync() {
  const [status, setStatus] = useState<{ directory: string; issues: Issue[] }>(),
    [error, setError] = useState(''),
    [comparison, setComparison] = useState<Issue>(),
    [busy, setBusy] = useState(false);
  async function load() {
    try {
      setStatus(await content('/files'));
      setError('');
      setComparison(undefined);
    } catch (e) {
      setError((e as Error).message);
    }
  }
  useEffect(() => {
    void load();
  }, []);
  async function resolve(source: 'file' | 'panel') {
    if (!comparison) return;
    setBusy(true);
    try {
      await content('/files/resolve', 'POST', {
        key: comparison.key,
        source,
        fileHash: comparison.fileHash,
        version: comparison.version,
      });
      await load();
      notifyActionSuccess('save');
    } catch (e) {
      notifyActionFailed('save', e);
    } finally {
      setBusy(false);
    }
  }
  return (
    <PageStack>
      <Typography.Title level={1}>文件同步</Typography.Title>
      <Button icon={<ReloadOutlined aria-hidden />} onClick={() => void load()}>
        重新检查
      </Button>
      {error && <Alert type="error" title={error} />}
      <Typography.Paragraph copyable>{status?.directory}</Typography.Paragraph>
      <Typography.Paragraph>
        site.json 为网站设置；documents 中的 Markdown 与 folders 中的 JSON
        均可直接编辑。文档文件修改进入草稿，发布后读者可见。删除文件不会删除文档；两边同时修改时先处理冲突。
      </Typography.Paragraph>
      {status?.issues.length === 0 && <Alert type="success" title="文件与面板已同步" />}
      {status?.issues.map((issue) => (
        <Alert
          key={issue.key}
          type="warning"
          title={issue.path}
          description={issue.message}
          action={
            <Button
              aria-label="比较"
              onClick={async () => {
                try {
                  setComparison(await content('/files/compare', 'POST', { key: issue.key }));
                } catch (e) {
                  notifyActionFailed('sync', e);
                }
              }}
            >
              比较
            </Button>
          }
        />
      ))}
      {comparison && (
        <>
          <FormGrid columns={2}>
            <Form.Item label="文件内容">
              <Input.TextArea readOnly rows={16} value={comparison.fileText ?? ''} />
            </Form.Item>
            <Form.Item label="面板内容">
              <Input.TextArea readOnly rows={16} value={comparison.panelText ?? ''} />
            </Form.Item>
          </FormGrid>
          <Stack direction="row" gap="control">
            <Button disabled={!comparison.canUseFile || busy} onClick={() => void resolve('file')}>
              采用文件版本
            </Button>
            <Button
              disabled={!comparison.canUsePanel || busy}
              onClick={() => void resolve('panel')}
            >
              采用面板版本
            </Button>
          </Stack>
        </>
      )}
    </PageStack>
  );
}
