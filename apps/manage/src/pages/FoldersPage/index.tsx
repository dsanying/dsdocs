import {
  AppPage,
  buildTablePagination,
  Table,
  TablePanel,
  TableQueryBoundary,
} from '@/components/ui';
import { useRequest } from '@/hooks/useRequest';
import { content, type Folder } from '@/services';
import { PlusOutlined } from '@ant-design/icons';
import { Button } from 'antd';
import { useTranslation } from 'react-i18next';
import { useFolderEditor } from './useFolderEditor';

import { FolderEditor } from './FolderEditor';
import { buildFolderColumns } from './columns';
export default function FoldersPage() {
  const { t } = useTranslation();
  const query = useRequest(async () => content().then((value) => value.folders));
  const rows: Folder[] = query.data ?? [];
  const load = query.run;
  const { editing, setEditing, close, finish, remove } = useFolderEditor(load);
  return (
    <AppPage
      extra={
        <Button icon={<PlusOutlined aria-hidden />} onClick={() => setEditing({})}>
          {t('common.actions.create')}
        </Button>
      }
    >
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
              orderBy={(x) => x.title}
              columns={buildFolderColumns({ rows, setEditing, remove, t })}
              pagination={buildTablePagination()}
            />
          )}
        </TableQueryBoundary>
      </TablePanel>
      <FolderEditor editing={editing} onClose={close} onFinish={finish} rows={rows} />
    </AppPage>
  );
}
