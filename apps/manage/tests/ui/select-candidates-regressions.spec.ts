import { expect, test } from './console-guard';
import { waitForNativeOverlayReady } from './native-overlay';

for (const width of [320, 1440])
  for (const theme of ['light', 'dark']) {
    test(`候选弹层有界且长项独立横滚 ${width}px ${theme}`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.goto(`/tests/ui/contract-fixture.html?selectCandidates&theme=${theme}`);
      for (const label of ['静态候选', '远程筛选候选', '远程单选候选', '远程输入候选']) {
        const control = page.getByLabel(label, { exact: true });
        await expect(control).toBeVisible();
        const field = await control
          .locator(
            "xpath=ancestor::*[contains(concat(' ',normalize-space(@class),' '),' ant-select ')][1]"
          )
          .boundingBox();
        expect(field!.width).toBeGreaterThan(0);
        expect(field!.width).toBeLessThanOrEqual(width);
        await control.click();
        await expect(control).toHaveAttribute('aria-expanded', 'true');
        const listId = await control.getAttribute('aria-controls');
        expect(listId).not.toBeNull();
        // 上一个弹层退出动画仍可见时，按当前控件拥有的 listbox 精确定位，避免误读其它候选。
        const popup = page
          .locator('.ant-select-dropdown')
          .filter({ has: page.locator(`[id="${listId}"]`) });
        await expect(popup.getByText('短候选 Short candidate', { exact: true })).toBeVisible();
        await expect(popup.getByText('其他候选 Other candidate', { exact: true })).toBeVisible();
        // 几何断言针对完成原生入场的弹层；prepare 阶段会临时缩放，不能当作滚动引发的位移。
        await waitForNativeOverlayReady(popup);
        const bounds = await popup.boundingBox();
        expect(bounds).not.toBeNull();
        expect(bounds!.x).toBeGreaterThanOrEqual(0);
        expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(width);
        expect(bounds!.y).toBeGreaterThanOrEqual(0);
        expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(900);
        const before = await popup
          .getByText('其他候选 Other candidate', { exact: true })
          .boundingBox();
        const candidate = popup
          .locator('.ant-select-item-option-content')
          .filter({ hasText: /^long-candidate-/ });
        await candidate.hover();
        await page.mouse.wheel(600, 0);
        await expect.poll(() => candidate.evaluate((node) => node.scrollLeft)).toBeGreaterThan(0);
        await page.mouse.wheel(-600, 0);
        await expect.poll(() => candidate.evaluate((node) => node.scrollLeft)).toBe(0);
        await page.keyboard.down('Shift');
        await page.mouse.wheel(0, 400);
        await page.keyboard.up('Shift');
        await expect.poll(() => candidate.evaluate((node) => node.scrollLeft)).toBeGreaterThan(0);
        await expect(control).toHaveAttribute('aria-expanded', 'true');
        const thumb = popup.locator(
          '.ant-select-dropdown-list-scrollbar-vertical .ant-select-dropdown-list-scrollbar-thumb'
        );
        await expect(thumb).toBeVisible();
        expect((await thumb.boundingBox())!.width).toBe(2);
        const colors = await thumb.evaluate((node) => {
          const probe = document.createElement('span');
          probe.style.color = 'var(--ds-color-border-strong)';
          document.body.append(probe);
          const expected = getComputedStyle(probe).color;
          probe.remove();
          return { actual: getComputedStyle(node).backgroundColor, expected };
        });
        expect(colors.actual).toBe(colors.expected);
        const scroll = await popup
          .locator('.ant-select-item-option-content')
          .filter({ hasText: /^long-candidate-/ })
          .evaluate((node) => {
            const overflowing = node.scrollWidth > node.clientWidth + 1;
            node.scrollLeft = node.scrollWidth;
            const range = document.createRange();
            range.selectNodeContents(node);
            return {
              overflowing,
              scrollLeft: node.scrollLeft,
              end: range.getBoundingClientRect().right,
              edge: node.getBoundingClientRect().right,
            };
          });
        expect(scroll.overflowing).toBe(true);
        expect(scroll.scrollLeft).toBeGreaterThan(0);
        expect(scroll.end).toBeLessThanOrEqual(scroll.edge + 1);
        const after = await popup
          .getByText('其他候选 Other candidate', { exact: true })
          .boundingBox();
        expect(after!.x).toBe(before!.x);
        // 普通纵向滚轮仍浏览候选；细滑块也必须能真实拖动，不能只改样式。
        const holder = popup.locator('.ant-select-dropdown-list-holder');
        await candidate.hover();
        await page.mouse.wheel(0, 120);
        await expect.poll(() => holder.evaluate((node) => node.scrollTop)).toBeGreaterThan(0);
        const thumbBox = (await thumb.boundingBox())!;
        const verticalBefore = await holder.evaluate((node) => node.scrollTop);
        await page.mouse.move(thumbBox.x + thumbBox.width / 2, thumbBox.y + thumbBox.height / 2);
        await page.mouse.down();
        await page.mouse.move(
          thumbBox.x + thumbBox.width / 2,
          thumbBox.y + thumbBox.height / 2 - 50,
          { steps: 5 }
        );
        await page.mouse.up();
        await expect
          .poll(() => holder.evaluate((node) => node.scrollTop))
          .toBeLessThan(verticalBefore);
        await page.getByLabel(label, { exact: true }).press('Escape');
      }
    });
  }

test('候选不是跨作用域缓存；防抖期间旧响应失效，已选名称仅在当前作用域保留', async ({ page }) => {
  await page.goto('/tests/ui/contract-fixture.html?selectCandidates');
  const options = page.getByLabel('当前候选');
  const reads = page.getByLabel('候选读取记录');
  const input = page.getByLabel('候选关键词');
  await expect(options).toContainText('A:initial');
  await page.getByRole('button', { name: '保留已选实体' }).click();
  await input.fill('slow');
  await expect(reads).toContainText('A:slow');
  await input.fill('latest');
  await page.getByRole('button', { name: '释放待完成响应' }).click();
  await expect(options).not.toContainText('A:slow');
  await expect(options).toContainText('A:latest');
  await input.fill('');
  await expect(options).toContainText('A:initial');
  await page.getByRole('button', { name: '切换作用域' }).click();
  await expect(reads).toContainText('B:');
  await expect(options).not.toContainText('A:initial');
  await expect(options).toContainText('fallback');
  await page.getByRole('button', { name: '释放待完成响应' }).click();
  await expect(options).toContainText('B:initial');
  const before = await reads.textContent();
  await page.getByRole('button', { name: '刷新相同加载器作用域' }).click();
  await expect(reads).not.toHaveText(before!);
  await expect(options).not.toContainText('B:initial');
  await expect(options).toContainText('fallback');
  await page.getByRole('button', { name: '释放待完成响应' }).click();
  await expect(options).toContainText('B:initial');
});

test('选中或关闭后搜索框清空，候选回到未过滤结果；单个超长已选标签不多占一行', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/tests/ui/contract-fixture.html?selectCandidates');
  const region = page.getByRole('region', { name: '关键词远程筛选' });
  const select = region.locator('.ant-select');
  const singleLine = await select.evaluate((node) => node.getBoundingClientRect().height);
  const popup = page.locator('.ant-select-dropdown:not(.ant-select-dropdown-hidden)');
  await select.click();
  await page.keyboard.type('long-candidate');
  await expect(popup.locator('.ant-select-item-option')).toHaveCount(1);
  await popup.locator('.ant-select-item-option').first().click();
  await expect(select.locator('input')).toHaveValue('');
  await expect(popup.locator('.ant-select-item-option').first(), {
    message: '搜索框已清空，候选不能停在旧关键词结果',
  }).toContainText('短候选 Short candidate');
  await page.keyboard.press('Escape');
  await expect
    .poll(() => select.evaluate((node) => node.getBoundingClientRect().height), {
      message: '超长已选标签与搜索输入同一行',
    })
    .toBeLessThanOrEqual(singleLine + 1);
  await select.click();
  await page.keyboard.type('候选 1');
  await expect(popup.locator('.ant-select-item-option').first()).toHaveText('候选 1');
  await page.keyboard.press('Escape');
  await page.getByRole('heading', { name: '长候选与请求作用域' }).click();
  await select.click();
  await expect(select.locator('input')).toHaveValue('');
  await expect(popup.locator('.ant-select-item-option').first(), {
    message: '失焦后重开，候选不能沿用旧关键词',
  }).toContainText('短候选 Short candidate');
});
