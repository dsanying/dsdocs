import {
  AppEmpty,
  AppPage,
  buildTablePagination,
  Table,
  TablePanel,
  TableQueryBoundary,
} from '@/components/ui';
import { useManagement } from '@/hooks/useManagement';
import { useRequest } from '@/hooks/useRequest';
import { request, type Account } from '@/services';
import { PlusOutlined } from '@ant-design/icons';
import { Button } from 'antd';
import { useTranslation } from 'react-i18next';
import { useAccountEditor } from './useAccountEditor';

import { AccountEditor } from './AccountEditor';
import { buildAccountColumns } from './columns';
export default function AccountsPage() {
  const { t } = useTranslation();
  const { current: authenticated } = useManagement();
  const current = authenticated;
  const query = useRequest(async () => request('/__dsdocs_accounts'), { manual: !current });
  const rows: Account[] = query.data ?? [];
  const load = query.run;
  const { editing, setEditing, close, finish, remove } = useAccountEditor(current, load);
  if (!current)
    return (
      <AppPage>
        <AppEmpty description={t('dsdocs.accountModuleDisabled')} />
      </AppPage>
    );
  return (
    <AppPage
      extra={
        current.role === 'superadmin' && (
          <Button icon={<PlusOutlined aria-hidden />} onClick={() => setEditing({})}>
            {t('dsdocs.createAccount')}
          </Button>
        )
      }
    >
      {' '}
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
              orderBy={(x) => x.username}
              columns={buildAccountColumns({ current, setEditing, remove, t })}
              pagination={buildTablePagination()}
            />
          )}
        </TableQueryBoundary>
      </TablePanel>
      <AccountEditor editing={editing} onClose={close} onFinish={finish} current={current} />
    </AppPage>
  );
}
