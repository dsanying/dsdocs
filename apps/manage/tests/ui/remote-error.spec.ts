import { test, expect } from './console-guard';
for (const name of ['远程单选候选', '远程输入候选'])
  test(`${name}读取失败原位提示、可重试且无通知`, async ({ page }) => {
    await page.goto('/tests/ui/contract-fixture.html?selectCandidates&remoteFailure');
    const control = page.getByRole('combobox', { name });
    const field = control.locator(
      "xpath=ancestor::*[contains(concat(' ', normalize-space(@class), ' '), ' ant-form-item ')][1]"
    );
    await expect(field).toContainText('候选读取失败');
    await field.getByRole('button', { name: /重试|Retry/ }).click();
    await expect(field).not.toContainText('候选读取失败');
    await control.click();
    await expect(
      page
        .locator('.ant-select-dropdown:visible .ant-select-item-option')
        .filter({ hasText: /^短候选 Short candidate$/ })
    ).toBeVisible();
    await expect(page.locator('.ant-notification-notice,.ant-message-notice')).toHaveCount(0);
  });
