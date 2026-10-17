import { AtomicValue, columnWidth, Popconfirm, ResponsiveActions } from '@/components/ui';
import { type Account } from '@/services';
import { DeleteOutlined, EditOutlined } from '@ant-design/icons';
import type { TableColumnsType } from 'antd';
import { Button } from 'antd';
import type { TFunction } from 'i18next';

export function buildAccountColumns({
  current,
  setEditing,
  remove,
  t,
}: {
  current: Account;
  setEditing: (row: Partial<Account>) => void;
  remove: (row: Account) => Promise<void>;
  t: TFunction;
}): TableColumnsType<Account> {
  return [
    {
      title: t('common.vocab.username'),
      dataIndex: 'username',
      render: (x) => <AtomicValue text={x} />,
    },
    {
      title: t('dsdocs.role'),
      dataIndex: 'role',
      width: columnWidth.name,
      render: (x) =>
        x === 'superadmin' ? t('dsdocs.superadmin') : t('common.vocab.administrator'),
    },
    {
      title: t('common.vocab.actions'),
      key: 'action',
      width: columnWidth.actions(2),

      render: (_, row) => (
        <ResponsiveActions>
          <Button icon={<EditOutlined aria-hidden />} onClick={() => setEditing(row)}>
            {t('common.actions.edit')}
          </Button>
          {row.role !== 'superadmin' && current.role === 'superadmin' && (
            <Popconfirm
              title={t('common.confirm.execute')}
              description={t('dsdocs.deleteAccountConfirm')}
              onConfirm={() => remove(row)}
            >
              <Button color="danger" variant="outlined" icon={<DeleteOutlined aria-hidden />}>
                {t('common.actions.delete')}
              </Button>
            </Popconfirm>
          )}
        </ResponsiveActions>
      ),
    },
  ];
}
