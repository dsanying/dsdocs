import { test, expect } from './console-guard';
import { expectReadableInformationFields, expectNoDocumentOverflow } from './forced-wrap';

for (const width of [320, 600, 900, 1200])
  for (const theme of ['light', 'dark']) {
    test(`详情按宿主降列、完整展开 ${width} ${theme}`, async ({ page }) => {
      await page.setViewportSize({ width, height: 1000 });
      await page.goto('/tests/ui/contract-fixture.html?orderingDetails&theme=' + theme);
      const grid = page.getByRole('region', { name: 'Responsive details' }).locator('dl');
      await expect(grid.locator('dd').first()).toHaveText('continuous-identifier-'.repeat(20));
      await expect
        .poll(() =>
          grid.evaluate((node) => getComputedStyle(node).gridTemplateColumns.split(' ').length)
        )
        .toBe(width === 320 ? 1 : width === 600 ? 2 : width === 900 ? 3 : 4);
      await expectReadableInformationFields(page);
      await expectNoDocumentOverflow(page);
    });
  }
test('主动排序恢复默认、翻页保持全局顺序', async ({ page }) => {
  await page.goto('/tests/ui/contract-fixture.html?orderingDetails');
  const table = page.getByRole('region', { name: 'Ordering contract' });
  const rows = table.locator('tbody tr.ant-table-row');
  await expect(rows.first()).toContainText('Entity 1');
  await expect(rows.last()).toContainText('Entity 10');
  await table.locator('.ant-pagination-item-2').click();
  await expect(rows.first()).toContainText('Entity 11');
  const header = table.getByRole('columnheader', { name: /Name/ });
  await header.click();
  await expect(rows.first()).toContainText('Entity 21');
  await expect(table.getByTestId('sort-request')).toContainText('"current":1');
  await expect(table.getByTestId('sort-request')).toContainText('"order":"descend"');
  await header.click();
  await expect(rows.first()).toContainText('Entity 1');
  await expect(table.getByTestId('sort-request')).toContainText('"order":"ascend"');
});
