import { expect, test } from './console-guard';
import { expectReadableInformationFields, expectNoDocumentOverflow } from './forced-wrap';

for (const width of [320, 768, 1440])
  for (const theme of ['light', 'dark']) {
    test(`紧凑详情字段标签与值分层，长字段占整行 ${width}px ${theme}`, async ({ page }) => {
      await page.setViewportSize({ width, height: 1000 });
      await page.goto(`/tests/ui/contract-fixture.html?theme=${theme}`);
      const detail = page.getByRole('region', { name: '详情信息' });
      await expect(detail).toContainText(
        'A complete English notification title with no crowded label'
      );
      await expectReadableInformationFields(page);
      await expectNoDocumentOverflow(page);
      if (width >= 768) {
        await expect
          .poll(
            async () => {
              const fields = await detail
                .locator('.ds-information-grid__group')
                .first()
                .locator('.ds-information-grid__field')
                .evaluateAll((items) =>
                  items.map((item) => {
                    const { x, y, width } = item.getBoundingClientRect();
                    return { x, y, width };
                  })
                );
              return (
                fields.length === 2 &&
                Math.abs(fields[0].y - fields[1].y) <= 1 &&
                Math.abs(fields[0].width - fields[1].width) <= 1
              );
            },
            { message: '少量相关字段也应均分可用宽度，不能第一项窄、末项吞掉余宽' }
          )
          .toBe(true);
        const overflowing = await detail
          .locator('dd')
          .evaluateAll((values) =>
            values
              .filter((value) => value.scrollWidth > value.clientWidth + 1)
              .map((value) => value.textContent)
          );
        expect(overflowing, '宽屏详情值应完整显示').toEqual([]);
      }
    });
  }

for (const width of [320, 1440]) {
  test(`详情长标签和值完整折行、无横滚或省略 ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 1000 });
    await page.goto('/tests/ui/contract-fixture.html?longFields');
    const detail = page.getByRole('region', { name: '长字段详情' });
    await expect(detail.locator('dd').first()).toHaveText('item-'.repeat(40));
    await expect(detail.locator('dt').first()).toHaveText(
      'Lifecycle limit and accumulated consumption'
    );
    await expectReadableInformationFields(page);
    await expectNoDocumentOverflow(page);
  });
}

for (const width of [320, 1440]) {
  test(`独立长元数据标签局部横滚且图标与关闭不移动 ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 1000 });
    await page.goto('/tests/ui/contract-fixture.html?longTags');
    const region = page.getByRole('region', { name: '长标签' });
    const tag = region.locator('.ds-status-tag').first();
    const slot = tag.locator('.ds-status-tag__content');
    await expect(slot).toHaveAttribute('data-overflowing', 'true');
    const icon = tag.locator('.anticon-copy');
    const close = tag.locator('.ant-tag-close-icon');
    const before = [await icon.boundingBox(), await close.boundingBox()];
    const result = await slot.evaluate((node) => {
      node.scrollLeft = node.scrollWidth;
      const range = document.createRange();
      range.selectNodeContents(node);
      return {
        left: node.scrollLeft,
        end: range.getBoundingClientRect().right,
        edge: node.getBoundingClientRect().right,
      };
    });
    expect(result.left).toBeGreaterThan(0);
    expect(result.end).toBeLessThanOrEqual(result.edge + 1);
    expect([await icon.boundingBox(), await close.boundingBox()]).toEqual(before);
    const short = region.locator('.ds-status-tag__content').last();
    expect(await short.evaluate((node) => node.scrollWidth <= node.clientWidth + 1)).toBe(true);
    await expectNoDocumentOverflow(page);
    await close.click();
    await expect(tag).toBeHidden();
  });
}

for (const width of [768, 1440]) {
  test(`详情短字段均衡分行、整行字段后置、标签在上 ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 1000 });
    await page.goto('/tests/ui/contract-fixture.html');
    const region = page.getByRole('region', { name: '均衡详情' });
    const grid = region.locator('.ds-information-grid');
    const children = await grid.evaluate((node) =>
      [...node.children].map((child) => child.getAttribute('data-span') ?? child.className)
    );
    expect(children).toEqual(['ds-information-grid__group', 'full']);
    const rows = await region
      .locator('.ds-information-grid__group > .ds-information-grid__field')
      .evaluateAll((fields) => {
        const tops = fields.map((field) => Math.round(field.getBoundingClientRect().top));
        return [...new Set(tops)].map((top) => tops.filter((value) => value === top).length);
      });
    const maxColumns = await grid.evaluate(
      (node) => getComputedStyle(node).gridTemplateColumns.split(' ').length
    );
    expect(rows).toEqual(
      maxColumns >= 4
        ? [3, 2]
        : maxColumns === 3
          ? [3, 2]
          : maxColumns === 2
            ? [2, 2, 1]
            : [1, 1, 1, 1, 1]
    );
    const email = region.locator('dd').filter({ hasText: 'user-a@example.com' });
    expect(
      await email.evaluate((node) => {
        const range = document.createRange();
        range.selectNodeContents(node);
        return new Set(
          [...range.getClientRects()]
            .filter((rect) => rect.width)
            .map((rect) => Math.round(rect.top))
        ).size;
      }),
      '宽度足够时短值不应被标签挤成多行'
    ).toBe(1);
    await expectReadableInformationFields(page);
    await expectNoDocumentOverflow(page);
  });
}
