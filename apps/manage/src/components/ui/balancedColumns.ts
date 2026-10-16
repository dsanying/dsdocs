/**
 * 并列项“多个一行”的统一判定（FRONTEND-LAYOUT 均衡分列）：
 * - 列宽取所有项内容不折行时的固有宽度中最宽者，各列等宽；
 * - 列数 n 须放得下：n × 列宽 + (n − 1) × 列间距 ≤ 容器宽度；
 * - 且分行均衡：n 整除项数，或 n ≥ 3 时末行只空一格（余数 = n − 1）；2 列时不允许 2 + 1 这类孤儿行；
 * - 取满足条件的最大 n，放得下就不得因固定阈值强制单列。
 */
export function pickBalancedColumns(
  count: number,
  itemWidth: number,
  containerWidth: number,
  gap = 0
): number {
  if (count <= 1 || itemWidth <= 0) return 1;
  for (let columns = count; columns > 1; columns -= 1) {
    const fits = columns * itemWidth + (columns - 1) * gap <= containerWidth + 0.5;
    const remainder = count % columns;
    const balanced = remainder === 0 || (columns >= 3 && remainder === columns - 1);
    if (fits && balanced) return columns;
  }
  return 1;
}

/**
 * 在容器允许的最多列数内选择分行均衡的列数：最大列数整除或末行只空一格时直接采用；
 * 否则少一列能整除就少一列；再否则选末行至少半满的最大列数，仍不满足时用容器最大列数。
 */
export function pickInformationColumns(count: number, maxColumns: number): number {
  if (count <= maxColumns) return Math.max(1, count);
  const remainder = count % maxColumns;
  if (remainder === 0 || remainder === maxColumns - 1) return maxColumns;
  if (maxColumns > 2 && count % (maxColumns - 1) === 0) return maxColumns - 1;
  for (let columns = maxColumns; columns >= 2; columns -= 1) {
    if (count % columns >= columns / 2) return columns;
  }
  return maxColumns;
}

/** 末行未满时把空出的格均匀分给末行字段（靠后的字段先多占一格），整组右缘对齐。 */
export function distributeLastRow(count: number, columns: number): number[] {
  const spans = Array.from({ length: count }, () => 1);
  const remainder = count % columns;
  if (!remainder) return spans;
  const extra = columns - remainder;
  const start = count - remainder;
  for (let index = 0; index < remainder; index += 1) {
    spans[start + index] +=
      Math.floor(extra / remainder) + (index >= remainder - (extra % remainder) ? 1 : 0);
  }
  return spans;
}
