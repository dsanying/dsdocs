import {
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type Key,
  type ReactNode,
} from 'react';

import { formatNumber } from '@/utils/number';

import { pickBalancedColumns } from './balancedColumns';
import { LoadingIndicator } from './Feedback';

import './SummaryStrip.css';

export type SummaryStripItem = {
  key: Key;
  /** 单个词项：状态、余额、计数等的名称。 */
  label: ReactNode;
  /** 已格式化的值；状态传 StatusTag，金额由调用方带前缀格式化。 */
  value: ReactNode;
  loading?: boolean;
  loadingLabel?: string;
  /** 只在值本身具有语义（超额、告警、异常）时着色；普通数值保持前景色。 */
  tone?: 'success' | 'warning' | 'error';
  /**
   * 值的构成：值是若干部分之和时列出各部分（已格式化），渲染为值下方的小字算式
   * “A 部分 + B 部分”，让读者一眼看出总数怎么来的，而不用另开一行字段。
   */
  breakdown?: { key: Key; label: ReactNode; value: ReactNode }[];
  /** 值的参照说明（不是求和），如“占定期配额 ¥1,200.00 的 31.9%”；与 breakdown 同样以小字列在值下方。 */
  note?: ReactNode;
};

export type SummaryStripProps = {
  label: string;
  items: SummaryStripItem[];
  className?: string;
};

/**
 * 关键指标条：详情页与区块顶部需要强调、又不该各占一张卡的少量关键数据。
 * 标签小字在上、数值以指标字号加粗在下、项间 1px 竖线，不套卡片壳；列数按各项内容固有宽度、自身宽度与项数
 * 用 pickBalancedColumns 均衡选择（放得下就多列，不留孤儿行）；
 * 数据总览的 KPI 卡（带趋势）是唯一更重的层级，其余场景不得再自绘大数字块。
 */
export function SummaryStrip({ label, items, className }: SummaryStripProps) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [columns, setColumns] = useState(1);

  // 测量态下各项按内容不折行排开，读出最宽项作为列宽，再按容器宽度与项数选均衡列数
  useLayoutEffect(() => {
    const track = trackRef.current;
    if (!track) return undefined;
    const measure = () => {
      track.dataset.measuring = 'true';
      const cells = [...track.children] as HTMLElement[];
      const itemWidth = Math.max(0, ...cells.map((cell) => cell.getBoundingClientRect().width));
      const style = getComputedStyle(cells[1] ?? cells[0] ?? track);
      // 行首项没有起始缩进与分隔线，可用宽度补回这一格
      const startInset =
        (Number.parseFloat(style.paddingInlineStart) || 0) +
        (Number.parseFloat(style.borderInlineStartWidth) || 0);
      delete track.dataset.measuring;
      setColumns(pickBalancedColumns(cells.length, itemWidth, track.clientWidth + startInset));
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(track);
    return () => observer.disconnect();
  }, [items]);

  return (
    <section
      aria-label={label}
      className={['ds-summary-strip', className].filter(Boolean).join(' ')}
      data-kind="summary-strip"
    >
      <div
        ref={trackRef}
        className="ds-summary-strip__track"
        data-count={items.length}
        data-columns={columns}
        style={{ '--summary-columns': columns } as CSSProperties}
      >
        {items.map((item, index) => (
          <div
            className="ds-summary-strip__item"
            key={item.key}
            data-tone={item.tone}
            data-row-start={index % columns === 0 ? 'true' : undefined}
          >
            <span className="ds-summary-strip__label">{item.label}</span>
            <span className="ds-summary-strip__value">
              {item.loading ? (
                <LoadingIndicator label={item.loadingLabel ?? String(item.label)} />
              ) : typeof item.value === 'number' ? (
                formatNumber(item.value)
              ) : (
                item.value
              )}
            </span>
            {item.breakdown?.length && !item.loading ? (
              <span className="ds-summary-strip__breakdown">
                {item.breakdown.map((part, index) => (
                  <span className="ds-summary-strip__part" key={part.key}>
                    {index > 0 ? (
                      <span className="ds-summary-strip__operator" aria-hidden="true">
                        +
                      </span>
                    ) : null}
                    <span className="ds-summary-strip__part-label">{part.label}</span>
                    <span className="ds-summary-strip__part-value">{part.value}</span>
                  </span>
                ))}
              </span>
            ) : null}
            {item.note && !item.loading ? (
              <span className="ds-summary-strip__breakdown">{item.note}</span>
            ) : null}
          </div>
        ))}
      </div>
    </section>
  );
}
