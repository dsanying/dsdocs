import { expect, test } from './console-guard';
import { waitForNativeOverlayReady } from './native-overlay';

for (const width of [320, 1440]) {
  test(`原生弹窗入场完成后按最终位置交互 ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/tests/ui/contract-fixture.html');
    await page.evaluate(() => {
      const state = window as Window & { nativeMotionEvents: number };
      state.nativeMotionEvents = 0;
      const record = (event: Event) => {
        if (event.target instanceof Element && event.target.closest('.ant-modal'))
          state.nativeMotionEvents += 1;
      };
      document.addEventListener('animationstart', record, true);
      document.addEventListener('transitionrun', record, true);
    });
    await page
      .getByRole('region', { name: '确认按钮契约' })
      .getByRole('button', { name: '打开弹窗' })
      .click();
    const modal = page.getByRole('dialog');
    await waitForNativeOverlayReady(modal);
    expect(
      await page.evaluate(
        () => (window as Window & { nativeMotionEvents: number }).nativeMotionEvents
      )
    ).toBeGreaterThan(0);
    await modal.getByRole('button', { name: /OK|确定|确 定/ }).click();
    await expect(modal).toBeHidden();
  });
}
