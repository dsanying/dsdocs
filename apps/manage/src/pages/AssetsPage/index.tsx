import {
  AppPage,
  buildTablePagination,
  Table,
  TablePanel,
  TableQueryBoundary,
} from '@/components/ui';
import { useRequest } from '@/hooks/useRequest';
import { content } from '@/services';
import { UploadOutlined } from '@ant-design/icons';
import { Button } from 'antd';
import { useTranslation } from 'react-i18next';
import { useAssetActions } from './useAssetActions';

import { buildAssetColumns } from './columns';
export default function AssetsPage() {
  const { t } = useTranslation();
  const query = useRequest(async () => content('/assets'));
  const rows: { id: string; name: string; size: number }[] = query.data ?? [];
  const load = query.run;
  const { remove, uploadFile } = useAssetActions(load);
  return (
    <AppPage
      extra={
        <Button
          icon={<UploadOutlined aria-hidden />}
          onClick={() => document.getElementById('asset-upload')?.click()}
        >
          {t('common.actions.upload')}
        </Button>
      }
    >
      <input
        id="asset-upload"
        type="file"
        hidden
        accept=".png,.jpg,.jpeg,.webp,.pdf,.txt"
        onChange={async (e) => {
          const file = e.target.files?.[0];
          e.target.value = '';
          if (!file) return;
          await uploadFile(file);
        }}
      />
      <TablePanel>
        <TableQueryBoundary
          hasData={rows.length > 0}
          error={query.error}
          retrying={query.loading}
          onRetry={() => void load()}
        >
          {(emptyText) => (
            <Table
              loading={query.loading}
              locale={{ emptyText }}
              rowKey="id"
              dataSource={rows}
              orderBy={(x) => x.name}
              columns={buildAssetColumns({ remove, t })}
              pagination={buildTablePagination()}
            />
          )}
        </TableQueryBoundary>
      </TablePanel>
    </AppPage>
  );
}
