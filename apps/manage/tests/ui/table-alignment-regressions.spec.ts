import { expect, test } from './console-guard';

for (const width of [320, 1440]) {
  for (const theme of ['light', 'dark']) {
    test(`所有表头与内容统一左对齐，数字使用等宽字形 ${width} ${theme}`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.goto(`/tests/ui/contract-fixture.html?tableAlignment&theme=${theme}`);
      const headers = page.locator('thead th');
      const cells = page.locator('tbody tr[data-row-key]').first().locator('td');
      await expect(headers).toHaveCount(7);
      await expect(cells).toHaveCount(7);
      for (const [index, alignment] of Array(7).fill('left').entries()) {
        await expect(headers.nth(index)).toHaveCSS('text-align', alignment);
        await expect(cells.nth(index)).toHaveCSS('text-align', alignment);
      }
      await expect(cells.nth(3)).toHaveCSS('font-variant-numeric', 'tabular-nums');
      await expect(cells.nth(6).locator('.ds-responsive-actions')).toHaveCSS(
        'justify-content',
        'flex-end'
      );
      // 比较真实文本范围：不同位数数值的左边缘应重合，不能只检查 align 属性。
      for (const index of [3, 4]) {
        const edges = await page.locator('tbody tr[data-row-key]').evaluateAll(
          (rows, i) =>
            rows.map((row) => {
              const cell = row.querySelectorAll('td')[i];
              const range = document.createRange();
              range.selectNodeContents(cell);
              return range.getBoundingClientRect().left;
            }),
          index
        );
        expect(Math.abs(edges[0] - edges[1])).toBeLessThan(1);
      }
    });
    test(`超长数值可完整滚动，内容更新后保持左对齐 ${width} ${theme}`, async ({
      page,
      browserName,
    }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.goto(
        `/tests/ui/contract-fixture.html?tableAlignment&oversizedNumber&theme=${theme}`
      );
      const headers = page.locator('thead th');
      const longCell = page
        .locator('tbody tr[data-row-key="c"] td')
        .nth(3)
        .locator('.ds-atomic-value');
      // 先验证开头实际落在格内：右对齐负向溢出即便文字仍在 DOM 里，也无法滚回开头。
      await expect
        .poll(() =>
          longCell.evaluate((cell) => {
            const range = document.createRange();
            range.selectNodeContents(cell);
            return range.getBoundingClientRect().left >= cell.getBoundingClientRect().left;
          })
        )
        .toBe(true);
      await expect(longCell).toHaveCSS('text-align', 'left');
      await expect(headers.nth(3)).toHaveCSS('text-align', 'left');
      if (browserName === 'chromium')
        expect(
          await longCell.evaluate((node) => getComputedStyle(node, '::-webkit-scrollbar').height)
        ).toBe('2px');
      await expect(longCell).toHaveAttribute('data-overflowing', 'true');
      await expect(page.locator('tbody tr[data-row-key="c"]')).toHaveAttribute('tabindex', '0');
      await expect(headers.nth(4)).toHaveCSS('text-align', 'left');
      await longCell.evaluate((cell) => {
        cell.scrollLeft = cell.scrollWidth;
      });
      expect(
        await longCell.evaluate((cell) => {
          const range = document.createRange();
          range.selectNodeContents(cell);
          return range.getBoundingClientRect().right <= cell.getBoundingClientRect().right + 1;
        })
      ).toBe(true);
      await page.getByRole('button', { name: '切换长数值' }).click();
      await expect(headers.nth(3)).toHaveCSS('text-align', 'left');
      await expect(page.locator('tbody tr[data-row-key="a"] td').nth(3)).toHaveCSS(
        'text-align',
        'left'
      );
    });
  }
}

for (const width of [320, 1440]) {
  test(`关联名称超长时图标固定且末尾可滚动到达 ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/tests/ui/contract-fixture.html?tableAlignment&longLink');
    const link = page.locator('tbody .ds-action-link[data-variant=name]').first();
    const slot = link.locator('.ds-action-link__label');
    await expect(slot).toHaveAttribute('data-overflowing', 'true');
    const iconLeft = await link
      .locator('.ds-action-link__icon')
      .evaluate((node) => node.getBoundingClientRect().left);
    const end = await slot.evaluate((node) => {
      node.scrollLeft = node.scrollWidth;
      const range = document.createRange();
      range.selectNodeContents(node);
      return {
        left: node.scrollLeft,
        end: range.getBoundingClientRect().right,
        edge: node.getBoundingClientRect().right,
      };
    });
    expect(end.left).toBeGreaterThan(0);
    expect(end.end).toBeLessThanOrEqual(end.edge + 1);
    expect(
      await link
        .locator('.ds-action-link__icon')
        .evaluate((node) => node.getBoundingClientRect().left)
    ).toBe(iconLeft);
    expect(
      await link.evaluate(
        (node) =>
          node.getBoundingClientRect().right <= node.closest('td')!.getBoundingClientRect().right
      )
    ).toBe(true);
  });
}

for (const width of [320, 1440]) {
  test(`复合额度窄屏横滚、宽屏完整单行展示 ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/tests/ui/contract-fixture.html?tableAlignment&longRatio');
    const slot = page.locator('tbody .ds-ratio-progress__text').first();
    await expect(slot).toHaveCSS('flex-wrap', 'nowrap');
    if (width === 1440) {
      await expect(slot).not.toHaveAttribute('data-overflowing', 'true');
      expect(await slot.evaluate((node) => node.scrollWidth <= node.clientWidth + 1)).toBe(true);
      return;
    }
    await expect(slot).toHaveAttribute('data-overflowing', 'true');
    const end = await slot.evaluate((node) => {
      node.scrollLeft = node.scrollWidth;
      const range = document.createRange();
      range.selectNodeContents(node.lastElementChild!);
      return {
        left: node.scrollLeft,
        end: range.getBoundingClientRect().right,
        edge: node.getBoundingClientRect().right,
      };
    });
    expect(end.left).toBeGreaterThan(0);
    expect(end.end).toBeLessThanOrEqual(end.edge + 1);
  });
}
