import { useCallback, useMemo, useState } from 'react';
import { useRequest } from '@/hooks/useRequest';
import { DEFAULT_PAGE_SIZE } from '@/components/ui';

export type DataTableSortOrder = 'ascend' | 'descend';

/** 服务端排序状态；未排序时字段与方向都为 undefined。 */
export type DataTableSort = {
  field?: string;
  order?: DataTableSortOrder;
};

/** 一次表格查询的完整参数：分页、排序与已提交筛选。 */
export type DataTableQuery<TFilters> = {
  current: number;
  pageSize: number;
  sort: DataTableSort;
  filters: TFilters;
};

/** 表格请求的返回契约：当前页数据与服务端总数。 */
export type DataTableResult<TRow> = {
  data: TRow[];
  total: number;
};

export type UseDataTableOptions<TRow, TFilters> = {
  /** 按已提交筛选、排序与分页发起请求；只有最新一次调用的结果会写入状态。 */
  request: (query: DataTableQuery<TFilters>) => Promise<DataTableResult<TRow>>;
  /** 初始（也是未提交时）的筛选值。 */
  initialFilters: TFilters;
  initialSort?: DataTableSort;
  defaultPageSize?: number;
  /** 为 true 时不自动发起首次请求，等待调用方显式提交。 */
  manual?: boolean;
  /**
   * 外部作用域（如页面级时间范围）的标识；变化时按新作用域回到第一页重新请求，
   * 已提交筛选、排序与每页条数保持不变。
   */
  scope?: string;
  /**
   * 受控查询：由调用方持有查询状态（如与 URL 同步的页面），
   * 提交、翻页与排序只通过 onQueryChange 通知，不再维护内部状态。
   */
  query?: DataTableQuery<TFilters>;
  onQueryChange?: (query: DataTableQuery<TFilters>) => void;
};

/** DataTable 展示层需要的最小契约；与筛选类型无关。 */
export type DataTableView<TRow> = {
  rows: TRow[];
  total: number;
  loading: boolean;
  error: Error | undefined;
  /** 是否已有可展示的成功结果；刷新失败时用于保留表格内容。 */
  hasData: boolean;
  query: {
    current: number;
    pageSize: number;
    sort: DataTableSort;
  };
  /** 翻页或改变每页条数（改变每页条数时回到第一页）。 */
  setPage: (current: number, pageSize: number) => void;
  /** 改变服务端排序并回到第一页。 */
  setSort: (sort: DataTableSort) => void;
  /** 按当前参数重新请求。 */
  reload: () => Promise<unknown>;
};

export type DataTableController<TRow, TFilters> = Omit<DataTableView<TRow>, 'query' | 'reload'> & {
  query: DataTableQuery<TFilters>;
  /** 提交新的筛选条件并回到第一页。 */
  submitFilters: (filters: TFilters) => void;
  reload: () => Promise<DataTableResult<TRow> | undefined>;
};

type QueryState<TFilters> = DataTableQuery<TFilters> & { scope: string | undefined };

/**
 * 页面表格的唯一请求状态机：分页、排序、已提交筛选、末次请求胜出、卸载保护与刷新失败保留旧结果，
 * 全部委托给共享 useRequest；页面只负责把 controller 交给 DataTable 与 QueryForm。
 */
export function useDataTable<TRow, TFilters>(
  options: UseDataTableOptions<TRow, TFilters>
): DataTableController<TRow, TFilters> {
  const {
    request,
    initialFilters,
    initialSort,
    defaultPageSize = DEFAULT_PAGE_SIZE,
    manual = false,
    scope,
    query: controlledQuery,
    onQueryChange,
  } = options;
  const [queryState, setQueryState] = useState<QueryState<TFilters>>({
    scope,
    current: 1,
    pageSize: defaultPageSize,
    sort: initialSort ?? {},
    filters: initialFilters,
  });
  const [submitted, setSubmitted] = useState(!manual);
  // 每次显式提交都计为一次新的查询，即使条件与上次相同也重新请求（刷新语义）。
  const [submission, setSubmission] = useState(0);

  // 记录每次作用域切换，避免切回之前的范围时恢复旧页码；条件更新在提交前完成，不产生旧参数请求。
  if (queryState.scope !== scope) {
    setQueryState({ ...queryState, scope, current: 1 });
  }
  const uncontrolledQuery = useMemo<DataTableQuery<TFilters>>(() => {
    const { scope: stateScope, ...rest } = queryState;
    return stateScope === scope ? rest : { ...rest, current: 1 };
  }, [queryState, scope]);
  const query = controlledQuery ?? uncontrolledQuery;

  const { data, loading, error, run } = useRequest(() => request(query), {
    manual: !submitted,
    refreshDeps: [query, submitted, submission],
  });

  const submitFilters = useCallback(
    (filters: TFilters) => {
      setSubmitted(true);
      if (controlledQuery) {
        // URL 更新可能延后生效；新条件由受控 query 触发，不能先刷新旧条件。
        if (
          controlledQuery.current === 1 &&
          JSON.stringify(controlledQuery.filters) === JSON.stringify(filters)
        ) {
          setSubmission((count) => count + 1);
          return;
        }
        onQueryChange?.({ ...controlledQuery, current: 1, filters });
        return;
      }
      setSubmission((count) => count + 1);
      setQueryState((previous) => ({ ...previous, scope, current: 1, filters }));
    },
    [controlledQuery, onQueryChange, scope]
  );
  const setPage = useCallback(
    (current: number, pageSize: number) => {
      if (controlledQuery) {
        onQueryChange?.(
          controlledQuery.pageSize === pageSize
            ? { ...controlledQuery, current }
            : { ...controlledQuery, current: 1, pageSize }
        );
        return;
      }
      setQueryState((previous) =>
        previous.pageSize === pageSize
          ? { ...previous, scope, current }
          : { ...previous, scope, current: 1, pageSize }
      );
    },
    [controlledQuery, onQueryChange, scope]
  );
  const setSort = useCallback(
    (sort: DataTableSort) => {
      if (controlledQuery) {
        onQueryChange?.({ ...controlledQuery, current: 1, sort });
        return;
      }
      setQueryState((previous) => ({ ...previous, scope, current: 1, sort }));
    },
    [controlledQuery, onQueryChange, scope]
  );

  const rows = useMemo(() => data?.data ?? [], [data]);
  return {
    rows,
    total: data?.total ?? 0,
    loading: submitted && loading,
    error,
    hasData: rows.length > 0,
    query,
    submitFilters,
    setPage,
    setSort,
    reload: run,
  };
}
