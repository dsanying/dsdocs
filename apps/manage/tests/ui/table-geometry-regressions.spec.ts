import { expect, test } from './console-guard';
import { collectTableGeometryIssues, expectTableColumnsAligned } from './table-geometry';

for (const theme of ['light', 'dark'])
  for (const width of [240, 1440, 1470])
    for (const split of [false, true]) {
      test(`全部列头正文共享边界，含排序/选择/展开/分组/合并 ${theme} ${width} 分离表头=${split}`, async ({
        page,
      }) => {
        await page.setViewportSize({ width, height: 900 });
        await page.goto(
          `/tests/ui/contract-fixture.html?tableFit&columnGeometry&theme=${theme}${split ? '&splitHeader' : ''}`
        );
        await expect(page.locator('.ant-table-selection-column').first()).toBeVisible();
        await expect(page.locator('.ds-table__drag-handle').first()).toBeVisible();
        await expect(page.locator('.ant-table-expanded-row')).toHaveCount(1);
        await expect(page.locator('.ant-table-thead > tr')).toHaveCount(2);
        await expect(page.locator('tr[data-row-key="long"] td[colspan="2"]')).toHaveCount(1);
        await expectTableColumnsAligned(page);
        const scroll = page.locator('.ant-table-content, .ant-table-body');
        await scroll.evaluate((node) => {
          node.scrollLeft = node.scrollWidth;
        });
        if (split)
          await expect
            .poll(() =>
              scroll.evaluate((node) => {
                const header = node
                  .closest('.ds-table')!
                  .querySelector<HTMLElement>('.ant-table-header')!;
                return Math.abs(header.scrollLeft - node.scrollLeft);
              })
            )
            .toBeLessThanOrEqual(1);
        await expectTableColumnsAligned(page);
        await scroll.evaluate((node) => {
          node.scrollLeft = 0;
        });
        if (split)
          await expect
            .poll(() =>
              scroll.evaluate((node) => {
                const header = node
                  .closest('.ds-table')!
                  .querySelector<HTMLElement>('.ant-table-header')!;
                return Math.abs(header.scrollLeft - node.scrollLeft);
              })
            )
            .toBeLessThanOrEqual(1);
        // 真实 DOM 反例：把正常数据格移出所属列，守卫必须拒绝，恢复后才允许全局收尾。
        const cell = page.locator('tr[data-row-key="short"] td').first();
        await cell.evaluate((node) => {
          node.style.transform = 'translateX(4px)';
        });
        const issues = await collectTableGeometryIssues(page);
        expect(issues.some((issue) => issue.includes('头/正文边界不一致'))).toBe(true);
        await cell.evaluate((node) => {
          node.style.transform = '';
        });
        await expectTableColumnsAligned(page);
        // 外框宽度保持相同也必须拒绝阴影偏移，复现真实 Firefox 操作列错位。
        const fixed = page.locator('tr[data-row-key="short"] td:last-child');
        await fixed.evaluate((node) => {
          node.style.borderInline = '16px solid transparent';
          node.style.paddingInline = '0';
        });
        const paintIssues = await collectTableGeometryIssues(page);
        expect(paintIssues.some((issue) => issue.includes('固定列阴影锚点不一致'))).toBe(true);
        expect(paintIssues.some((issue) => issue.includes('头/正文边界不一致'))).toBe(false);
        await fixed.evaluate((node) => {
          node.style.borderInline = '';
          node.style.paddingInline = '';
        });
        await expectTableColumnsAligned(page);
      });
    }
