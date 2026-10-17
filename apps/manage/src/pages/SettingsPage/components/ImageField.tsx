import { ResponsiveActions } from '@/components/ui';
import { upload } from '@/services';
import { notifyActionFailed, notifyActionSuccess } from '@/utils/feedback';
import { CloseCircleOutlined, UploadOutlined } from '@ant-design/icons';
import { Button, Upload } from 'antd';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
export function ImageField({
  value,
  onChange,
}: {
  value?: string | null;
  onChange?: (value: string | null) => void;
}) {
  const { t } = useTranslation();
  const [busy, setBusy] = useState(false);
  return (
    <ResponsiveActions>
      {value && (
        <img
          width={40}
          height={40}
          style={{ objectFit: 'contain' }}
          src={`/__dsdocs_content/assets/${value}`}
          alt={t('dsdocs.currentImage')}
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
        <Button icon={<UploadOutlined aria-hidden />} loading={busy}>
          {t('common.actions.upload')}
        </Button>
      </Upload>
      {value && (
        <Button icon={<CloseCircleOutlined aria-hidden />} onClick={() => onChange?.(null)}>
          {t('common.actions.clear')}
        </Button>
      )}
    </ResponsiveActions>
  );
}
