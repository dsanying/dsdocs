import { useLayoutEffect, useRef, useState, type Key, type ReactNode } from 'react';

import { formatNumber } from '@/utils/number';

import { distributeLastRow, pickInformationColumns } from './balancedColumns';

import './InformationFieldGrid.css';

export type InformationField = {
  key: Key;
  label: ReactNode;
  value: ReactNode;
  /** 正文或复杂集合需要完整宽度时显式占整行。 */
  span?: 'full';
};

export type InformationFieldGridProps = {
  items: InformationField[];
  className?: string;
  compact?: boolean;
  /**
   * 填满宿主卡片正文：卡片头是切割出的标题格，网格贴边接在头部分隔线之下，
   * 只保留底部圆角；宿主 Card 必须 styles.body.padding 为 0 且网格是正文唯一内容。
   */
  flush?: boolean;
};

/** 单对象异构只读字段的统一键值布局。 */
export function InformationFieldGrid({
  items,
  className,
  compact = false,
  flush = false,
}: InformationFieldGridProps) {
  const gridRef = useRef<HTMLDListElement>(null);
  const [columns, setColumns] = useState(1);
  useLayoutEffect(() => {
    const grid = gridRef.current;
    if (!grid) return;
    const measure = () => {
      const minimum = parseFloat(getComputedStyle(grid).getPropertyValue('--ds-space-40')) * 6;
      const gap = parseFloat(getComputedStyle(grid).columnGap) || 0;
      setColumns(Math.max(1, Math.min(4, Math.floor((grid.clientWidth + gap) / (minimum + gap)))));
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(grid);
    return () => observer.disconnect();
  }, []);
  const renderField = (item: InformationField, span?: number) => (
    <div
      className="ds-information-grid__field"
      key={item.key}
      data-span={item.span}
      style={span && span > 1 ? { gridColumn: `span ${span}` } : undefined}
    >
      <dt>{item.label}</dt>
      <dd>{typeof item.value === 'number' ? formatNumber(item.value) : (item.value ?? '—')}</dd>
    </div>
  );
  // 短字段连续成一组、整行字段统一排在其后，避免整行字段把短字段切成多个半空行。
  const short = items.filter((item) => item.span !== 'full');
  const full = items.filter((item) => item.span === 'full');
  const content: ReactNode[] = [];
  if (short.length) {
    const groupColumns = pickInformationColumns(short.length, columns);
    const spans = distributeLastRow(short.length, groupColumns);
    content.push(
      <div
        className="ds-information-grid__group"
        key="short"
        style={{ gridTemplateColumns: `repeat(${groupColumns}, minmax(0, 1fr))` }}
      >
        {short.map((item, index) => renderField(item, spans[index]))}
      </div>
    );
  }
  for (const item of full) content.push(renderField(item));

  return (
    <dl
      ref={gridRef}
      className={[
        'ds-information-grid',
        compact ? 'ds-information-grid--compact' : undefined,
        flush ? 'ds-information-grid--flush' : undefined,
        className,
      ]
        .filter(Boolean)
        .join(' ')}
      style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}
      data-kind="information-field-grid"
    >
      {content}
    </dl>
  );
}
