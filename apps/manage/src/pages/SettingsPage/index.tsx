import {
  EntityEditPage,
  FormGrid,
  IconButton,
  InformationFieldGrid,
  PageStack,
  Popconfirm,
  ResponsiveActions,
  ResponsiveTabs,
  Stack,
} from '@/components/ui';
import { DeleteOutlined, PlusOutlined, ReloadOutlined } from '@ant-design/icons';
import { Button, ColorPicker, Form, Input, InputNumber, Select, Switch, Typography } from 'antd';
import { useTranslation } from 'react-i18next';
import { defaultSettings } from '../../../../../packages/content/settings.mjs';
import { ImageField } from './components/ImageField';
import { useSettingsEditor } from './useSettingsEditor';
export default function SettingsPage({ visible = true }: { visible?: boolean }) {
  const { t } = useTranslation();
  const { form, snapshot, error, loading, saving, docs, runtime, dirty, load, save } =
    useSettingsEditor();
  const select = (values: { label: string; value: string }[]) => (
    <Select allowClear options={values} />
  );
  return (
    <EntityEditPage
      backTo="/"
      objectName={snapshot?.data.siteName}
      query={{ ready: !!snapshot, loading, error, onRetry: () => void load() }}
      actions={
        <ResponsiveActions>
          <Button
            disabled={dirty || saving || loading}
            icon={<ReloadOutlined aria-hidden />}
            onClick={() => void load()}
          >
            {t('common.vocab.reload')}
          </Button>
          <Button
            icon={<ReloadOutlined aria-hidden />}
            disabled={saving || loading}
            onClick={() => form.setFieldsValue(structuredClone(defaultSettings))}
          >
            {t('dsdocs.resetDefaults')}
          </Button>
        </ResponsiveActions>
      }
      saveBar={{
        dirty: visible && dirty,
        saving,
        onSave: () => void save(),
        onCancel: () => form.setFieldsValue(snapshot!.data),
      }}
    >
      <Form form={form} layout="vertical" disabled={saving || loading}>
        <ResponsiveTabs
          items={[
            {
              key: 'basic',
              label: t('dsdocs.basic'),
              forceRender: true,
              children: (
                <>
                  <FormGrid columns={2}>
                    <Form.Item
                      name="siteName"
                      label={t('dsdocs.siteName')}
                      rules={[{ required: true, max: 80 }]}
                    >
                      <Input allowClear maxLength={80} />
                    </Form.Item>
                    <Form.Item
                      name="description"
                      label={t('dsdocs.siteDescription')}
                      tooltip={t('dsdocs.siteDescriptionHint')}
                    >
                      <Input allowClear maxLength={300} />
                    </Form.Item>
                    <Form.Item
                      name="logoAssetId"
                      label={t('dsdocs.logo')}
                      tooltip={t('dsdocs.logoHint')}
                    >
                      <ImageField />
                    </Form.Item>
                    <Form.Item
                      name="faviconAssetId"
                      label={t('dsdocs.favicon')}
                      tooltip={t('dsdocs.faviconHint')}
                    >
                      <ImageField />
                    </Form.Item>
                  </FormGrid>
                  <Form.Item name="footerText" label={t('dsdocs.footerText')}>
                    <Input.TextArea allowClear maxLength={500} rows={2} />
                  </Form.Item>
                  <Form.List name="footerLinks">
                    {(fields, { add, remove }) => (
                      <PageStack>
                        {fields.map((field) => (
                          <Stack key={field.key} direction="row" gap="control" align="start">
                            <Form.Item
                              name={[field.name, 'label']}
                              label={t('dsdocs.linkName')}
                              rules={[{ required: true, max: 40 }]}
                            >
                              <Input allowClear />
                            </Form.Item>
                            <Form.Item
                              name={[field.name, 'url']}
                              label={t('dsdocs.linkUrl')}
                              tooltip={t('dsdocs.linkHint')}
                              rules={[{ required: true, max: 500 }]}
                            >
                              <Input allowClear />
                            </Form.Item>
                            <Popconfirm
                              title={t('common.confirm.execute')}
                              description={t('dsdocs.deleteLink')}
                              onConfirm={() => remove(field.name)}
                            >
                              <IconButton
                                label={t('common.actions.delete')}
                                color="danger"
                                variant="outlined"
                                icon={<DeleteOutlined aria-hidden />}
                              />
                            </Popconfirm>
                          </Stack>
                        ))}
                        {fields.length < 5 && (
                          <Button
                            icon={<PlusOutlined aria-hidden />}
                            onClick={() => add({ label: '', url: '' })}
                          >
                            {t('dsdocs.addFooterLink')}
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
              label: t('dsdocs.appearance'),
              forceRender: true,
              children: (
                <FormGrid columns={2}>
                  <Form.Item
                    name="baseFontSize"
                    label={t('common.vocab.baseFontSize')}
                    tooltip={t('dsdocs.fontSizeHint')}
                  >
                    <InputNumber min={14} max={20} addonAfter="px" />
                  </Form.Item>
                  <Form.Item
                    name="lineHeight"
                    label={t('dsdocs.lineHeight')}
                    tooltip={t('dsdocs.lineHeightHint')}
                  >
                    <InputNumber min={1.4} max={2.2} step={0.05} />
                  </Form.Item>
                  <Form.Item name="fontFamily" label={t('dsdocs.fontFamily')}>
                    {select([
                      { label: t('dsdocs.sansSerif'), value: 'system' },
                      { label: t('common.vocab.serif'), value: 'serif' },
                    ])}
                  </Form.Item>
                  <Form.Item
                    name="accentColor"
                    label={t('dsdocs.accentColor')}
                    tooltip={t('dsdocs.accentColorHint')}
                    getValueFromEvent={(_, css) => css}
                  >
                    <ColorPicker disabledAlpha format="hex" showText />
                  </Form.Item>
                  <Form.Item
                    name="theme"
                    label={t('dsdocs.defaultTheme')}
                    tooltip={t('dsdocs.defaultThemeHint')}
                  >
                    {select([
                      { label: t('common.vocab.system'), value: 'system' },
                      { label: t('common.vocab.light'), value: 'light' },
                      { label: t('common.vocab.dark'), value: 'dark' },
                    ])}
                  </Form.Item>
                  <Form.Item name="contentWidth" label={t('dsdocs.contentWidth')}>
                    {select([
                      { label: t('dsdocs.normalWidth'), value: 'normal' },
                      { label: t('dsdocs.wideWidth'), value: 'wide' },
                    ])}
                  </Form.Item>
                </FormGrid>
              ),
            },
            {
              key: 'reading',
              label: t('dsdocs.navigationLanguage'),
              forceRender: true,
              children: (
                <FormGrid columns={2}>
                  <Form.Item
                    name="defaultLanguage"
                    label={t('dsdocs.initialLanguage')}
                    tooltip={t('dsdocs.initialLanguageHint')}
                  >
                    {select([
                      { label: t('dsdocs.browserLanguage'), value: 'auto' },
                      { label: t('dsdocs.chinese'), value: 'zh' },
                      { label: 'English', value: 'en' },
                    ])}
                  </Form.Item>
                  <Form.Item
                    name="homeTranslationId"
                    label={t('dsdocs.homeDocument')}
                    tooltip={t('dsdocs.homeDocumentHint')}
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
                      ['showToc', t('dsdocs.toc')],
                      ['showBreadcrumb', t('dsdocs.breadcrumbs')],
                      ['showPreviousNext', t('dsdocs.previousNext')],
                      ['searchEnabled', t('dsdocs.search')],
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
      <Typography.Title level={2}>{t('dsdocs.runtime')}</Typography.Title>
      <InformationFieldGrid
        items={Object.entries(runtime).map(([key, value]) => ({
          key,
          label:
            (
              {
                node: 'Node.js',
                database: t('dsdocs.storage'),
                workspace: t('dsdocs.workspace'),
              } as Record<string, string>
            )[key] ?? key,
          value,
          ...(key === 'workspace' ? { span: 'full' as const } : {}),
        }))}
      />
    </EntityEditPage>
  );
}
