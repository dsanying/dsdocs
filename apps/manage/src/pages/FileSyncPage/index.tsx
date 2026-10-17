import {
  AppPage,
  CopyableValue,
  FormGrid,
  QueryErrorAlert,
  ResponsiveActions,
} from '@/components/ui';
import { useRequest } from '@/hooks/useRequest';
import { content } from '@/services';
import { notifyActionFailed, notifyActionSuccess } from '@/utils/feedback';
import { DiffOutlined, FileTextOutlined, FormOutlined, ReloadOutlined } from '@ant-design/icons';
import { Alert, Button, Form, Input, Typography } from 'antd';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
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
export default function FileSyncPage() {
  const { t } = useTranslation();
  const [status, setStatus] = useState<{ directory: string; issues: Issue[] }>(),
    [error, setError] = useState<unknown>(),
    [comparison, setComparison] = useState<Issue>(),
    [busy, setBusy] = useState(false);
  async function load() {
    try {
      setStatus(await content('/files'));
      setError(undefined);
      setComparison(undefined);
    } catch (e) {
      setError(e);
    }
  }
  useRequest(load);
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
    <AppPage>
      <Button icon={<ReloadOutlined aria-hidden />} onClick={() => void load()}>
        {t('dsdocs.recheck')}
      </Button>
      <QueryErrorAlert error={error} onRetry={() => void load()} />
      <CopyableValue text={status?.directory ?? ''} />
      <Typography.Paragraph>{t('dsdocs.filesHint')}</Typography.Paragraph>
      {!error && status?.issues.length === 0 && (
        <Alert type="success" title={t('dsdocs.filesSynced')} />
      )}
      {status?.issues.map((issue) => (
        <Alert
          key={issue.key}
          type="warning"
          title={issue.path}
          description={issue.message}
          action={
            <Button
              icon={<DiffOutlined aria-hidden />}
              aria-label={t('dsdocs.compare')}
              onClick={async () => {
                try {
                  setComparison(await content('/files/compare', 'POST', { key: issue.key }));
                  setError(undefined);
                } catch (e) {
                  setError(e);
                }
              }}
            >
              {t('dsdocs.compare')}
            </Button>
          }
        />
      ))}
      {comparison && (
        <>
          <FormGrid columns={2}>
            <Form.Item label={t('dsdocs.fileContent')}>
              <Input.TextArea
                allowClear={false}
                readOnly
                rows={16}
                value={comparison.fileText ?? ''}
              />
            </Form.Item>
            <Form.Item label={t('dsdocs.panelContent')}>
              <Input.TextArea
                allowClear={false}
                readOnly
                rows={16}
                value={comparison.panelText ?? ''}
              />
            </Form.Item>
          </FormGrid>
          <ResponsiveActions>
            <Button
              icon={<FileTextOutlined aria-hidden />}
              disabled={!comparison.canUseFile || busy}
              onClick={() => void resolve('file')}
            >
              {t('dsdocs.useFile')}
            </Button>
            <Button
              icon={<FormOutlined aria-hidden />}
              disabled={!comparison.canUsePanel || busy}
              onClick={() => void resolve('panel')}
            >
              {t('dsdocs.usePanel')}
            </Button>
          </ResponsiveActions>
        </>
      )}
    </AppPage>
  );
}
