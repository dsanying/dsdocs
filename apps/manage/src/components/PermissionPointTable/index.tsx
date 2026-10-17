import { Checkbox, Form } from 'antd';
import type { TableColumnsType } from 'antd';
import { useEffect, useMemo, useRef, useState, type Key, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

import {
  buildTablePagination,
  DEFAULT_PAGE_SIZE,
  FilterSelect,
  QueryForm,
  Stack,
  StatusTag,
  Table,
  TablePanel,
  type FilterSelectOption,
  type StatusTone,
} from '@/components/ui';
import { compareText } from '@/utils/collation';

import './PermissionPointTable.css';

/** 权限点行的最小字段：对象、动作与（可选）权限定义的名称、说明、键。 */
export interface PermissionPointRowBase {
  obj: string;
  act: string;
  displayName?: string;
  description?: string;
  permissionKey?: string;
}

/** 一种状态：列在工具栏里，既是计数也是筛选开关；数组顺序即排序优先级。 */
export interface PermissionPointStatus<S extends string> {
  key: S;
  label: string;
  tone: StatusTone;
}

/** 权限筛选标识：一行对应一个拒绝/授权来源，同一权限可能有多个来源行；筛选按权限去重，命中任一来源都保留。 */
const permissionId = <T extends PermissionPointRowBase>(row: T) => `${row.obj} ${row.act}`;

/** 额外的离散维度筛选（类型、来源等）：enum 多选，空数组 = 全部，多个值之间是 OR。 */
export interface PermissionPointFilter<T> {
  /** 维度名（去重与内部状态用）。 */
  name: string;
  /** 筛选标签，与对应列使用同一文案。 */
  label: string;
  options: FilterSelectOption[];
  /** 行在该维度上的取值集合；与已选值有交集即命中。 */
  valuesOf: (row: T) => readonly string[];
}

export interface PermissionPointTableProps<T extends PermissionPointRowBase, S extends string> {
  rows: readonly T[];
  rowKey: (row: T) => string;
  /** 状态开关（计数 + 筛选）；权限定义目录等没有状态的列表不传。 */
  statuses?: readonly PermissionPointStatus<S>[];
  statusOf?: (row: T) => S;
  /** “权限点”列之后的业务列。 */
  columns: () => TableColumnsType<T>;
  /** 名称/类型等之外的离散维度筛选（如来源）；候选项由调用方按行内容给出。 */
  filters?: readonly PermissionPointFilter<T>[];
  /** 进入页面时定位到的权限点（从别处带 obj/act 或 permissionKey 跳来）：行就绪后自动按该行筛选一次。 */
  focusRow?: (row: T) => boolean;
  title?: ReactNode;
  extra?: ReactNode;
  /** 表格上方的操作区（新建等），页签内替代区块标题行的操作位。 */
  toolbar?: ReactNode;
  /** 无数据时的说明。 */
  emptyText?: ReactNode;
  onRowClick?: (row: T) => void;
  selectedKey?: Key;
  embedded?: boolean;
}

/**
 * 权限点列表的唯一入口（主体授权、标签编辑、权限诊断、标签删除预览、资源授权）：
 * 查询区 = 权限点候选多选（标签含名称与标识）+ 调用方声明的离散维度多选（类型/来源）+ 状态开关（状态色标签 + 数量，勾选即筛选）；
 * 首列固定“权限点”（名称在上、obj · act 在下），其余列由调用方提供；
 * 默认按状态优先级、再按名称排序；全局分页标准（默认每页 10）。不得另做树视图或自绘计数卡。
 */
export function PermissionPointTable<T extends PermissionPointRowBase, S extends string>({
  rows,
  rowKey,
  statuses = [],
  statusOf,
  columns,
  filters = [],
  focusRow,
  title,
  extra,
  toolbar,
  emptyText,
  onRowClick,
  selectedKey,
  embedded,
}: PermissionPointTableProps<T, S>) {
  const { t } = useTranslation();
  const [form] = Form.useForm<{ permissions?: string[] }>();
  // null = 还没按过查询：深链 focusRow 命中时用焦点行作为初始筛选
  const [applied, setApplied] = useState<Record<string, string[]> | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [dimensionDrafts, setDimensionDrafts] = useState<Record<string, string[]>>({});
  const [hidden, setHidden] = useState<ReadonlySet<S>>(new Set());
  const [page, setPage] = useState({ current: 1, pageSize: DEFAULT_PAGE_SIZE });

  // 候选按权限去重：同一权限的多个来源行共享一条候选项，选中即保留全部命中来源
  const permissionOptions = useMemo<FilterSelectOption[]>(() => {
    const seen = new Map<string, FilterSelectOption>();
    for (const row of rows) {
      const id = permissionId(row);
      if (seen.has(id)) continue;
      const target = `${row.obj} · ${row.act}`;
      const name = row.displayName || row.permissionKey;
      seen.set(id, { value: id, label: name && name !== target ? `${name} · ${target}` : target });
    }
    return [...seen.values()];
  }, [rows]);

  // 深链焦点行：数据就绪后一次性写进权限点筛选并显示在控件里；用户提交过筛选后不再接管
  const focusKeys = useMemo(
    () => (!submitted && focusRow ? [...new Set(rows.filter(focusRow).map(permissionId))] : []),
    [focusRow, rows, submitted]
  );
  const focusShownRef = useRef(false);
  useEffect(() => {
    if (focusShownRef.current || !focusKeys.length) return;
    focusShownRef.current = true;
    form.setFieldValue('permissions', focusKeys);
  }, [focusKeys, form]);

  const filtered = useMemo(
    () =>
      rows.filter((row) => {
        const picked = applied?.permissions ?? focusKeys;
        if (picked.length && !picked.includes(permissionId(row))) return false;
        for (const filter of filters) {
          const selected = applied?.[filter.name];
          if (selected?.length && !filter.valuesOf(row).some((value) => selected.includes(value)))
            return false;
        }
        return true;
      }),
    [applied, filters, focusKeys, rows]
  );

  const order = useMemo(
    () => new Map(statuses.map((status, index) => [status.key, index])),
    [statuses]
  );
  const counts = useMemo(() => {
    const result = new Map<S, number>();
    if (statusOf)
      for (const row of filtered) result.set(statusOf(row), (result.get(statusOf(row)) ?? 0) + 1);
    return result;
  }, [filtered, statusOf]);

  const visible = useMemo(
    () =>
      [...filtered.filter((row) => !statusOf || !hidden.has(statusOf(row)))].sort(
        (left, right) =>
          (statusOf ? (order.get(statusOf(left)) ?? 99) - (order.get(statusOf(right)) ?? 99) : 0) ||
          compareText(
            left.displayName || `${left.obj}/${left.act}`,
            right.displayName || `${right.obj}/${right.act}`
          )
      ),
    [filtered, hidden, order, statusOf]
  );

  const pageCount = Math.max(1, Math.ceil(visible.length / page.pageSize));
  const current = Math.min(page.current, pageCount);

  const toggleStatus = (key: S, checked: boolean) => {
    setHidden((prev) => {
      const next = new Set(prev);
      if (checked) next.delete(key);
      else next.add(key);
      return next;
    });
    setPage((prev) => ({ ...prev, current: 1 }));
  };

  const baseColumns: TableColumnsType<T> = [
    {
      title: t('common.vocab.searchPermissions'),
      key: 'permission',
      render: (_, row) => {
        const target = `${row.obj} · ${row.act}`;
        return (
          <Stack gap="tight">
            <span>{row.displayName || target}</span>
            {row.displayName && <span className="ds-permission-point-table__target">{target}</span>}
          </Stack>
        );
      },
    },
    ...columns(),
  ];

  return (
    <TablePanel
      title={title}
      extra={extra}
      embedded={embedded}
      query={
        <QueryForm<{ permissions?: string[] }>
          form={form}
          onSubmit={(values) => {
            setApplied({ permissions: values.permissions ?? [], ...dimensionDrafts });
            setSubmitted(true);
            setPage((prev) => ({ ...prev, current: 1 }));
          }}
        >
          <Form.Item
            name="permissions"
            label={t('common.vocab.searchPermissions')}
            data-filter-column="#permission"
          >
            <FilterSelect kind="enum" options={permissionOptions} />
          </Form.Item>
          {filters.map((filter) => (
            <Form.Item key={filter.name} label={filter.label}>
              <FilterSelect
                kind="enum"
                options={filter.options}
                value={dimensionDrafts[filter.name] ?? []}
                onChange={(value) =>
                  setDimensionDrafts((prev) => ({
                    ...prev,
                    [filter.name]: Array.isArray(value) ? value : [],
                  }))
                }
              />
            </Form.Item>
          ))}
          {statuses.length > 0 && (
            <Form.Item label={t('common.vocab.status')}>
              <ul className="ds-permission-point-table__statuses">
                {statuses.map((status) => {
                  const count = counts.get(status.key) ?? 0;
                  return (
                    <li key={status.key} data-empty={count === 0 ? 'true' : undefined}>
                      <Checkbox
                        checked={!hidden.has(status.key)}
                        onChange={(event) => toggleStatus(status.key, event.target.checked)}
                      >
                        <StatusTag tone={status.tone}>
                          <span className="ds-permission-point-table__status">
                            {status.label}
                            <strong>{count}</strong>
                          </span>
                        </StatusTag>
                      </Checkbox>
                    </li>
                  );
                })}
              </ul>
            </Form.Item>
          )}
        </QueryForm>
      }
    >
      <Table<T>
        rowKey={rowKey}
        toolbar={toolbar}
        size="small"
        dataSource={visible}
        columns={baseColumns}
        locale={emptyText ? { emptyText } : undefined}
        // 已按状态优先级与名称排好
        order="given"
        onRow={
          onRowClick
            ? (row) => ({
                onClick: () => onRowClick(row),
                'data-selected':
                  selectedKey !== undefined && rowKey(row) === selectedKey ? 'true' : undefined,
                className: 'ds-permission-point-table__row--clickable',
              })
            : undefined
        }
        pagination={buildTablePagination({
          current,
          pageSize: page.pageSize,
          total: visible.length,
          onChange: (next, pageSize) =>
            setPage({ current: next, pageSize: pageSize || DEFAULT_PAGE_SIZE }),
        })}
      />
    </TablePanel>
  );
}
