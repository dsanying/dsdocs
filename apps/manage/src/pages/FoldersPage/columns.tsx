import { columnWidth, Popconfirm, ResponsiveActions } from '@/components/ui';
import { type Folder } from '@/services';
import { DeleteOutlined, EditOutlined } from '@ant-design/icons';
import type { TableColumnsType } from 'antd';
import { Button } from 'antd';
import type { TFunction } from 'i18next';

export function buildFolderColumns({
  rows,
  setEditing,
  remove,
  t,
}: {
  rows: Folder[];
  setEditing: (row: Partial<Folder>) => void;
  remove: (row: Folder) => Promise<void>;
  t: TFunction;
}): TableColumnsType<Folder> {
  return [
    { title: t('dsdocs.chineseName'), dataIndex: 'title' },
    { title: t('dsdocs.englishName'), width: columnWidth.long, dataIndex: 'titleEn' },
    {
      title: t('dsdocs.parentFolder'),
      dataIndex: 'parent',
      width: columnWidth.long,
      render: (id) => rows.find((x) => x.id === id)?.title ?? '—',
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
          <Popconfirm
            title={t('common.confirm.execute')}
            description={t('dsdocs.deleteFolderConfirm')}
            onConfirm={() => remove(row)}
          >
            <Button color="danger" variant="outlined" icon={<DeleteOutlined aria-hidden />}>
              {t('common.actions.delete')}
            </Button>
          </Popconfirm>
        </ResponsiveActions>
      ),
    },
  ];
}
