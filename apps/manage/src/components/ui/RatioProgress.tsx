import { Progress } from 'antd';

import { formatDecimal } from '@/utils/number';

import './RatioProgress.css';

export type RatioProgressProps = {
  /** 当前量（剩余、已用等），与 total 同单位。 */
  value: number;
  /** 总量；≤0 时按 0% 处理。 */
  total: number;
  /** 量的格式化（金额、计数等），两边同一函数。 */
  format: (amount: number) => string;
  /** 可访问名称。 */
  label: string;
};

/** 占比（0–100，一位小数），总量为 0 时按 0 处理。 */
function ratioPercent(value: number, total: number): number {
  if (!Number.isFinite(value) || !Number.isFinite(total) || total <= 0) return 0;
  return Math.min(100, Math.max(0, Number(formatDecimal((value / total) * 100, 1))));
}

/**
 * “部分 / 总量”比例：一行文字 `A / B  N%` 加一条与文字同宽的细进度条，信息网格与表格单元格共用；
 * 宽度随内容自适应，不铺满槽位。只有比例低于 10% 才用 Ant 的 exception（红）状态提示，其余保持默认色。
 */
export function RatioProgress({ value, total, format, label }: RatioProgressProps) {
  const percent = ratioPercent(value, total);
  return (
    <div className="ds-ratio-progress" role="group" aria-label={label}>
      <span className="ds-ratio-progress__text">
        <span className="ds-ratio-progress__amount">{format(value)}</span>
        <span className="ds-ratio-progress__separator" aria-hidden="true">
          /
        </span>
        <span className="ds-ratio-progress__total">{format(total)}</span>
        <span className="ds-ratio-progress__percent">{percent}%</span>
      </span>
      <Progress
        percent={percent}
        size="small"
        showInfo={false}
        status={percent < 10 ? 'exception' : undefined}
      />
    </div>
  );
}
