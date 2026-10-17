import { expect, test } from './console-guard';
import { inspectViewportRegions } from './viewport-contract';
for (const theme of ['light', 'dark'])
  for (const width of [320, 768, 1440]) {
    test(`视口与局部滚动 ${theme} ${width}`, async ({ page }) => {
      await page.setViewportSize({ width, height: 600 });
      await page.goto(`/tests/ui/viewport-fixture.html?theme=${theme}`);
      const nav = page.getByRole('region', { name: '主导航' }),
        main = page.getByRole('region', { name: '主内容' });
      await expect(nav).toBeVisible();
      await expect(page.locator('html')).toHaveCSS('overflow-anchor', 'none');
      await expect(page.locator('body')).toHaveCSS('overflow-anchor', 'none');
      expect(await inspectViewportRegions(page)).toEqual([]);
      for (const area of [nav, main]) {
        await expect(area).toHaveCSS('overflow-anchor', 'none');
        const b = await area.boundingBox();
        if (!b) throw new Error('区域不可见');
        await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
        const position = () => area.evaluate((el) => el.scrollTop);
        const remaining = () =>
          area.evaluate((el) => el.scrollHeight - el.clientHeight - el.scrollTop);
        async function wheel(delta: number) {
          await page.mouse.wheel(0, delta);
          let previous = -1,
            stable = 0;
          await expect
            .poll(
              async () => {
                const next = await position();
                stable = next === previous ? stable + 1 : 0;
                previous = next;
                return stable;
              },
              { intervals: [50, 100, 100] }
            )
            .toBeGreaterThanOrEqual(2);
        }
        await wheel(500);
        expect(await position()).toBeGreaterThan(0);
        expect(await inspectViewportRegions(page)).toEqual([]);
        for (let i = 0; i < 40 && (await remaining()) > 2; i++) await wheel(500);
        expect(await remaining()).toBeLessThanOrEqual(2);
        await wheel(500);
        expect(await inspectViewportRegions(page)).toEqual([]);
        for (let i = 0; i < 40 && (await position()) > 0; i++) await wheel(-500);
        expect(await position()).toBe(0);
      }
    });
  }
test('反例拒绝根页面滚动及偏离侧栏底部的账号区', async ({ page }) => {
  await page.goto('/tests/ui/viewport-fixture.html?broken');
  await expect(page.getByRole('region', { name: '主导航' })).toBeVisible();
  expect((await inspectViewportRegions(page)).length).toBeGreaterThan(0);
});
