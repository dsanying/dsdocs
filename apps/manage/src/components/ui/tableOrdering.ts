import type { ColumnsType } from 'antd/es/table';
import type { DataTableSort } from '@/hooks/useDataTable';

/** 每张表的排序契约：默认顺序绑定真实列，主动排序仅开放有明确阅读用途的维度。 */
export type TableOrdering = {
  /** 同文件写 #字段，跨文件写 ./columns#字段，与查询字段使用同一列绑定语法。 */
  column: string;
  order: 'ascend' | 'descend';
  interactive: readonly string[];
  /** 说明排名/定位用途以及未开放列的取舍；不渲染为产品文案。 */
  reason: string;
};

export function defaultTableSort(ordering: TableOrdering): DataTableSort {
  return { field: ordering.column.split('#')[1], order: ordering.order };
}

/** 排序只作用于真实叶列；不允许隐藏字段、操作列或当前页比较器冒充完整集合排序。 */
export function orderedTableColumns<T>(
  columns: ColumnsType<T>,
  ordering: TableOrdering,
  sort: DataTableSort
): ColumnsType<T> {
  const keys = new Set<string>();
  const collect = (items: ColumnsType<T>) =>
    items.forEach((column) => {
      if ('children' in column) collect(column.children);
      else
        keys.add(
          String(
            'dataIndex' in column && column.dataIndex !== undefined ? column.dataIndex : column.key
          )
        );
    });
  collect(columns);
  const primary = defaultTableSort(ordering).field;
  const requested = [primary, ...ordering.interactive];
  if (
    !primary ||
    requested.some((key) => !key || key === 'action' || key === 'actions' || !keys.has(key))
  ) {
    throw new Error('表格排序必须绑定实际展示的非操作列');
  }
  const active =
    sort.field && ordering.interactive.includes(sort.field) ? sort : defaultTableSort(ordering);
  const apply = (items: ColumnsType<T>): ColumnsType<T> =>
    items.map((column) => {
      if ('children' in column) return { ...column, children: apply(column.children) };
      const key = String(
        'dataIndex' in column && column.dataIndex !== undefined ? column.dataIndex : column.key
      );
      return {
        ...column,
        sorter: ordering.interactive.includes(key),
        sortOrder: active.field === key ? active.order : null,
      };
    });
  return apply(columns);
}
