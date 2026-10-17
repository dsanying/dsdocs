import { expect, test } from './console-guard';
import { collectColumnWaste } from './forced-wrap';

for (const width of [240, 1440]) {
  test(`主列短值完整展示，长值不制造额外整表滚动 ${width}`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/tests/ui/contract-fixture.html?tableFit');
    const short = page.locator('tr[data-row-key="short"] td:first-child .ds-atomic-value');
    const long = page.locator('tr[data-row-key="long"] td:first-child .ds-atomic-value');
    await expect(short).toHaveText('完整展示的短名称');
    await expect(long).toHaveText('超长名称'.repeat(60));
    await expect
      .poll(() => short.evaluate((node) => node.scrollWidth - node.clientWidth))
      .toBeLessThanOrEqual(1);
    await expect
      .poll(() => long.evaluate((node) => node.scrollWidth - node.clientWidth))
      .toBeGreaterThan(100);
    const table = page.locator('.ant-table-content');
    if (width === 1440)
      await expect
        .poll(() => table.evaluate((node) => node.scrollWidth - node.clientWidth))
        .toBeLessThanOrEqual(1);
    else
      await expect
        .poll(() => table.evaluate((node) => node.scrollWidth - node.clientWidth))
        .toBeGreaterThan(0);
  });
}

for (const theme of ['light', 'dark'])
  test(`固定操作尾列按容器收起文字，整表滚动前后全部按钮可见可用 ${theme}`, async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(`/tests/ui/contract-fixture.html?tableFit&fixedActions&theme=${theme}`);
    const table = page.locator('.ant-table-content');
    const header = page.locator('.ant-table-thead th:last-child');
    const cell = page.locator('tr[data-row-key="short"] td:last-child');
    await expect(cell).toHaveClass(/ant-table-cell-fix-end(?:\s|$)/);
    await expect(cell.locator('.ds-table__actions')).toHaveAttribute('data-compact', 'true');
    const check = async () => {
      // 收起为仅图标带 CSS transition（ant 按钮 transition:all），轮询到过渡收敛再量几何，避免读到中间态
      await expect
        .poll(
          () =>
            cell.evaluate((node) => {
              const rect = node.getBoundingClientRect();
              const host = node.closest('.ant-table-content')!.getBoundingClientRect();
              const actions = [...node.querySelectorAll('button')].map((button) =>
                button.getBoundingClientRect()
              );
              return {
                fixed: Math.abs(rect.right - host.right) <= 1,
                scroll: node.scrollWidth - node.clientWidth,
                visible: actions.every(
                  (button) =>
                    button.left >= rect.left && button.right <= rect.right && button.width > 0
                ),
                distinct: actions[0].right <= actions[1].left,
              };
            }),
          { timeout: 5_000 }
        )
        .toEqual({ fixed: true, scroll: 0, visible: true, distinct: true });
      const paint = await header.evaluate((node) => {
        const rect = node.getBoundingClientRect();
        const body = node
          .closest('table')!
          .querySelector('tbody tr[data-row-key=short] td:last-child')!;
        const bodyRect = body.getBoundingClientRect();
        const hostRect = node.closest('.ant-table-content')!.getBoundingClientRect();
        const opaque = (value: string) =>
          value !== 'transparent' &&
          (!value.startsWith('rgba(') || Number(value.slice(value.lastIndexOf(',') + 1, -1)) === 1);
        const background = getComputedStyle(node).backgroundColor;
        return {
          fixed: Math.abs(rect.right - hostRect.right) <= 1,
          aligned:
            Math.abs(rect.left - bodyRect.left) <= 1 && Math.abs(rect.width - bodyRect.width) <= 1,
          opaque: opaque(background),
          sameSurface: background === getComputedStyle(body).backgroundColor,
          cover: [rect.left + 2, rect.right - 2].every(
            (x) => document.elementFromPoint(x, rect.top + rect.height / 2)?.closest('th') === node
          ),
        };
      });
      expect(paint).toEqual({
        fixed: true,
        aligned: true,
        opaque: true,
        sameSurface: true,
        cover: true,
      });
    };
    await check();
    await table.evaluate((node) => {
      node.scrollLeft = node.scrollWidth;
    });
    await check();
    await cell.hover();
    await expect
      .poll(() =>
        cell.evaluate((node) => {
          const color = getComputedStyle(node).backgroundColor;
          const other = node.parentElement!.querySelector('td:first-child')!;
          return (
            color !== 'transparent' &&
            (!color.startsWith('rgba(') ||
              Number(color.slice(color.lastIndexOf(',') + 1, -1)) === 1) &&
            color === getComputedStyle(other).backgroundColor
          );
        })
      )
      .toBe(true);
    // 悬停态退出后复核表头和正文同色的不透明覆盖。
    await header.hover();
    await expect
      .poll(() =>
        cell.evaluate(
          (node) =>
            getComputedStyle(node).backgroundColor ===
            getComputedStyle(node.closest('table')!.querySelector('thead th:last-child')!)
              .backgroundColor
        )
      )
      .toBe(true);
    await check();
    await cell.getByRole('button', { name: /编辑$/ }).click();
    await expect(page.locator('output')).toHaveText('编辑 short');
    await cell.getByRole('button', { name: /删除$/ }).click();
    await expect(page.locator('output')).toHaveText('删除 short');
    await page.getByRole('button', { name: '调整容器' }).click();
    await expect(cell.locator('.ds-table__actions')).not.toHaveAttribute('data-compact', 'true');
    await expect(cell.getByRole('button', { name: /编辑$/ })).toBeVisible();
  });

// 字距与平台字体必须按真实 DOM 测量，不能使用缺少字距的 canvas 宽度撑大表头。
test('标题字体几何与列宽门禁同源，紧凑字距仍按真实内容收紧', async ({ page }) => {
  await page.setViewportSize({ width: 340, height: 900 });
  await page.goto('/tests/ui/contract-fixture.html?tableFit&headerTypography');
  const header = page.locator('.ant-table-thead th:last-child');
  await expect
    .poll(() =>
      header.evaluate((node) => {
        const range = document.createRange();
        range.selectNodeContents(node);
        const actual = range.getBoundingClientRect().width;
        const style = getComputedStyle(node);
        const canvas = document.createElement('canvas').getContext('2d')!;
        canvas.font = `${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
        // +16 与 tableConfig.ts 的 HEADER_CELL_CHROME 同源：列宽 = 表头文字 + 单元格左右内边距之和（8×2），向上取整 20
        return {
          fitted: node.getBoundingClientRect().width <= Math.ceil((actual + 16) / 20) * 20 + 1,
          visible: actual + 16 <= node.getBoundingClientRect().width + 1,
          canvasDiffers: canvas.measureText(node.textContent ?? '').width - actual > 20,
        };
      })
    )
    .toEqual({ fitted: true, visible: true, canvasDiffers: true });
  expect(await collectColumnWaste(page)).toEqual([]);
  // 负例仍拒绝过宽列；不能通过改字号检测口径或放宽40px阈值消除失败。
  await header.evaluate((node) => {
    const col = node.closest('table')!.querySelectorAll<HTMLTableColElement>('colgroup col')[1];
    col.style.width = '400px';
    node.closest('.ds-table__host')!.setAttribute('data-columns-width', '600');
  });
  expect(await collectColumnWaste(page)).not.toEqual([]);
});

for (const [containerWidth, compact] of [
  [960, false],
  [820, false],
  [720, true],
] as const) {
  test(`整表放不下时先收回少数长值、再把操作列收成图标 ${containerWidth}px`, async ({ page }) => {
    await page.setViewportSize({ width: 1200, height: 900 });
    await page.goto(`/tests/ui/contract-fixture.html?tableFit&squeeze=${containerWidth}`);
    const table = page.locator('.ant-table-content');
    await expect(
      page.locator('tr[data-row-key="b"] td:nth-child(2) .ds-atomic-value')
    ).toHaveAttribute('data-overflowing', 'true');
    await expect
      .poll(() => table.evaluate((node) => node.scrollWidth - node.clientWidth), {
        message: '宽度足够收紧时不应整表横滚',
      })
      .toBeLessThanOrEqual(1);
    const short = page.locator('tr[data-row-key="a"] td:nth-child(2) .ds-atomic-value');
    await expect
      .poll(() => short.evaluate((node) => node.scrollWidth - node.clientWidth), {
        message: '短账号仍完整展示',
      })
      .toBeLessThanOrEqual(1);
    const actions = page.locator('tr[data-row-key="a"] .ds-table__actions');
    if (compact) await expect(actions).toHaveAttribute('data-compact', 'true');
    else await expect(actions).not.toHaveAttribute('data-compact', 'true');
    await expect(actions.getByRole('button')).toHaveCount(2);
  });
}
