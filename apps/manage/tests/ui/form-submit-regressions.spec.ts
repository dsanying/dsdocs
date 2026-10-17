import { expect, test } from './console-guard';
import { waitForNativeOverlayReady } from './native-overlay';

for (const kind of ['抽屉', '弹窗']) {
  test(`${kind}表单提交中禁止关闭复用，阻止重复提交并允许下一次编辑`, async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem('dsdocs-lang', 'zh-CN'));
    await page.goto('/tests/ui/contract-fixture.html?formSubmit');
    const fixture = page.getByRole('region', { name: '表单提交契约' });
    await fixture.getByRole('button', { name: `打开${kind}表单` }).click();
    const container = page.locator(kind === '抽屉' ? '.ant-drawer:visible' : '.ant-modal:visible');
    await expect(container.getByLabel('会话草稿')).toHaveValue('初始内容');
    await container.getByLabel('会话草稿').fill('草稿 A');
    await container.getByRole('button', { name: kind === '抽屉' ? /保\s?存/ : /查询/ }).click();
    await expect(fixture.getByLabel('表单请求数')).toHaveText('1');
    await expect(container.getByRole('button', { name: /取消/ })).toBeDisabled();
    await page.keyboard.press('Escape');
    await expect(container.getByRole('button', { name: 'Close', exact: true })).toHaveCount(0);
    await expect(container).toBeVisible();
    await container.getByLabel('会话草稿').press('Enter');
    await expect(fixture.getByLabel('表单请求数')).toHaveText('1');
    // 完成按钮在容器外，程序化触发仅控制异步请求，关闭行为由真实点击与键盘触发。
    await fixture
      .getByRole('button', { name: '完成表单请求' })
      .evaluate((button: HTMLButtonElement) => button.click());
    await expect(container).toHaveCount(0);
    await fixture.getByRole('button', { name: `打开${kind}表单` }).click();
    await expect(container.getByLabel('会话草稿')).toHaveValue('初始内容');
    await container.getByLabel('会话草稿').fill('草稿 B');
    await container.getByRole('button', { name: /取消/ }).click();
    await expect(container).toHaveCount(0);
  });
}

test('抽屉内负 tabindex 容器不阻断长字段的 Tab 与方向键滚动', async ({ page }) => {
  await page.goto('/tests/ui/contract-fixture.html?formSubmit');
  await page.getByRole('button', { name: '打开抽屉表单' }).click();
  const drawer = page.locator('.ant-drawer:visible');
  await waitForNativeOverlayReady(drawer);
  const field = drawer.locator('.ds-atomic-value').filter({ hasText: '完整的长字段' });
  await expect(field).toHaveAttribute('tabindex', '0');
  await drawer.getByLabel('会话草稿').focus();
  await page.keyboard.press('Tab');
  await expect(field).toBeFocused();
  await page.keyboard.press('ArrowRight');
  await expect.poll(() => field.evaluate((node) => node.scrollLeft)).toBeGreaterThan(0);
});
