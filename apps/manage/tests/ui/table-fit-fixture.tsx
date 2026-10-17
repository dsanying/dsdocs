import { EditOutlined, DeleteOutlined } from '@ant-design/icons';
import { Button } from 'antd';
import { useState } from 'react';
import { Table, AtomicValue, ResponsiveActions, columnWidth } from '../../src/components/ui';

const rows = [
  { key: 'short', name: '完整展示的短名称', value: '短值' },
  { key: 'long', name: '超长名称'.repeat(60), value: '短值' },
];

export function TableFitFixture() {
  const [containerWidth, setContainerWidth] = useState(340);
  const [actionResult, setActionResult] = useState('');
  if (new URLSearchParams(window.location.search).has('headerTypography'))
    return (
      <main style={{ width: 340, letterSpacing: -2 }}>
        <Table
          pagination={false}
          order="given"
          dataSource={[{ key: 'amount', name: 'API Key', value: '$12.35 / unlimited' }]}
          columns={[
            { title: 'Name', dataIndex: 'name' },
            { title: 'Used amount / total limit', dataIndex: 'value', width: columnWidth.text },
          ]}
        />
      </main>
    );
  if (new URLSearchParams(window.location.search).has('columnGeometry'))
    return (
      <main>
        <div style={{ width: '100%', maxWidth: 900 }}>
          <Table
            dataSource={rows}
            pagination={false}
            order="given"
            scrollY={
              new URLSearchParams(window.location.search).has('splitHeader') ? 180 : undefined
            }
            rowSelection={{}}
            sortable={{ handleLabel: '拖动排序', onMove: () => undefined }}
            expandable={{
              defaultExpandedRowKeys: ['short'],
              expandedRowRender: () => <AtomicValue>展开详情</AtomicValue>,
            }}
            columns={[
              {
                title: '信息',
                children: [
                  {
                    title: '名称',
                    dataIndex: 'name',
                    width: columnWidth.name,
                    sorter: (a, b) => a.name.localeCompare(b.name),
                    onCell: (row) => ({ colSpan: row.key === 'long' ? 2 : 1 }),
                  },
                  {
                    title: '值',
                    dataIndex: 'value',
                    width: columnWidth.badge,
                    onCell: (row) => ({ colSpan: row.key === 'long' ? 0 : 1 }),
                  },
                ],
              },
              {
                title: '操作',
                key: 'action',
                width: columnWidth.actions(1),
                render: () => (
                  <Button type="text" icon={<EditOutlined aria-hidden />}>
                    编辑
                  </Button>
                ),
              },
            ]}
          />
        </div>
      </main>
    );
  if (new URLSearchParams(window.location.search).has('fixedActions'))
    return (
      <main>
        <Button
          icon={<EditOutlined aria-hidden />}
          onClick={() => setContainerWidth(containerWidth === 340 ? 900 : 340)}
        >
          调整容器
        </Button>
        <output>{actionResult}</output>
        <div style={{ width: containerWidth, maxWidth: '100vw' }}>
          <Table
            dataSource={rows}
            pagination={false}
            order="given"
            columns={[
              { title: '名称', dataIndex: 'name' },
              { title: '刷新周期与优先级', dataIndex: 'value', width: columnWidth.long },
              {
                title: '操作',
                key: 'action',
                width: columnWidth.actions(2),
                render: (_, row) => (
                  <ResponsiveActions>
                    <Button
                      type="text"
                      icon={<EditOutlined aria-hidden />}
                      onClick={() => setActionResult(`编辑 ${row.key}`)}
                    >
                      编辑
                    </Button>
                    <Button
                      type="text"
                      icon={<DeleteOutlined aria-hidden />}
                      onClick={() => setActionResult(`删除 ${row.key}`)}
                    >
                      删除
                    </Button>
                  </ResponsiveActions>
                ),
              },
            ]}
          />
        </div>
      </main>
    );
  if (new URLSearchParams(window.location.search).has('squeeze')) {
    const width = Number(new URLSearchParams(window.location.search).get('squeeze'));
    // 固定顺序：短账号在前、单条超长账号在后，验证少数长值不撑出整表横滚。
    return (
      <main>
        <div style={{ width }}>
          <Table
            pagination={false}
            order="given"
            dataSource={[
              { key: 'a', name: '张三', account: 'zhangsan@example.com', time: '2026/10/13 19:18' },
              {
                key: 'b',
                name: '李四',
                account: `${'very-long-account-'.repeat(8)}@link.example.com`,
                time: '2026/10/13 19:18',
              },
            ]}
            columns={[
              { title: '姓名', dataIndex: 'name' },
              { title: '账号', dataIndex: 'account', width: columnWidth.code },
              { title: '时间', dataIndex: 'time', width: columnWidth.time },
              {
                title: '操作',
                key: 'action',
                width: columnWidth.actions(2),
                render: () => (
                  <ResponsiveActions>
                    <Button type="text" icon={<EditOutlined aria-hidden />}>
                      编辑
                    </Button>
                    <Button type="text" icon={<DeleteOutlined aria-hidden />}>
                      删除
                    </Button>
                  </ResponsiveActions>
                ),
              },
            ]}
          />
        </div>
      </main>
    );
  }
  // 固定顺序便于对比短值与长值的几何边界。
  return (
    <main style={{ width: 'min(100vw, 340px)', minWidth: 0 }}>
      <Table
        dataSource={rows}
        pagination={false}
        order="given"
        columns={[
          {
            title: '名称',
            dataIndex: 'name',
            render: (value: string) => <AtomicValue>{value}</AtomicValue>,
          },
          { title: '值', dataIndex: 'value', width: columnWidth.badge },
        ]}
      />
    </main>
  );
}
