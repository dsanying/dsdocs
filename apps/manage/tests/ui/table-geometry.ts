import { expect, type Page } from '@playwright/test';

/** 用真实单元格矩形核对所有列；选择、展开、排序等辅助列也必须和表头同源。 */
export async function collectTableGeometryIssues(page: Page) {
  return page.evaluate(() => {
    const issues: string[] = [];
    const visible = (cell: Element) => {
      const rect = cell.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0 && getComputedStyle(cell).visibility !== 'hidden';
    };
    for (const [tableIndex, wrapper] of [...document.querySelectorAll('.ds-table')].entries()) {
      // 独立滚动头/正文也在同一 wrapper 下；不能依赖它们恰好属于同一个 table 元素。
      const owned = (selector: string) =>
        [...wrapper.querySelectorAll(selector)].find(
          (node) => node.closest('.ds-table') === wrapper
        );
      const head = owned('.ant-table-thead');
      const body = owned('.ant-table-tbody');
      if (!head || !body || !visible(head) || !visible(body)) continue;
      const grid: HTMLTableCellElement[][] = [];
      const headerRows = [...head.children] as HTMLTableRowElement[];
      headerRows.forEach((row, rowIndex) => {
        grid[rowIndex] ??= [];
        let column = 0;
        for (const cell of [...row.cells]) {
          while (grid[rowIndex][column]) column += 1;
          // 垂直滚动条补位不是数据列，不参与逻辑列序号。
          if (cell.classList.contains('ant-table-cell-scrollbar')) continue;
          for (let y = 0; y < cell.rowSpan; y += 1) {
            grid[rowIndex + y] ??= [];
            for (let x = 0; x < cell.colSpan; x += 1) grid[rowIndex + y][column + x] = cell;
          }
          column += cell.colSpan;
        }
      });
      const leaves = grid[headerRows.length - 1] ?? [];
      const occupied: number[] = [];
      const rows = [...body.children] as HTMLTableRowElement[];
      for (const row of rows) {
        // Ant 测量行、空态和展开说明不表示一条正常数据；合并数据格仍必须检查。
        if (!row.classList.contains('ant-table-row') || !visible(row)) continue;
        let column = 0;
        const coveredColumns = new Set(
          occupied.flatMap((value, index) => (value > 0 ? [index] : []))
        );
        const nextOccupied = occupied.map((value) => Math.max(0, value - 1));
        for (const cell of [...row.cells]) {
          while ((occupied[column] ?? 0) > 0) column += 1;
          const start = column;
          column += cell.colSpan;
          for (let x = start; x < column; x += 1) {
            coveredColumns.add(x);
            nextOccupied[x] = Math.max(nextOccupied[x] ?? 0, cell.rowSpan - 1);
          }
          if (!visible(cell)) continue;
          const covered = Array.from({ length: cell.colSpan }, (_, index) => leaves[start + index]);
          const label = `表格 ${tableIndex + 1} 行 ${row.dataset.rowKey ?? '?'} 列 ${start + 1}-${column}`;
          if (
            covered.length !== cell.colSpan ||
            covered.some((header) => !header || !visible(header))
          ) {
            issues.push(`${label} 缺少可见对应叶表头`);
            continue;
          }
          const rect = cell.getBoundingClientRect();
          const bounds = covered.map((header) => header.getBoundingClientRect());
          const left = Math.min(...bounds.map((bound) => bound.left));
          const right = Math.max(...bounds.map((bound) => bound.right));
          // 固定列阴影由 padding box 定位。透明行内边框不会改变外框宽度，
          // 却会把 ::after 与可见覆盖边界推入列内，不能只比较 border box。
          if (cell.classList.contains('ant-table-cell-fix') && covered.length === 1) {
            const headerStyle = getComputedStyle(covered[0]);
            const bodyStyle = getComputedStyle(cell);
            const headerLeft = left + parseFloat(headerStyle.borderLeftWidth);
            const headerRight = right - parseFloat(headerStyle.borderRightWidth);
            const bodyLeft = rect.left + parseFloat(bodyStyle.borderLeftWidth);
            const bodyRight = rect.right - parseFloat(bodyStyle.borderRightWidth);
            if (Math.abs(headerLeft - bodyLeft) > 1 || Math.abs(headerRight - bodyRight) > 1) {
              issues.push(
                `${label} 固定列阴影锚点不一致：头 ${headerLeft.toFixed(2)}..${headerRight.toFixed(2)}，正文 ${bodyLeft.toFixed(2)}..${bodyRight.toFixed(2)}`
              );
            }
          }
          if (
            Math.abs(rect.left - left) > 1 ||
            Math.abs(rect.right - right) > 1 ||
            Math.abs(rect.width - (right - left)) > 1
          ) {
            issues.push(
              `${label} 头/正文边界不一致：头 ${left.toFixed(2)}..${right.toFixed(2)}，正文 ${rect.left.toFixed(2)}..${rect.right.toFixed(2)}`
            );
          }
        }
        if (coveredColumns.size !== leaves.length)
          issues.push(
            `表格 ${tableIndex + 1} 行 ${row.dataset.rowKey ?? '?'} 逻辑数据列数量 ${coveredColumns.size} 与叶表头 ${leaves.length} 不一致`
          );
        occupied.splice(0, occupied.length, ...nextOccupied);
      }
    }
    return issues;
  });
}

export async function expectTableColumnsAligned(page: Page) {
  expect(
    await collectTableGeometryIssues(page),
    '全部叶表头与正文列必须共享左右边界和宽度'
  ).toEqual([]);
}
