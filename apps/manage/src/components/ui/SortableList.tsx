import { HolderOutlined } from '@ant-design/icons';
import { move } from '@dnd-kit/helpers';
import { DragDropProvider, type DragDropEventHandlers } from '@dnd-kit/react';
import { useSortable } from '@dnd-kit/react/sortable';
import type { ReactNode } from 'react';

import './SortableList.css';

export type SortableListProps<T> = {
  items: readonly T[];
  itemKey: (item: T, index: number) => string;
  /** 一项被放到新位置（同一列表内的索引），由调用方更新数据。 */
  onMove: (fromIndex: number, toIndex: number) => void;
  /**
   * 渲染一项。第三个参数是这一项的拖动手柄（小按钮）：`card` 外观下由项自己放进首行（如题目卡标题行最前），
   * 不另占一列，下面的内容照常占满整宽；`plain` 外观下手柄已在行首，忽略即可。
   */
  renderItem: (item: T, index: number, handle: ReactNode) => ReactNode;
  /** 拖动手柄的可访问名称（如“拖动调整顺序”）。 */
  handleLabel: string;
  disabled?: boolean;
  /** 个别项不可拖（如固定在末尾的系统项）。 */
  itemDisabled?: (item: T, index: number) => boolean;
  /** 手柄与内容的纵向对齐：多行内容（默认）顶端对齐，单行条目（如大纲行）居中。 */
  align?: 'start' | 'center';
  /**
   * 每项的外观：`plain`（默认）给一行裸控件（按钮文案、选项），手柄在行首；
   * `card` 给本身是一块内容的项（题目、页面大纲、媒体）：整项就是卡片，手柄作为小组件由项放进自己的首行，
   * 既不在卡片外、也不在卡片内另起一列。项内容不再自己套 Card / 边框。
   */
  variant?: 'plain' | 'card';
  /** 当前选中的项（如大纲里正在编辑的页），card 外观下加深边框与底色。 */
  itemSelected?: (item: T, index: number) => boolean;
  className?: string;
};

function SortableItem({
  id,
  index,
  label,
  disabled,
  selected,
  inlineHandle,
  render,
}: {
  id: string;
  index: number;
  label: string;
  disabled?: boolean;
  selected?: boolean;
  /** 手柄交给项自己放（card 外观），不在行首另起一列 */
  inlineHandle: boolean;
  render: (handle: ReactNode) => ReactNode;
}) {
  const { ref, handleRef, isDragging } = useSortable({ id, index, disabled });
  const handle = (
    <button
      type="button"
      ref={handleRef}
      className={
        inlineHandle
          ? 'ds-sortable-list__handle ds-sortable-list__handle--inline'
          : 'ds-sortable-list__handle'
      }
      aria-label={label}
      disabled={disabled}
    >
      <HolderOutlined aria-hidden="true" />
    </button>
  );
  return (
    <li
      ref={ref}
      className={['ds-sortable-list__item', isDragging ? 'ds-sortable-list__item--dragging' : '']
        .filter(Boolean)
        .join(' ')}
      data-selected={selected ? 'true' : undefined}
    >
      {inlineHandle ? null : handle}
      <div className="ds-sortable-list__content">{render(inlineHandle ? handle : null)}</div>
    </li>
  );
}

/**
 * 列表项拖动排序的唯一入口（@dnd-kit/react）：手柄起拖、拖动中乐观换位、松手自带落位动画，
 * 键盘（空格抓起、方向键移动、空格放下）与读屏播报由库提供；替代逐项“上移/下移”按钮与原生 draggable。
 * 表格行排序用共享 Table 的 sortable。
 */
export function SortableList<T>({
  items,
  itemKey,
  onMove,
  renderItem,
  handleLabel,
  disabled = false,
  itemDisabled,
  align = 'start',
  variant = 'plain',
  itemSelected,
  className,
}: SortableListProps<T>) {
  const keys = items.map((item, index) => itemKey(item, index));
  const handleDragEnd: DragDropEventHandlers['onDragEnd'] = (event) => {
    const { source } = event.operation;
    if (event.canceled || !source) return;
    const nextKeys = move(keys, event);
    const fromIndex = keys.indexOf(String(source.id));
    const toIndex = nextKeys.indexOf(String(source.id));
    if (fromIndex >= 0 && toIndex >= 0 && fromIndex !== toIndex) onMove(fromIndex, toIndex);
  };
  return (
    <DragDropProvider onDragEnd={handleDragEnd}>
      <ul
        className={['ds-sortable-list', className].filter(Boolean).join(' ')}
        data-kind="sortable-list"
        data-align={align}
        data-variant={variant}
      >
        {items.map((item, index) => (
          <SortableItem
            key={keys[index]}
            id={keys[index]}
            index={index}
            label={handleLabel}
            disabled={disabled || itemDisabled?.(item, index) === true}
            selected={itemSelected?.(item, index)}
            inlineHandle={variant === 'card'}
            render={(handle) => renderItem(item, index, handle)}
          />
        ))}
      </ul>
    </DragDropProvider>
  );
}
