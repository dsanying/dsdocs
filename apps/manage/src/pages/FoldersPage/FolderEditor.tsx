import { DrawerForm } from '@/components/ui';
import { type Folder } from '@/services';
import { Form, Input, Select } from 'antd';
import { useTranslation } from 'react-i18next';

export function FolderEditor({
  editing,
  onClose,
  onFinish,
  rows,
}: {
  editing: Partial<Folder> | null;
  onClose: () => void;
  onFinish: (values: Record<string, unknown>) => Promise<boolean>;
  rows: Folder[];
}) {
  const { t } = useTranslation();
  return (
    <DrawerForm
      title={editing?.id ? t('dsdocs.editFolder') : t('dsdocs.createFolder')}
      open={!!editing}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      initialValues={{
        title: editing?.title ?? '',
        titleEn: editing?.titleEn ?? '',
        parent: editing?.parent ?? undefined,
      }}
      onFinish={onFinish}
    >
      <Form.Item name="title" label={t('dsdocs.chineseName')} rules={[{ required: true }]}>
        <Input allowClear />
      </Form.Item>
      <Form.Item name="titleEn" label={t('dsdocs.englishName')} rules={[{ required: true }]}>
        <Input allowClear />
      </Form.Item>
      <Form.Item name="parent" label={t('dsdocs.parentFolder')}>
        <Select
          allowClear
          options={rows
            .filter((x) => x.id !== editing?.id)
            .map((x) => ({ label: x.title, value: x.id }))}
        />
      </Form.Item>
    </DrawerForm>
  );
}
