import { expect, test } from './console-guard';
import { waitForNativeOverlayReady } from './native-overlay';

for (const width of [320, 1440]) {
  for (const kind of ['弹窗', '抽屉']) {
    test(`${kind}表单收尾操作在所属页脚右侧 ${width}`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.goto('/tests/ui/contract-fixture.html?actionFooter');
      await page.getByRole('button', { name: `打开${kind}表单` }).click();
      const overlay = page.locator(kind === '弹窗' ? '.ant-modal:visible' : '.ant-drawer:visible');
      await waitForNativeOverlayReady(overlay);
      await overlay.getByLabel('草稿').fill('已修改草稿');
      const footer = overlay.locator(
        kind === '弹窗' ? '.ant-modal-footer' : '.ds-drawer-form-footer'
      );
      await expect(footer.getByRole('button')).toHaveCount(2);
      await expect(footer.locator('.ds-responsive-actions')).toHaveAttribute('data-justify', 'end');
      await expect
        .poll(() =>
          footer.evaluate((node) => {
            const buttons = node.querySelectorAll('button');
            const last = buttons[buttons.length - 1];
            const padding = parseFloat(getComputedStyle(node).paddingRight);
            return Math.abs(
              node.getBoundingClientRect().right - padding - last.getBoundingClientRect().right
            );
          })
        )
        .toBeLessThanOrEqual(1);
      await expect(footer.getByRole('button').first()).toHaveText(/取消|Cancel/);
    });
  }
}

// 干净编辑态不渲染页脚动作：退出由容器头部 × 承担（查询/导出等非编辑弹窗保留取消配对）
test('抽屉表单干净态无页脚动作，退出由头部 × 承担', async ({ page }) => {
  await page.goto('/tests/ui/contract-fixture.html?actionFooter');
  await page.getByRole('button', { name: '打开抽屉表单' }).click();
  const drawer = page.locator('.ant-drawer:visible');
  await waitForNativeOverlayReady(drawer);
  await expect(drawer.locator('.ds-drawer-form-footer').getByRole('button')).toHaveCount(0);
  await drawer.locator('.ant-drawer-close').click();
  await expect(drawer).toHaveCount(0);
});

for (const kind of ['弹窗', '抽屉']) {
  test(`${kind}挂载恢复非空初始值，取消重开丢弃草稿`, async ({ page }) => {
    await page.goto('/tests/ui/contract-fixture.html?formSubmit');
    const fixture = page.getByRole('region', { name: '表单提交契约' });
    await fixture.getByRole('button', { name: `打开${kind}表单` }).click();
    const overlay = page.locator(kind === '弹窗' ? '.ant-modal:visible' : '.ant-drawer:visible');
    await expect(overlay.getByLabel('会话草稿')).toHaveValue('初始内容');
    await expect(fixture).toHaveAttribute(
      'data-effect-mounts',
      process.env.FRONTEND_UI_DEV === '1' ? '2' : '1'
    );
    await expect(overlay.getByText('reference-key', { exact: true })).toBeVisible();
    await expect(overlay.getByLabel('排序')).toHaveValue('7');
    await expect(overlay.getByRole('switch', { name: '启用标志' })).toBeChecked();
    await overlay.getByLabel('会话草稿').fill('未保存的草稿');
    await overlay.getByLabel('排序').fill('9');
    await overlay.getByRole('switch', { name: '启用标志' }).click();
    await overlay.getByRole('button', { name: /取消|Cancel/ }).click();
    await expect(overlay).toHaveCount(0);
    await fixture.getByRole('button', { name: `打开${kind}表单` }).click();
    await expect(overlay.getByLabel('会话草稿')).toHaveValue('初始内容');
    await expect(fixture).toHaveAttribute(
      'data-effect-mounts',
      process.env.FRONTEND_UI_DEV === '1' ? '2' : '1'
    );
    await expect(overlay.getByText('reference-key', { exact: true })).toBeVisible();
    await expect(overlay.getByLabel('排序')).toHaveValue('7');
    await expect(overlay.getByRole('switch', { name: '启用标志' })).toBeChecked();
  });
}
