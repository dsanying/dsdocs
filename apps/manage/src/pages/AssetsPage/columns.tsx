import { columnWidth, Popconfirm } from '@/components/ui';
import { DeleteOutlined } from '@ant-design/icons';
import type { TableColumnsType } from 'antd';
import { Button } from 'antd';
import type { TFunction } from 'i18next';
import type { Asset } from './useAssetActions';

export function buildAssetColumns({
  remove,
  t,
}: {
  remove: (row: Asset) => Promise<void>;
  t: TFunction;
}): TableColumnsType<{ id: string; name: string; size: number }> {
  return [
    { title: t('common.vocab.name'), dataIndex: 'name' },
    { title: t('dsdocs.sizeBytes'), width: columnWidth.name, dataIndex: 'size' },
    {
      title: t('common.vocab.actions'),
      key: 'action',
      width: columnWidth.actions(2),

      render: (_, row) => (
        <Popconfirm
          title={t('common.confirm.execute')}
          description={t('dsdocs.deleteAssetConfirm')}
          onConfirm={() => remove(row)}
        >
          <Button color="danger" variant="outlined" icon={<DeleteOutlined aria-hidden />}>
            {t('common.actions.delete')}
          </Button>
        </Popconfirm>
      ),
    },
  ];
}
