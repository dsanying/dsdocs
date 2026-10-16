import { HolderOutlined } from '@ant-design/icons';
import { CollisionPriority, Plugin, type Plugins } from '@dnd-kit/abstract';
import { pointerIntersection } from '@dnd-kit/collision';
import { move } from '@dnd-kit/helpers';
import {
  DragDropProvider,
  useDragDropManager,
  useDroppable,
  type DragDropEventHandlers,
} from '@dnd-kit/react';
import { useSortable } from '@dnd-kit/react/sortable';
import { Table as AntTable, type TableProps as AntTableProps } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import {
  createContext,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type HTMLAttributes,
  type Key,
  type ReactNode,
} from 'react';
import { useTranslation } from 'react-i18next';

import { sortByText } from '../../utils/collation';

import {
  actionIconOnlyWidth,
  columnAlign,
  columnWidth,
  columnsTotalWidth,
  contentFitWidth,
  DEFAULT_PAGE_SIZE,
  defaultColumnAlign,
  flexColumnMinWidth,
  measureCellWidths,
  measureHeaderText,
  proportionalColumns,
  SHORT_CONTENT_MAX_WIDTH,
  squeezedFitWidth,
  tableScroll,
  titleFitWidth,
  type TableScroll,
} from './tableConfig';

import { measureTextWidth } from './measureText';
import { AtomicValue } from './AtomicValue';
import './Table.css';

export type TableSortable<TRow> = {
  /** 拖动手柄的可访问名称（如“拖动调整顺序”）。 */
  handleLabel: string;
  /** 一行被放到新位置：给出行、原索引与目标索引（完整数据源内的索引），由页面调用后端调整顺序并刷新。 */
  onMove: (row: TRow, fromIndex: number, toIndex: number) => void | Promise<void>;
  disabled?: boolean;
};

export type TableProps<TRow> = Omit<AntTableProps<TRow>, 'scroll' | 'tableLayout'> & {
  /** 表格上方的操作区（新建等），窄屏整项换行。 */
  toolbar?: ReactNode;
  /** 需要纵向视口时传入；横向浏览始终在表格自身边界内。 */
  scrollY?: TableScroll['y'];
  /** 传入即开启行拖动排序：首列出现拖动手柄，支持指针与键盘（空格抓起、上下移动、空格放下）。 */
  sortable?: TableSortable<TRow>;
  /**
   * 前端持有整批数据（不分页）时的展示顺序：给出每行的可读文案，按统一比较器（utils/collation）排好——
   * 同样一组内容在任何地方摆出来顺序一样；顺序本身有含义（命中顺序、导入预览、拖动排序）时改传 `order="given"` 并注释原因。
   */
  orderBy?: (row: TRow) => string;
  order?: 'given';
};

const CANCEL_ZONE_ID = 'ds-table-cancel-zone';
/** 官方 dragOperation 在 Feedback 落位清理后才回到 idle；不能按默认动画时长猜测完成。 */
class TableDropCompletion extends Plugin {
  private pending: (() => void) | undefined;
  private disposed = false;
  private frame = 0;

  constructor(manager: Plugin['manager']) {
    super(manager);
    this.registerEffect(() => this.completeIfIdle());
  }

  private completeIfIdle() {
    if (!this.manager.dragOperation.status.idle || !this.pending) return;
    const complete = this.pending;
    this.pending = undefined;
    // 完成库的同步清理并让出该帧后再提交，避免声明式渲染与落位清理争抢同一帧。
    queueMicrotask(() => {
      if (this.disposed) return;
      this.frame = requestAnimationFrame(() => {
        this.frame = 0;
        if (!this.disposed) complete();
      });
    });
  }

  override destroy() {
    this.disposed = true;
    this.pending = undefined;
    cancelAnimationFrame(this.frame);
    super.destroy();
  }

  afterDrop(complete: () => void) {
    this.pending = complete;
    this.completeIfIdle();
  }
}

const tableDragPlugins = (defaults: Plugins) => [...defaults, TableDropCompletion];

/** 行在当前顺序里的索引由表格算好放进 context，行组件按 key 取用（Ant 只把 data-row-key 传给行）。 */
const RowIndexContext = createContext<Map<string, number>>(new Map());

/** 手柄只是“这一行可以拖”的视觉提示；整行都是拖动激活区（指针拖动起拖，键盘：聚焦行后空格抓起、方向键移动、空格放下）。 */
function DragHandle() {
  return (
    <span className="ds-table__drag-handle" aria-hidden="true">
      <HolderOutlined />
    </span>
  );
}

function SortableRow({
  label,
  ...props
}: HTMLAttributes<HTMLTableRowElement> & { 'data-row-key'?: Key; label: string }) {
  const id = String(props['data-row-key'] as Key);
  const index = useContext(RowIndexContext).get(id) ?? 0;
  // 视觉拖动态由库的原生属性驱动，不订阅 isDragging 触发整行 React 提交。
  const { ref } = useSortable({ id, index });
  return (
    <tr
      {...props}
      ref={ref}
      aria-roledescription={label}
      className={[props.className, 'ds-table__row--sortable'].filter(Boolean).join(' ')}
    />
  );
}

/** 拖动中出现在表格顶部的取消区：把行拖到这里松手即放弃本次排序（按 Esc 同样取消）。 */
function CancelDropZone() {
  const { t } = useTranslation();
  const manager = useDragDropManager();
  // 指针进入即命中，且优先级高于行：落在取消区时不会被当成落到某一行
  const { ref, isDropTarget } = useDroppable({
    id: CANCEL_ZONE_ID,
    collisionDetector: pointerIntersection,
    collisionPriority: CollisionPriority.Highest,
  });
  useEffect(() => {
    if (!manager) return;
    // 在传感器处理松手之前把操作按“取消”结束：库会把乐观换位的 DOM 还原，和按 Esc 完全一致
    const cancelWhenReleasedHere = () => {
      if (
        manager.dragOperation.status.dragging &&
        manager.dragOperation.target?.id === CANCEL_ZONE_ID
      ) {
        manager.actions.stop({ canceled: true });
      }
    };
    document.addEventListener('pointerup', cancelWhenReleasedHere, true);
    return () => document.removeEventListener('pointerup', cancelWhenReleasedHere, true);
  }, [manager]);
  return (
    <div
      ref={ref}
      className={['ds-table__cancel-zone', isDropTarget ? 'ds-table__cancel-zone--over' : '']
        .filter(Boolean)
        .join(' ')}
      role="status"
    >
      {t('common.vocab.dropHereToCancel')}
    </div>
  );
}

function resolveRowKey<TRow>(rowKey: AntTableProps<TRow>['rowKey'], row: TRow, index: number): Key {
  if (typeof rowKey === 'function') return rowKey(row, index);
  const record = row as Record<string, unknown>;
  const value = record[(rowKey as string | undefined) ?? 'key'];
  return (value as Key | undefined) ?? index;
}

/** 操作格按真实可用宽度收起文字；所有按钮、链接及可访问名称始终保留。 */
function TableActions({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [compact, setCompact] = useState(false);
  useLayoutEffect(() => {
    const root = ref.current;
    if (!root) return;
    let frame = 0;
    const measure = () => {
      frame = 0;
      const actions = [...root.querySelectorAll<HTMLElement>('button, a')];
      const required = actions.reduce(
        (width, action) => {
          // 图标容器（ds-action-link__icon/ant-btn-icon）不是文本：先取显式标签类，否则取第一个非图标文本 span
          const label = action.querySelector<HTMLElement>(
            ':scope > .ds-action-link__label, :scope > span:not(.ant-btn-icon):not(.ds-action-link__icon)'
          );
          const style = getComputedStyle(action);
          const font = `${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
          return width + 32 + (label ? measureTextWidth(label.textContent ?? '', font) + 8 : 0);
        },
        Math.max(0, actions.length - 1) * 8
      );
      setCompact(required > root.clientWidth);
    };
    // 行重排只移动同一批 DOM，不能因 React children 引用变化同步重测所有动作格。
    // 实际按钮增删、文案变化和槽位宽度变化仍在下一帧重新量度。
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(measure);
    };
    const observer = new ResizeObserver(schedule);
    const contentObserver = new MutationObserver(schedule);
    observer.observe(root);
    contentObserver.observe(root, { childList: true, subtree: true, characterData: true });
    measure();
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      contentObserver.disconnect();
    };
  }, []);
  return (
    <div ref={ref} className="ds-table__actions" data-compact={compact || undefined}>
      {children}
    </div>
  );
}

/**
 * 页面表格的唯一入口（Ant Table 的接管层）：列宽只由列定义决定——
 * `tableLayout="fixed"` + 横向最小宽度按列宽之和计算，剩余空间归唯一的主列，
 * 长内容在自己的列宽内滚动，不会把后面的列挤走；业务不再各自设置 scroll / tableLayout。
 * 传 `sortable` 即得到统一的行拖动排序（@dnd-kit/react：拖动中乐观换位、松手自带落位动画、键盘与读屏支持），
 * 替代逐行“上移/下移”按钮。
 */
export function Table<TRow>({
  scrollY,
  sortable,
  columns,
  dataSource: givenSource,
  rowKey,
  components,
  orderBy,
  order: _order,
  toolbar,
  ...props
}: TableProps<TRow>) {
  // 前端整批数据按可读文案排序；服务端分页/给定顺序的数据源原样
  const dataSource = useMemo(
    () => (orderBy && givenSource ? sortByText(givenSource, orderBy) : givenSource),
    [givenSource, orderBy]
  );
  const sourceRows = useMemo(() => (dataSource ? [...dataSource] : []), [dataSource]);
  const sourceKeys = useMemo(
    () => sourceRows.map((row, index) => String(resolveRowKey(rowKey, row, index))),
    [sourceRows, rowKey]
  );
  // 松手后先按新顺序渲染（乐观更新），等后端刷新回来的新数据源接管；数据源一换本地顺序即作废
  const [localOrder, setLocalOrder] = useState<{
    source: readonly TRow[] | undefined;
    keys: string[];
  } | null>(null);
  const keys = localOrder && localOrder.source === dataSource ? localOrder.keys : sourceKeys;
  const rows = useMemo(
    () => keys.map((key) => sourceRows[sourceKeys.indexOf(key)]),
    [keys, sourceKeys, sourceRows]
  );
  const rowIndexes = useMemo(() => new Map(keys.map((key, index) => [key, index])), [keys]);
  // 拖动态只切容器属性（显示取消区），不走 state，避免整张表在拖动开始/结束时重渲染
  const sortableRootRef = useRef<HTMLDivElement | null>(null);
  // 拖动排序只在当前页的行之间发生：记录非受控分页位置，把 dnd 事件的本页目标索引映射回完整顺序。
  const sortablePageRef = useRef({ current: 1, pageSize: DEFAULT_PAGE_SIZE });
  const sortablePagination = typeof props.pagination === 'object' ? props.pagination : undefined;

  // 纯 dataIndex 列只在记录变化时重算；自定义 render 保留 Ant 对 render 闭包与行序号的依赖追踪，
  // 避免语言、选择状态或搜索词变化时把旧单元格内容缓存下来。
  // 声明了宽度的列按标题文字抬到能单行放下的宽度（列标题不折行）
  const sortableColumns = useMemo<ColumnsType<TRow> | undefined>(() => {
    const memoized = (columns ?? []).map((source) => {
      // 所有表头和正文统一左对齐，列宽变化不影响对齐。
      const align = defaultColumnAlign(source);
      const action = source.key === 'action';
      const column = {
        ...source,
        align,
        ...(action
          ? {
              fixed: 'right' as const,
              className: [source.className, 'ds-table__action-cell'].filter(Boolean).join(' '),
            }
          : {}),
      };
      const fitted =
        typeof column.width === 'number'
          ? { ...column, width: titleFitWidth(column.title, column.width, Boolean(column.sorter)) }
          : column;
      // Firefox 不支持 td 本身可靠地横向滚动；普通值由独立原子槽承载。
      const render: NonNullable<(typeof fitted)['render']> = (value, record, index) => {
        const content = fitted.render ? fitted.render(value, record, index) : value;
        if (action) return <TableActions>{content}</TableActions>;
        return typeof content === 'string' || typeof content === 'number' ? (
          <AtomicValue text={String(content)} />
        ) : (
          content
        );
      };
      return {
        ...fitted,
        render,
        ...(fitted.shouldCellUpdate || fitted.render
          ? {}
          : { shouldCellUpdate: (record: TRow, previous: TRow) => record !== previous }),
      };
    });
    if (!sortable) return memoized;
    const handleColumn = {
      key: 'ds-drag-handle',
      title: '',
      align: columnAlign.control,
      width: columnWidth.handle,
      render: () => <DragHandle />,
      shouldCellUpdate: () => false,
    };
    return [handleColumn, ...memoized];
  }, [columns, sortable]);

  // 内容自适应列宽：渲染后量出每列最宽行内内容，把列调到刚好放下（不低于标题；短内容可超过声明、上限 320），
  // 多余空间归主列；数据或列变化时重量。只在结果变化时写 state，避免测量-渲染循环
  const hostRef = useRef<HTMLDivElement | null>(null);
  const [availableWidth, setAvailableWidth] = useState(0);
  const [fitWidths, setFitWidths] = useState<Map<number, number>>(new Map());
  const [auxiliaryWidth, setAuxiliaryWidth] = useState(0);
  const fitContentRef = useRef<string | null>(null);
  // Ant 内部分页/筛选/排序只改 tbody DOM，不经过 props 或数据源：可见行变化也要重测列宽。
  // 内容签名在去重端把关——测量自身的样式改动不产生新一轮布局读写。
  const [bodyVersion, setBodyVersion] = useState(0);
  useLayoutEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const bump = () => setBodyVersion((version) => version + 1);
    const observer = new MutationObserver((mutations) => {
      if (
        mutations.some(
          (mutation) =>
            mutation.target instanceof HTMLElement && mutation.target.closest('.ant-table-tbody')
        )
      )
        bump();
    });
    observer.observe(host, { childList: true, subtree: true, characterData: true });
    return () => observer.disconnect();
  }, []);
  useLayoutEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const observer = new ResizeObserver(() => setAvailableWidth(host.clientWidth));
    observer.observe(host);
    setAvailableWidth(host.clientWidth);
    return () => observer.disconnect();
  }, []);
  useLayoutEffect(() => {
    const host = hostRef.current;
    if (!host || !sortableColumns) return;
    const headerCells = host.querySelectorAll<HTMLElement>(
      '.ant-table-thead > tr:first-child > th'
    );
    // Ant 在最前面追加的多选/展开列不在我们的列定义里
    const leading = Math.max(0, headerCells.length - sortableColumns.length);
    const bodyRows = host.querySelectorAll<HTMLTableRowElement>(
      '.ant-table-tbody > tr.ant-table-row:not([data-dnd-placeholder])'
    );
    // 列宽取该列最宽内容，与行先后无关；只复用真实 DOM 内容、声明宽度、字体和容器均未变的测量。
    // 不按 records 引用猜测：依赖 index 的 render、异步回填和文案变化仍会使内容签名失效。
    const headerFonts = [...headerCells].map((header) => {
      const style = getComputedStyle(header);
      return [style.fontWeight, style.fontSize, style.fontFamily, style.letterSpacing];
    });
    const contentSignature = () =>
      JSON.stringify({
        availableWidth,
        headerFonts,
        columns: sortableColumns.map((column, index) => ({
          width: columns?.[sortable ? index - 1 : index]?.width,
          header: headerCells[leading + index]?.innerHTML,
          contents: [...bodyRows]
            .map((row) => row.children[leading + index]?.innerHTML ?? '')
            .sort(),
        })),
      });
    if (fitContentRef.current === contentSignature()) return;
    // 表头几何先读完；内容恢复样式后不再读布局，避免同一轮测量第二次强制排版。
    const titleWidths = sortableColumns.map((column, index) => {
      const header = headerCells[leading + index];
      const style = header ? getComputedStyle(header) : undefined;
      const font = style ? `${style.fontWeight} ${style.fontSize} ${style.fontFamily}` : undefined;
      return titleFitWidth(
        column.title,
        0,
        Boolean(column.sorter),
        font,
        measureHeaderText(header)
      );
    });
    // Ant 自带的多选/展开前列不在列定义里，但要计入像素总宽与滚动宽度
    const nativeCols = host.querySelectorAll<HTMLTableColElement>('colgroup > col');
    const measuredAuxiliary = [...headerCells].slice(0, leading).reduce((sum, cell, index) => {
      const declared = nativeCols[index]?.style.width ?? '';
      return (
        sum +
        (/^\d+(?:\.\d+)?px$/.test(declared)
          ? parseFloat(declared)
          : cell.getBoundingClientRect().width)
      );
    }, 0);
    setAuxiliaryWidth((current) =>
      Math.abs(current - measuredAuxiliary) < 0.5 ? current : measuredAuxiliary
    );
    const cells = sortableColumns.flatMap((column, index) => {
      const declared = columns?.[sortable ? index - 1 : index];
      if (!declared || column.key === 'action') return [];
      return [...bodyRows].flatMap((row) => {
        const cell = row.children[leading + index];
        return cell instanceof HTMLElement
          ? [{ cell, intrinsic: typeof declared.width !== 'number' }]
          : [];
      });
    });
    const measuredWidths = measureCellWidths(cells);
    const next = new Map<number, number>();
    const squeezed = new Map<number, number>();
    // 操作列在普通适配阶段允许宽松分配；整表仍放不下时收成仅图标的下限。
    let actionIndex = -1;
    let actionMinimum = 0;
    sortableColumns.forEach((column, index) => {
      const declared = columns?.[sortable ? index - 1 : index];
      if (!declared) return;
      if (typeof declared.width !== 'number') {
        // 主列逐行测量：短内容完整展示，超长内容不抬高整表最小宽度。
        if (bodyRows.length === 0) return;
        const titleWidth = titleWidths[index];
        let minimum = flexColumnMinWidth(undefined, titleWidth);
        for (const row of bodyRows) {
          const cell = row.children[leading + index] as HTMLElement | undefined;
          if (cell)
            minimum = Math.max(minimum, flexColumnMinWidth(measuredWidths.get(cell), titleWidth));
        }
        next.set(index, minimum);
        return;
      }
      if (column.key === 'action' && availableWidth > 0) {
        // 固定操作列独立判定：列宽只受自身动作数量与容器份额上限约束；整表仍放不下时另行收成仅图标
        const count = Math.max(
          1,
          ...[...bodyRows].map(
            (row) => row.children[leading + index]?.querySelectorAll('button, a').length ?? 0
          )
        );
        const minimum = actionIconOnlyWidth(count);
        const maximum =
          typeof declared.width === 'number' ? declared.width : columnWidth.actions(count);
        actionIndex = index;
        actionMinimum = minimum;
        next.set(
          index,
          Math.min(maximum, Math.max(minimum, Math.floor((availableWidth * 0.45) / 20) * 20))
        );
        return;
      }
      let widest = 0;
      const contentWidths: number[] = [];
      for (const row of bodyRows) {
        const cell = row.children[leading + index] as HTMLElement | undefined;
        if (!cell) continue;
        const width = measuredWidths.get(cell);
        if (width === undefined) {
          // 集合、长说明等块级内容本就在格内滚动：整表放不下时最多收到短内容上限。
          if (declared.width > SHORT_CONTENT_MAX_WIDTH)
            squeezed.set(index, SHORT_CONTENT_MAX_WIDTH);
          return;
        }
        widest = Math.max(widest, width);
        contentWidths.push(width);
      }
      if (bodyRows.length === 0) return;
      next.set(index, contentFitWidth(widest, titleWidths[index], declared.width));
      squeezed.set(index, squeezedFitWidth(contentWidths, titleWidths[index], declared.width));
    });
    // 整表放不下容器时先让少数长值回到格内滚动，仍放不下就把操作列收成仅图标，最后才整表横滚。
    if (availableWidth > 0) {
      const total = () =>
        sortableColumns.reduce(
          (sum, column, index) => sum + (next.get(index) ?? columnsTotalWidth([column])),
          0
        );
      if (total() > availableWidth) {
        for (const [index, width] of squeezed)
          next.set(index, Math.min(next.get(index) ?? width, width));
      }
      if (total() > availableWidth && actionIndex >= 0 && next.get(actionIndex) !== actionMinimum) {
        next.set(actionIndex, actionMinimum);
      }
    }
    setFitWidths((current) => {
      if (
        current.size === next.size &&
        [...next].every(([key, value]) => current.get(key) === value)
      )
        return current;
      return next;
    });
    // max-content 测量可能为原本无内联样式的节点留下空 style 属性，缓存恢复后的 DOM。
    fitContentRef.current = contentSignature();
  }, [
    columns,
    sortable,
    sortableColumns,
    rows,
    dataSource,
    props.expandable,
    props.rowSelection,
    availableWidth,
    bodyVersion,
  ]);
  const fittedColumns = useMemo<ColumnsType<TRow> | undefined>(
    () =>
      sortableColumns?.map((column, index) => {
        if (!fitWidths.has(index)) return column;
        // 主列不写宽度（仍吸收剩余空间），量出的保底宽度经 flexMinWidth 计入像素总宽
        return typeof column.width === 'number'
          ? { ...column, width: fitWidths.get(index) }
          : { ...column, flexMinWidth: fitWidths.get(index) };
      }),
    [sortableColumns, fitWidths]
  );

  // 行组件必须是稳定引用：每次渲染都新建会让 React 重挂所有行
  const handleLabel = sortable?.handleLabel;
  const sortableEnabled = Boolean(sortable && !sortable.disabled);
  const sortableComponents = useMemo<AntTableProps<TRow>['components']>(() => {
    if (!sortableEnabled || !handleLabel) return components;
    const Row = (rowProps: HTMLAttributes<HTMLTableRowElement> & { 'data-row-key'?: Key }) => (
      <SortableRow {...rowProps} label={handleLabel} />
    );
    return { ...components, body: { ...components?.body, row: Row } };
  }, [components, handleLabel, sortableEnabled]);

  // 像素总宽决定何时横向滚动；交给 Ant 的是按比例换算的百分比列宽（宽屏时多余空间按比例分摊到每一列）
  const renderedColumns = useMemo(
    () => proportionalColumns(fittedColumns, auxiliaryWidth),
    [fittedColumns, auxiliaryWidth]
  );
  const table = (
    <div className="ds-table__wrap">
      {toolbar ? <div className="ds-table__toolbar">{toolbar}</div> : null}
      <div
        ref={hostRef}
        className="ds-table__host"
        data-columns-width={columnsTotalWidth(fittedColumns) + auxiliaryWidth}
        data-auxiliary-width={auxiliaryWidth}
      >
        <AntTable<TRow>
          {...props}
          pagination={
            sortableEnabled && typeof sortablePagination === 'object'
              ? {
                  ...sortablePagination,
                  onChange: (page, pageSize) => {
                    sortablePageRef.current = { current: page, pageSize };
                    sortablePagination.onChange?.(page, pageSize);
                  },
                }
              : props.pagination
          }
          className={['ds-table', props.className].filter(Boolean).join(' ')}
          rowSelection={
            props.rowSelection ? { ...props.rowSelection, align: columnAlign.control } : undefined
          }
          rowKey={rowKey}
          dataSource={sortable ? rows : dataSource}
          columns={renderedColumns}
          tableLayout="fixed"
          scroll={tableScroll(fittedColumns, scrollY, auxiliaryWidth)}
          components={sortableComponents}
        />
      </div>
    </div>
  );

  if (!sortable || sortable.disabled) return table;

  const setDraggingAttribute = (dragging: boolean) => {
    if (!sortableRootRef.current) return;
    if (dragging) sortableRootRef.current.dataset.dragging = 'true';
    else delete sortableRootRef.current.dataset.dragging;
  };

  const handleDragEnd: DragDropEventHandlers['onDragEnd'] = (event, manager) => {
    setDraggingAttribute(false);
    const { source, target } = event.operation;
    if (event.canceled || !source || !target || target.id === CANCEL_ZONE_ID) return;
    const sourceId = String(source.id);
    const fromIndex = keys.indexOf(sourceId);
    // 分页表格只渲染当前页行：排序插件注册的是本页一组，source.index 在键盘拖动中是本页投影位置、
    // 原样落到完整键序会把行移进其他页。落位时乐观排序已把 DOM 行挪到新位置，
    // 直接按渲染出的行序重建本页片段再嵌回完整顺序；DOM 未重排时退回事件计算。
    const paged = props.pagination !== false && props.pagination !== undefined;
    const pageSize =
      sortablePagination?.pageSize ??
      sortablePagination?.defaultPageSize ??
      sortablePageRef.current.pageSize;
    const pageStart = paged
      ? ((sortablePagination?.current ?? sortablePageRef.current.current) - 1) * pageSize
      : 0;
    const pageEnd = paged ? Math.min(pageStart + pageSize, keys.length) : keys.length;
    const nextKeys = (() => {
      if (!sortableRootRef.current) return move(keys, event);
      const rendered = [
        ...sortableRootRef.current.querySelectorAll<HTMLElement>(
          '.ant-table-tbody > tr.ant-table-row:not([data-dnd-placeholder])'
        ),
      ].map((row) => String(row.dataset.rowKey));
      const pageIds = new Set(keys.slice(pageStart, pageEnd));
      const ordered = rendered.filter((id) => pageIds.has(id));
      if (ordered.length !== pageIds.size || !ordered.includes(sourceId)) return move(keys, event);
      return [...keys.slice(0, pageStart), ...ordered, ...keys.slice(pageEnd)];
    })();
    const toIndex = nextKeys.indexOf(sourceId);
    if (fromIndex < 0 || toIndex < 0 || fromIndex === toIndex) return;
    // 官方 OptimisticSortingPlugin 已把同一批行移到目标 DOM 位置，落位期间无需再次重排 React 表格。
    // 等官方清理占位行并回到 idle 后再同步声明式顺序；否则重排提交、列宽测量与库的几何读写争抢动画帧。
    const completion = manager.registry.plugins.get(TableDropCompletion);
    if (!completion) throw new Error('TableDropCompletion plugin is not registered');
    completion.afterDrop(() => {
      if (!sortableRootRef.current) return;
      setLocalOrder({ source: dataSource, keys: nextKeys });
      void sortable.onMove(rows[fromIndex], fromIndex, toIndex);
    });
  };

  return (
    <DragDropProvider
      plugins={tableDragPlugins}
      onDragStart={() => setDraggingAttribute(true)}
      onDragEnd={handleDragEnd}
    >
      <RowIndexContext.Provider value={rowIndexes}>
        <div className="ds-table__sortable" ref={sortableRootRef}>
          <CancelDropZone />
          {table}
        </div>
      </RowIndexContext.Provider>
    </DragDropProvider>
  );
}

Table.SELECTION_ALL = AntTable.SELECTION_ALL;
Table.SELECTION_INVERT = AntTable.SELECTION_INVERT;
Table.SELECTION_NONE = AntTable.SELECTION_NONE;
Table.Summary = AntTable.Summary;
