import { expect, test } from './console-guard';
import {
  expectNoDocumentOverflow,
  expectNoTruncatedQueryControls,
  expectNoStuckOverflows,
} from './forced-wrap';

for (const language of ['zh-CN', 'en-US'])
  for (const width of [320, 1440]) {
    test(`筛选选型、两项实体多选、清空与显式查询 ${language} ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 1000 });
      await page.goto(`/tests/ui/contract-fixture.html?filterSelection&lang=${language}`);
      const query = page.locator('.ds-query-form');
      const zh = language === 'zh-CN';
      const pick = async (label: string, options: string[]) => {
        const input = query.getByLabel(label, { exact: true });
        await input.click();
        for (const value of options)
          await page
            .locator('.ant-select-dropdown:visible')
            .getByText(value, { exact: true })
            .click();
        await input.press('Escape');
        await expect(page.locator('.ant-select-dropdown:visible')).toHaveCount(0);
      };
      await pick(zh ? '用户' : 'User', [
        'Lin',
        'Chen',
        'Very long user name · feedback-demo-with-a-long-identifier@example.invalid',
      ]);
      await pick(zh ? '分类' : 'Category', ['One', 'Two']);
      await pick(zh ? '启用' : 'Enabled', ['No']);
      await expect(page.getByTestId('submitted')).toHaveText('pending');
      await query.getByRole('button', { name: zh ? /查询$/ : /Query$/ }).click();
      await expect(page.getByTestId('submitted')).toHaveText(
        JSON.stringify({
          users: ['lin', 'chen', 'long'],
          categories: ['one', 'two'],
          enabled: 'false',
        })
      );
      await expectNoTruncatedQueryControls(page);
      await expectNoDocumentOverflow(page);
      await expectNoStuckOverflows(page);
      for (const select of await query.locator('.ant-select').all()) {
        await select.hover();
        await select.locator('.ant-select-clear').click();
      }
      await query.getByRole('button', { name: zh ? /查询$/ : /Query$/ }).click();
      await expect(page.getByTestId('submitted')).toHaveText(
        JSON.stringify({ users: [], categories: [] })
      );
    });
  }

test('远程筛选失败可重试，搜索保留已选名称', async ({ page }) => {
  await page.goto('/tests/ui/contract-fixture.html?filterSelection&filterFailure&lang=zh-CN');
  const input = page.getByLabel('用户', { exact: true });
  await input.click();
  await page.locator('.ant-select-dropdown:visible').getByRole('button', { name: /重试/ }).click();
  await page.locator('.ant-select-dropdown:visible').getByText('Lin', { exact: true }).click();
  await input.fill('chen');
  await expect(page.locator('.ant-select-dropdown:visible')).toContainText('Chen');
  await expect(page.locator('.ant-select-selection-item').filter({ hasText: 'Lin' })).toHaveCount(
    1
  );
});

test('远程筛选旧响应不能覆盖当前候选及已选标签', async ({ page }) => {
  await page.goto('/tests/ui/contract-fixture.html?filterSelection&filterRace&lang=en-US');
  const input = page.getByLabel('User', { exact: true });
  await input.click();
  await page.locator('.ant-select-dropdown:visible').getByText('Lin', { exact: true }).click();
  await input.fill('old');
  await expect(page.getByRole('button', { name: 'Finish old', exact: true })).toBeEnabled();
  await input.fill('new');
  // 通过控件的候选加载状态等待防抖请求进入，不依赖固定睡眠。
  await expect(page.getByRole('button', { name: 'Finish new', exact: true })).toBeEnabled();
  await input.press('Escape');
  await expect(page.locator('.ant-select-dropdown:visible')).toHaveCount(0);
  await page.getByRole('button', { name: 'Finish new', exact: true }).click();
  await expect(page.locator('.ant-select-selection-item')).toContainText('New name');
  await page.getByRole('button', { name: 'Finish old', exact: true }).click();
  await expect(page.getByTestId('completed')).toHaveText('old');
  await expect(page.locator('.ant-select-selection-item')).toContainText('New name');
});

test('候选请求期间新增选择，返回后仍保留当前已选名称', async ({ page }) => {
  await page.goto('/tests/ui/contract-fixture.html?filterSelection&filterRace&lang=en-US');
  const input = page.getByLabel('User', { exact: true });
  await input.click();
  await page
    .locator('.ant-select-dropdown:visible')
    .getByText('Lin', { exact: true })
    .waitFor({ state: 'visible' });
  await input.fill('selection');
  await expect(page.getByRole('button', { name: 'Finish selection', exact: true })).toBeEnabled();
  // 原关键词候选在新请求期间不可继续选择；外部受控表单更新仍是合法的当前选择来源。
  await expect(
    page
      .locator('.ant-select-dropdown:visible .ant-select-item-option-content')
      .filter({ hasText: /^Lin$/ })
  ).toHaveCount(0);
  await input.press('Escape');
  await expect(page.locator('.ant-select-dropdown:visible')).toHaveCount(0);
  await page.getByRole('button', { name: 'Select Lin', exact: true }).click();
  await page.getByRole('button', { name: 'Finish selection', exact: true }).click();
  await expect(page.getByTestId('completed')).toHaveText('selection');
  await expect(page.locator('.ant-select-selection-item')).toContainText('Lin');
});
