import { expect, test } from './console-guard';

for (const width of [320, 1440]) {
  test(`通知淡入与淡出全过程不被水平裁切 ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/tests/ui/contract-fixture.html?notificationMotion');
    for (const action of ['显示通知', '关闭通知']) {
      const samples = await page.evaluate(async (label) => {
        const button = [...document.querySelectorAll<HTMLButtonElement>('button')].find(
          (node) => node.textContent === label
        );
        if (!button) throw new Error(`缺少动作 ${label}`);
        button.click();
        const hits: string[] = [];
        let visibleFrames = 0;
        const start = performance.now();
        await new Promise<void>((resolve) => {
          const sample = () => {
            const notice = document.querySelector<HTMLElement>('.ant-notification-notice');
            if (notice && notice.getClientRects().length > 0) visibleFrames += 1;
            for (const node of document.querySelectorAll<HTMLElement>(
              '.ant-notification, .ant-notification-list-content'
            )) {
              if (node.scrollWidth > node.clientWidth + 1)
                hits.push(`${node.className}:${node.scrollWidth}>${node.clientWidth}`);
            }
            if (performance.now() - start >= 700) resolve();
            else requestAnimationFrame(sample);
          };
          requestAnimationFrame(sample);
        });
        return { hits, visibleFrames };
      }, action);
      expect(samples.visibleFrames).toBeGreaterThan(0);
      expect(samples.hits).toEqual([]);
      if (action === '显示通知')
        await expect(page.getByRole('alert')).toContainText('Export succeeded');
      else await expect(page.getByRole('alert')).toHaveCount(0);
    }
  });
}
