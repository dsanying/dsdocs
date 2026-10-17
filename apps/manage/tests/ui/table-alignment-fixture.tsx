import { Button } from 'antd';
import { LinkOutlined } from '@ant-design/icons';
import { useState } from 'react';
import {
  Table,
  ActionLink,
  RatioProgress,
  ResponsiveActions,
  columnAlign,
  columnWidth,
} from '../../src/components/ui';

const rows = [
  { key: 'a', name: '小林', amount: '1.200', ratio: '100%', version: '1.0.0' },
  { key: 'b', name: '四字姓名', amount: '12345.678', ratio: '100000000%', version: '2.0.1' },
];

export function TableAlignmentFixture() {
  const [oversized, setOversized] = useState(
    new URLSearchParams(window.location.search).has('oversizedNumber')
  );
  const visibleRows = oversized
    ? [
        ...rows,
        {
          key: 'c',
          name: '异常长数值',
          amount: '1234567890'.repeat(8),
          ratio: '50%',
          version: '3.0.0',
        },
      ]
    : rows;
  const longRatio = new URLSearchParams(window.location.search).has('longRatio');
  const linked = new URLSearchParams(window.location.search).has('longLink');
  return (
    <main>
      <button type="button" onClick={() => setOversized((value) => !value)}>
        切换长数值
      </button>
      <Table
        dataSource={visibleRows}
        pagination={false}
        order="given"
        rowSelection={{}}
        sortable={{ handleLabel: '调整顺序', onMove: () => undefined }}
        columns={[
          {
            title: '姓名',
            dataIndex: 'name',
            width: columnWidth.name,
            ...(linked
              ? {
                  render: () => (
                    <ActionLink variant="name" icon={<LinkOutlined />} to="/target">
                      {'long-identifier-'.repeat(30)}
                    </ActionLink>
                  ),
                }
              : {}),
          },
          {
            title: '金额',
            dataIndex: 'amount',
            width: columnWidth.number,
            align: columnAlign.number,
            ...(longRatio
              ? {
                  render: () => (
                    <RatioProgress
                      label="进度指标"
                      value={1e15}
                      total={1e16}
                      format={(value) => `￥${value.toFixed(3)}`}
                    />
                  ),
                }
              : {}),
          },
          {
            title: '比例',
            dataIndex: 'ratio',
            width: columnWidth.badge,
            align: columnAlign.number,
          },
          {
            title: '版本',
            dataIndex: 'version',
            width: columnWidth.number,
            align: columnAlign.text,
          },
          {
            title: '操作',
            key: 'action',
            width: columnWidth.actions(1),
            render: () => (
              <ResponsiveActions>
                <Button>查看</Button>
              </ResponsiveActions>
            ),
          },
        ]}
      />
    </main>
  );
}
