import { expect, test } from './console-guard';

test('共享分页：内存与服务端默认十条，候选一致，切换与缩减正确', async ({ page }) => {
  await page.goto('/tests/ui/contract-fixture.html?pagination=1');
  const client = page.getByRole('region', { name: 'client pagination' });
  const server = page.getByRole('region', { name: 'server pagination' });
  for (const region of [client, server]) {
    await expect(region.locator('.ant-table-tbody tr[data-row-key]')).toHaveCount(10);
    await expect(region.locator('.ant-pagination-options')).toContainText('10');
    await region.getByRole('combobox').click();
    const options = page.getByRole('option');
    await expect(options).toHaveCount(4);
    for (const size of [10, 20, 50, 100])
      await expect(page.getByRole('option', { name: new RegExp(`^${size} `) })).toBeVisible();
    await page.getByRole('option', { name: /^20 / }).click();
    await expect(region.locator('.ant-table-tbody tr[data-row-key]')).toHaveCount(20);
    await expect(region.locator('.ant-pagination-item-active')).toHaveText('1');
  }
  await client.locator('.ant-pagination-next button').click();
  await expect(client.locator('.ant-pagination-item-active')).toHaveText('2');
  await client.getByRole('button', { name: 'Shrink rows' }).click();
  await expect(client.locator('.ant-table-tbody tr[data-row-key]')).toHaveCount(5);
  await expect(client.locator('.ant-pagination-item-active')).toHaveText('1');
});

test('分页排序只移动当前页，回调索引对应完整数据源', async ({ page }) => {
  await page.goto('/tests/ui/contract-fixture.html?pagination=1');
  const region = page.getByRole('region', { name: 'sortable pagination' });
  await region.locator('.ant-pagination-next button').click();
  const row = region.locator('tbody tr[data-row-key="10"]:not([data-dnd-placeholder])');
  await expect(row).toHaveAttribute('tabindex', '0');
  await row.focus();
  await expect(row).toBeFocused();
  await page.keyboard.press('Space');
  await expect(row).toHaveAttribute('aria-pressed', 'true');
  await page.keyboard.press('Space');
  await expect(row).toHaveAttribute('aria-pressed', 'false');
  await expect(region.locator('[data-fixture="pagination-order"]')).toHaveText(
    Array.from({ length: 21 }, (_, i) => String(i)).join(',')
  );
  await expect(row).toHaveAttribute('tabindex', '0');
  await row.focus();
  await expect(row).toBeFocused();
  await page.keyboard.press('Space');
  await expect(row).toHaveAttribute('aria-pressed', 'true');
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Space');
  await expect(region.locator('[data-fixture="pagination-order"]')).toHaveText(
    [
      ...Array.from({ length: 10 }, (_, i) => String(i)),
      '11',
      '10',
      ...Array.from({ length: 9 }, (_, i) => String(i + 12)),
    ].join(',')
  );
  await region.locator('.ant-pagination-prev button').click();
  await expect(region.locator('tbody tr[data-row-key]')).toHaveCount(10);
  await expect(region.locator('tbody tr[data-row-key]').first()).toHaveAttribute(
    'data-row-key',
    '0'
  );
});
