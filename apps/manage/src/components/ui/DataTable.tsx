import type { TableProps } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { useMemo, type ReactNode } from 'react';
import type { DataTableSort, DataTableView } from '@/hooks/useDataTable';
import { formatNumber } from '@/utils/number';
import { TableQueryBoundary } from './Feedback';
import { buildTablePagination } from './tableConfig';
import { Table, type TableSortable } from './Table';

import { defaultTableSort, orderedTableColumns, type TableOrdering } from './tableOrdering';

import './DataTable.css';

export type DataTableProps<TRow> = Pick<
  TableProps<TRow>,
  'columns' | 'rowKey' | 'expandable' | 'size' | 'summary' | 'onRow' | 'rowClassName' | 'showHeader'
> & {
  controller: DataTableView<TRow>;
  ordering?: TableOrdering;
  emptyDescription?: ReactNode;
  /** 表格上方的操作区（新建等），窄屏整项换行。 */
  toolbar?: ReactNode;
  /** 需要纵向视口时传入，横向浏览始终在表格自身边界内。 */
  scrollY?: NonNullable<TableProps<TRow>['scroll']>['y'];
  /** 行拖动排序（见共享 Table.sortable）；放下后由页面调后端并 reload。 */
  sortable?: TableSortable<TRow>;
  className?: string;
};

/**
 * 页面表格唯一实现：Ant Table + 共享分页、局部横滚与查询反馈边界。
 * 首次失败占据空态，已有结果刷新失败时保留表格并在表格外常驻提示。
 */
export function DataTable<TRow extends object>({
  controller,
  ordering,
  emptyDescription,
  toolbar,
  scrollY,
  sortable,
  className,
  ...tableProps
}: DataTableProps<TRow>) {
  const pagination = buildTablePagination({
    current: controller.query.current,
    pageSize: controller.query.pageSize,
    total: controller.total,
    onChange: controller.setPage,
  });
  // 服务端排序列的表头指示器跟随 controller，避免列定义各自维护受控排序状态。
  const { columns, ...restTableProps } = tableProps;
  const sortedColumns = useMemo<ColumnsType<TRow> | undefined>(() => {
    const formatted = columns?.map((rawColumn) => {
      // 未自定义 render 的列：数值自动裁到三位小数，原样字符串/节点不动
      const column: ColumnsType<TRow>[number] =
        'render' in rawColumn && rawColumn.render
          ? rawColumn
          : {
              ...rawColumn,
              render: (value: unknown): ReactNode =>
                typeof value === 'number' ? formatNumber(value) : (value as ReactNode),
            };
      if (!('sorter' in column) || !column.sorter) return column;
      const key = String(
        ('dataIndex' in column && column.dataIndex !== undefined
          ? Array.isArray(column.dataIndex)
            ? column.dataIndex.join('.')
            : column.dataIndex
          : column.key) ?? ''
      );
      return {
        ...column,
        sortOrder:
          controller.query.sort.field === key ? (controller.query.sort.order ?? null) : null,
      };
    });
    return ordering && formatted
      ? orderedTableColumns(formatted, ordering, controller.query.sort)
      : formatted;
  }, [columns, ordering, controller.query.sort]);
  // 只把表头排序交给 controller；分页由共享分页配置直接回调。
  const handleChange: TableProps<TRow>['onChange'] = (_pagination, _filters, sorter, extra) => {
    if (extra.action !== 'sort') return;
    const single = Array.isArray(sorter) ? sorter[0] : sorter;
    const next: DataTableSort = single?.order
      ? { field: String(single.field ?? single.columnKey ?? ''), order: single.order }
      : ordering
        ? defaultTableSort(ordering)
        : {};
    if (next.field !== controller.query.sort.field || next.order !== controller.query.sort.order) {
      controller.setSort(next);
    }
  };

  return (
    <div
      className={['ds-data-table', className].filter(Boolean).join(' ')}
      data-sort-default={ordering?.column.split('#')[1]}
      data-sort-fields={ordering?.interactive.join(',')}
    >
      {toolbar ? <div className="ds-data-table__toolbar">{toolbar}</div> : null}
      <TableQueryBoundary
        hasData={controller.hasData}
        error={controller.error}
        onRetry={() => void controller.reload()}
        retrying={controller.loading}
        emptyDescription={emptyDescription}
      >
        {(emptyText) => (
          <Table<TRow>
            {...restTableProps}
            columns={sortedColumns}
            dataSource={controller.rows}
            loading={controller.loading}
            pagination={pagination}
            scrollY={scrollY}
            sortable={sortable}
            onChange={handleChange}
            locale={{ emptyText }}
          />
        )}
      </TableQueryBoundary>
    </div>
  );
}
