import { expect, test } from './console-guard';

for (const width of [320, 1440]) {
  test(`真实图表隐藏重叠标签，堆叠条形保留图例 ${width}`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/tests/ui/contract-fixture.html?chartLegend');
    await expect(page.locator('canvas')).toHaveCount(3);
    await expect
      .poll(async () => {
        await page.getByRole('button', { name: '检查图表' }).click();
        return JSON.parse(await page.locator('output').innerText());
      })
      .toEqual({
        visibleLabels: 1,
        seriesCount: 1,
        legendType: 'scroll',
        legendNames: ['model-a', 'model-b'],
        distinctColors: 2,
      });
    // 图例与条形是同一实例真实画出的内容，不依赖截图 OCR。
    const colors = await page
      .locator('canvas')
      .first()
      .evaluate((canvas) => {
        const context = canvas.getContext('2d')!;
        const { data } = context.getImageData(
          0,
          0,
          canvas.width,
          Math.round(28 * (canvas.width / canvas.clientWidth))
        );
        const counts = new Map<string, number>();
        for (let i = 0; i < data.length; i += 4) {
          if (
            data[i + 3] > 240 &&
            Math.max(data[i], data[i + 1], data[i + 2]) -
              Math.min(data[i], data[i + 1], data[i + 2]) >
              40
          ) {
            const key = `${data[i]},${data[i + 1]},${data[i + 2]}`;
            counts.set(key, (counts.get(key) ?? 0) + 1);
          }
        }
        return [...counts.values()].filter((count) => count >= 10).length;
      });
    expect(colors, '顶部图例必须实际画出两种系列色').toBeGreaterThanOrEqual(2);
  });
}
