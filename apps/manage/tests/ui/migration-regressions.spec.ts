import { test, expect, type Page } from './console-guard';
import { waitForNativeOverlayReady } from './native-overlay';
import {
  expectReadableInformationFields,
  collectUnreadableText,
  expectNoStuckOverflows,
  expectReadableText,
} from './forced-wrap';
const fixture = '/tests/ui/contract-fixture.html?catalog';
const longIdentifier = 'item-production-' + '0123456789abcdef'.repeat(4);
for (const theme of ['light', 'dark'] as const) {
  test(theme + ' 共享链接、表单、状态、汇总和保存条在窄屏保持同一契约', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 900 });
    await page.goto(fixture + '&theme=' + theme + '&lang=zh-CN');
    await expect(page.getByRole('cell', { name: '合计', exact: true })).toBeVisible();
    await expect(page.locator('.ant-segmented-item-disabled input')).toBeDisabled();
    await expectNoStuckOverflows(page);
    await expectReadableText(page);
    await expect(page.locator('[data-kind="save-bar"]')).toBeVisible();
    await page.getByRole('button', { name: /保存/ }).click();
    await expect(page.locator('[data-kind="save-bar"]')).toHaveCount(0);
  });
}
test('干净编辑不提供保存条动作，保存中禁止取消，默认动作不固定', async ({ page }) => {
  await page.goto(fixture + '&lang=zh-CN&clean');
  // 干净态的退出由所在容器的返回/关闭承担，页面不重复提供关闭按钮。
  await expect(page.locator('[data-kind="save-bar"]')).toHaveCount(0);
  await expect(page.getByRole('button', { name: '关闭', exact: true })).toHaveCount(0);
  await page.goto(fixture + '&lang=zh-CN&saving');
  await expect(page.getByRole('button', { name: '取消', exact: true })).toBeDisabled();
  await expect(page.getByRole('button', { name: '保存', exact: true })).toBeDisabled();
  const actions = page.locator('[data-kind="save-bar"]');
  await expect(actions).toHaveCSS('position', 'static');
  expect(await actions.locator("xpath=ancestor::*[@data-layout='page-footer-slot']").count()).toBe(
    0
  );
});

test('对比度仅排除真实禁用 segmented，伪造禁用类与普通浅色文字仍失败', async ({ page }) => {
  await page.goto(fixture + '&lang=zh-CN');
  await page.evaluate(() => {
    const item = document.querySelector<HTMLElement>('.ant-segmented-item-disabled')!;
    const disabledText = item.querySelector<HTMLElement>('.ds-view-switch__label')!;
    disabledText.style.color = 'rgb(170,170,170)';
    disabledText.style.backgroundColor = 'rgb(255,255,255)';
    const clone = item.cloneNode(true) as HTMLElement;
    clone.querySelector('input')!.disabled = false;
    clone.removeAttribute('aria-disabled');
    clone.querySelectorAll('[aria-disabled]').forEach((e) => e.removeAttribute('aria-disabled'));
    clone.querySelector<HTMLElement>('.ds-view-switch__label')!.textContent = '伪造禁用';
    item.parentElement!.append(clone);
    const ordinary = document.createElement('span');
    ordinary.textContent = '普通文字';
    ordinary.style.cssText = 'color:rgb(130,130,130);background:rgb(255,255,255);font-size:16px';
    document.body.append(ordinary);
  });
  const issues = await collectUnreadableText(page);
  expect(issues.some((e) => e.text.includes('暂不可用'))).toBe(false);
  expect(issues.some((e) => e.text.includes('伪造禁用'))).toBe(true);
  expect(issues.some((e) => e.text.includes('普通文字'))).toBe(true);
});

test('业务前置条件未满足时禁用保存，仍可取消全部编辑', async ({ page }) => {
  await page.goto(fixture + '&lang=zh-CN&disabled');
  await expect(page.getByRole('button', { name: /保存/ })).toBeDisabled();
  await expect(page.getByRole('button', { name: /取消/ })).toBeEnabled();
  await page.getByRole('button', { name: /取消/ }).click();
  await expect(page.locator('[data-kind="save-bar"]')).toHaveCount(0);
});

test('原生日期范围输入必须实际可滚，普通 clip 盒仍被识别为裁切', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 900 });
  await page.goto(fixture + '&lang=zh-CN');
  const inputs = page.locator('.ant-picker-range input');
  await expect(inputs).toHaveCount(2);
  for (const input of await inputs.all()) {
    await input.focus();
    await input.press('End');
    const result = await input.evaluate((el: HTMLInputElement) => {
      const before = el.scrollLeft;
      el.scrollLeft = el.scrollWidth;
      const moved = el.scrollLeft;
      el.scrollLeft = before;
      return { width: el.clientWidth, scrollWidth: el.scrollWidth, moved };
    });
    expect(result.scrollWidth > result.width ? result.moved > 0 : true).toBe(true);
  }
  await expectNoStuckOverflows(page);
  await page.evaluate(() => {
    const box = document.createElement('div');
    box.className = 'test-clipped-regression';
    box.style.cssText = 'width:100px;overflow-x:clip;white-space:nowrap';
    box.textContent = 'long-identifier-'.repeat(20);
    document.body.append(box);
  });
  const { collectStuckOverflows } = await import('./forced-wrap');
  expect(
    (await collectStuckOverflows(page)).some((issue) => issue.includes('test-clipped-regression'))
  ).toBe(true);
});

test('MultiSelect 保持数值候选与回调类型，弹窗仍只有即时选择', async ({ page }) => {
  await page.goto(fixture + '&lang=zh-CN');
  await page.locator('.ds-multi-select__inline').dblclick();
  await expect(page.getByRole('dialog')).toBeVisible();
  await waitForNativeOverlayReady(page.getByRole('dialog'));
  await page.locator('.ds-multi-select__full').click();
  // 行内控件残留的隐藏下拉里也有同名候选，只点可见弹层中的那项
  await page
    .locator(
      '.ant-select-dropdown:not(.ant-select-dropdown-hidden) .ant-select-item-option-content'
    )
    .filter({ hasText: '上海' })
    .click();
  await expect(page.getByLabel('选择值类型', { exact: true })).toHaveText('number');
  await expect(page.getByRole('dialog').getByRole('button', { name: /确定|保存/ })).toHaveCount(0);
});

for (const auxiliary of ['expand', 'select', 'both']) {
  test('Ant ' + auxiliary + ' 辅助列不挤占短内容数据列', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 900 });
    await page.goto(fixture + '&lang=zh-CN&auxiliary=' + auxiliary);
    const { expectNoCellOverflows } = await import('./forced-wrap');
    await expectNoCellOverflows(page);
    const host = page.locator('.ds-table__host').last();
    expect(
      await host.evaluate((el) => Number((el as HTMLElement).dataset.auxiliaryWidth))
    ).toBeGreaterThan(0);
    await expect(
      host.getByRole('cell', { name: 'student@example.com', exact: true })
    ).toBeVisible();
  });
}

for (const height of [320, 480]) {
  test('受控Modal ' + height + 'px高视口只滚正文且页脚可达', async ({ page }) => {
    await page.setViewportSize({ width: 768, height });
    await page.goto(fixture + '&lang=zh-CN&modalViewport');
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    const box = await dialog.boundingBox();
    expect(box!.y).toBeGreaterThanOrEqual(0);
    expect(box!.y + box!.height).toBeLessThanOrEqual(height);
    expect(
      await dialog.locator('.ant-modal-body').evaluate((el) => {
        el.scrollTop = 100;
        return el.scrollTop;
      })
    ).toBeGreaterThan(0);
    const footer = await dialog.locator('.ant-modal-footer').boundingBox();
    expect(footer!.y + footer!.height).toBeLessThanOrEqual(height);
  });
}

type BarListHit = {
  chartID: string;
  mode: string;
  version: number;
  points: Array<{ category: string; index: number; x: number; y: number }>;
};

async function locateBarList(page: Page): Promise<BarListHit> {
  await page.getByRole('button', { name: '读取命中坐标', exact: true }).click();
  const output = page.getByLabel('BarList 命中坐标', { exact: true });
  await expect(output).not.toHaveText('null');
  return JSON.parse(await output.innerText()) as BarListHit;
}

async function clickBarList(page: Page, index: number, expectedCanvasClicks: number) {
  const hit = await locateBarList(page);
  const point = hit.points[index];
  expect(point.index).toBe(index);
  const canvas = page.locator('[data-fixture="bar-list"] canvas').first();
  await expect(canvas).toBeVisible();
  const box = (await canvas.boundingBox())!;
  expect(point.x).toBeGreaterThan(box.x);
  expect(point.x).toBeLessThan(box.x + box.width);
  expect(point.y).toBeGreaterThan(box.y);
  expect(point.y).toBeLessThan(box.y + box.height);
  // 不 dispatchAction，不调用 fixture 的 onSelect；事件来自真实 canvas 鼠标命中。
  await page.mouse.click(point.x, point.y);
  await expect(page.getByLabel('BarList 画布点击次数', { exact: true })).toHaveText(
    String(expectedCanvasClicks)
  );
  return hit;
}

test('BarList 真画布点击返回业务原索引，主题与数据更新不重复注册', async ({ page }) => {
  await page.setViewportSize({ width: 768, height: 1000 });
  await page.goto('/tests/ui/contract-fixture.html?barList&theme=light&lang=zh-CN');
  const selections = page.getByLabel('BarList 业务选择', { exact: true });
  const expected: Array<{ category: string; index: number; version: number }> = [];
  let canvasClicks = 0;
  const choose = async (category: string, index: number, version: number) => {
    const hit = await clickBarList(page, index, ++canvasClicks);
    expect(hit.points[index].category).toBe(category);
    expect(hit.version).toBe(version);
    expected.push({ category, index, version });
    await expect(selections).toHaveText(JSON.stringify(expected));
    return hit;
  };
  const initial = await choose('Alpha', 0, 0);
  await choose('Gamma', 2, 0);
  await choose('Beta', 1, 0);
  await page.getByRole('button', { name: '切换图表主题', exact: true }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  const dark = await choose('Beta', 1, 0);
  expect(dark.chartID).not.toBe(initial.chartID);
  await page.getByRole('button', { name: '更新图表数据', exact: true }).click();
  const updated = await choose('Eta', 3, 1);
  expect(updated.chartID).toBe(dark.chartID);
  expect(updated.points).toHaveLength(4);
  await choose('Delta', 0, 1);
  await choose('Zeta', 2, 1);
  await choose('Epsilon', 1, 1);
  await page.getByRole('button', { name: '切换图表主题', exact: true }).click();
  const light = await choose('Delta', 0, 1);
  expect(light.mode).toBe('light');
  expect(light.chartID).not.toBe(dark.chartID);
  await choose('Eta', 3, 1);
  await page.getByRole('button', { name: '切换选择回调', exact: true }).click();
  await expect(page.getByLabel('BarList 回调启用', { exact: true })).toHaveText('false');
  await clickBarList(page, 1, ++canvasClicks);
  await expect(selections).toHaveText(JSON.stringify(expected));
  await page.getByRole('button', { name: '更新图表数据', exact: true }).click();
  await clickBarList(page, 2, ++canvasClicks);
  await page.getByRole('button', { name: '切换图表主题', exact: true }).click();
  await clickBarList(page, 0, ++canvasClicks);
  await expect(selections).toHaveText(JSON.stringify(expected));
  await page.getByRole('button', { name: '切换选择回调', exact: true }).click();
  await choose('Beta', 1, 2);
});

test('BarList 无 callback 的画布点击不产生业务选择副作用', async ({ page }) => {
  await page.setViewportSize({ width: 768, height: 1000 });
  await page.goto('/tests/ui/contract-fixture.html?barList&readonly&theme=light&lang=zh-CN');
  const selections = page.getByLabel('BarList 业务选择', { exact: true });
  await expect(page.getByLabel('BarList 回调启用', { exact: true })).toHaveText('false');
  await clickBarList(page, 2, 1);
  await page.getByRole('button', { name: '更新图表数据', exact: true }).click();
  await clickBarList(page, 3, 2);
  await page.getByRole('button', { name: '切换图表主题', exact: true }).click();
  await clickBarList(page, 0, 3);
  await expect(selections).toHaveText('[]');
});

test('详情抽屉公开真实动画完成生命周期，关闭后再清理业务选择', async ({ page }) => {
  await page.goto('/tests/ui/contract-fixture.html?drawerLifecycle&lang=zh-CN');
  const trigger = page.getByRole('button', { name: '查看详情' });
  await trigger.click();
  const drawer = page.getByRole('dialog', { name: '记录详情' });
  await expect(drawer).toBeVisible();
  await expect(page.locator('[data-fixture="drawer-events"]')).toContainText(
    'after-open:true:record-123'
  );
  await expect(drawer.getByText('record-123', { exact: true })).toBeVisible();
  const atomic = drawer.getByLabel('抽屉原子长值').locator('.ds-atomic-value');
  await expect(atomic).toHaveAttribute('tabindex', '0');
  await page.keyboard.press('Tab');
  await page.keyboard.press('Tab');
  await expect(atomic).toBeFocused();
  await atomic.press('ArrowRight');
  await expect.poll(() => atomic.evaluate((el) => el.scrollLeft)).toBeGreaterThan(0);
  // 真实库焦点锁：从最后控件 Tab 不能进入浏览器 chrome/body，反向同样循环。
  for (const key of ['Tab', 'Tab', 'Shift+Tab', 'Tab', 'Shift+Tab']) {
    await page.keyboard.press(key);
    expect(
      await drawer.evaluate((el) => el.closest('.ant-drawer')!.contains(document.activeElement))
    ).toBe(true);
  }
  await page.keyboard.press('Escape');
  await expect(drawer).toHaveCount(0);
  await expect(page.locator('[data-fixture="drawer-selection"]')).toHaveText('');
  await expect(page.locator('[data-fixture="drawer-events"]')).toHaveText(
    JSON.stringify([
      'open-request',
      'after-open:true:record-123',
      'close-request:record-123',
      'after-open:false:record-123',
    ])
  );
  await expect(trigger).toBeFocused();
});

for (const theme of ['light', 'dark'] as const) {
  test(theme + ' 长状态及分类标签局部横滚，图标和关闭动作保持可达', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 900 });
    await page.goto(
      '/tests/ui/contract-fixture.html?boundedContent&theme=' + theme + '&lang=zh-CN'
    );
    const tags = page.locator('[data-fixture="long-tags"] .ds-status-tag');
    await expect(tags).toHaveCount(2);
    for (const tag of await tags.all()) {
      const content = tag.locator('.ds-status-tag__content');
      await expect(content).toHaveAttribute('data-overflowing', 'true');
      await content.focus();
      await expect(content).toBeFocused();
      await content.press('ArrowRight');
      await expect.poll(() => content.evaluate((el) => el.scrollLeft)).toBeGreaterThan(0);
      expect(await tag.evaluate((el) => el.getBoundingClientRect().width)).toBeLessThanOrEqual(160);
    }
    await expectNoStuckOverflows(page);
    await expectReadableText(page);
    await tags.last().getByRole('button').click();
    await expect(page.locator('[data-fixture="tag-closed"]')).toHaveText('1');
    await expect(tags.last()).toBeHidden();
  });

  test(theme + ' bounded LoadingOverlay 保留原节点且正文独立纵滚', async ({ page }) => {
    await page.goto(
      '/tests/ui/contract-fixture.html?boundedContent&theme=' + theme + '&lang=zh-CN'
    );
    const host = page.locator('[data-fixture="bounded-loading"]');
    const content = page.locator('[data-fixture="loading-content"]');
    const assertBounded = async () => {
      const outer = (await host.boundingBox())!;
      const inner = (await content.boundingBox())!;
      expect(inner.height).toBeLessThanOrEqual(outer.height);
      expect(inner.y + inner.height).toBeLessThanOrEqual(outer.y + outer.height + 1);
      expect(
        await content.evaluate((el) => {
          el.scrollTop = 200;
          return el.scrollTop;
        })
      ).toBeGreaterThan(0);
    };
    await assertBounded();
    await content.evaluate((el) => {
      el.dataset.retained = 'original-node';
    });
    await page.getByRole('button', { name: '切换加载' }).click();
    await expect(page.getByText('正在读取', { exact: true })).toBeVisible();
    await expect(content).toHaveAttribute('data-retained', 'original-node');
    await assertBounded();
    await page.getByRole('button', { name: '切换加载' }).click();
    await expect(page.getByText('正在读取', { exact: true })).toBeHidden();
    await expect(content).toHaveAttribute('data-retained', 'original-node');
    await assertBounded();
  });

  test(theme + ' 窄容器查询和十个长页签按自身宽度布局，原生键盘能访问末项', async ({ page }) => {
    await page.setViewportSize({ width: 768, height: 900 });
    await page.goto(
      '/tests/ui/contract-fixture.html?boundedContent&theme=' + theme + '&lang=zh-CN'
    );
    const form = page.locator('[data-fixture="contained-query"]');
    for (const field of await form.locator('.ant-form-item-row').all()) {
      expect((await field.boundingBox())!.width).toBeLessThanOrEqual(174);
    }
    const input = form.getByRole('textbox', { name: /^名称\s*:/ });
    await input.fill('long-identifier-'.repeat(12));
    await input.press('End');
    await expect
      .poll(() => input.evaluate((el) => (el as HTMLInputElement).scrollLeft))
      .toBeGreaterThan(0);
    const section = page.locator('[data-fixture="contained-section-actions"]');
    const extra = section.locator('.ds-section-header__extra');
    expect((await extra.boundingBox())!.width).toBeLessThanOrEqual(174);
    const container = (await section.boundingBox())!;
    for (const action of await extra.getByRole('button').all()) {
      await expect(action).toBeVisible();
      const box = (await action.boundingBox())!;
      expect(box.x).toBeGreaterThanOrEqual(container.x);
      expect(box.x + box.width).toBeLessThanOrEqual(container.x + container.width);
    }
    await expect(extra.getByRole('button')).toHaveCount(3);
    const field = page.locator('[data-fixture="contained-fields"] .ds-information-grid__field');
    const fieldGeometry = await field.evaluate((el) => {
      const owner = el.getBoundingClientRect();
      return [...el.querySelectorAll('dt, dd')].map((slot) => {
        const box = slot.getBoundingClientRect();
        return { width: box.width, right: box.right - owner.right, top: box.top - owner.top };
      });
    });
    for (const box of fieldGeometry) {
      expect(box.width).toBeGreaterThan(40);
      expect(box.right).toBeLessThanOrEqual(1);
      expect(box.top).toBeGreaterThanOrEqual(0);
    }
    await expectReadableInformationFields(page);
    await expect(field.getByText(longIdentifier, { exact: true })).toHaveCount(1);
    const tabs = page.locator('[data-fixture="many-tabs"]');
    const list = tabs.locator('.ant-tabs-nav-list');
    const geometry = await list.evaluate((el) => {
      const box = el.getBoundingClientRect();
      return {
        width: box.width,
        ratio: devicePixelRatio,
        items: [...el.querySelectorAll('.ds-responsive-tabs__item')].map(
          (item) => item.getBoundingClientRect().right - box.left
        ),
      };
    });
    expect(geometry.items).toHaveLength(10);
    // DOMRect 的相减与宽度可相差 0.00003px；按设备像素比较，不放宽真实越界。
    expect(Math.round(Math.max(...geometry.items) * geometry.ratio)).toBeLessThanOrEqual(
      Math.round(geometry.width * geometry.ratio)
    );
    await tabs.getByRole('tab', { name: 'Long workspace category 1', exact: true }).focus();
    for (let index = 0; index < 9; index++) await page.keyboard.press('ArrowRight');
    await page.keyboard.press('Enter');
    await expect(tabs.getByRole('tab', { name: /Long workspace category 10$/ })).toHaveAttribute(
      'aria-selected',
      'true'
    );
    await expect(tabs.getByText('Workspace 10', { exact: true })).toBeVisible();
    await expectNoStuckOverflows(page);
  });
}

test('打开动画尚未完成就关闭抽屉，仍完成退出回调并恢复真实触发焦点', async ({ page }) => {
  await page.goto('/tests/ui/contract-fixture.html?drawerLifecycle&quickClose&lang=zh-CN');
  const trigger = page.getByRole('button', { name: '查看详情' });
  for (let iteration = 0; iteration < 2; iteration++) {
    await trigger.focus();
    await trigger.press('Enter');
    const drawer = page.getByRole('dialog', { name: '记录详情' });
    await expect(drawer).toBeVisible();
    await expect(page.locator('[data-fixture="drawer-events"]')).not.toContainText(
      'after-open:true'
    );
    await page.keyboard.press('Escape');
    await expect(drawer).toHaveCount(0);
    await expect(page.locator('[data-fixture="drawer-events"]')).toContainText(
      'after-open:false:record-123'
    );
    await expect(page.locator('[data-fixture="drawer-selection"]')).toHaveText('');
    await expect(trigger).toBeFocused();
  }
});

for (const theme of ['light', 'dark'] as const) {
  test(theme + ' 日期、双月份及时间弹层按视口收束，非当月可选日期可读', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 480 });
    await page.goto('/tests/ui/contract-fixture.html?datePopups&theme=' + theme + '&lang=zh-CN');
    for (const id of ['single-date', 'range-start', 'month-start', 'date-time']) {
      await page.locator('#' + id).click();
      const popup = page.locator('.ant-picker-dropdown:not(.ant-picker-dropdown-hidden)');
      await expect(popup).toBeVisible();
      await page.evaluate(async () => {
        await Promise.all(
          document
            .getAnimations()
            .filter((animation) =>
              Number.isFinite(Number(animation.effect?.getComputedTiming().endTime))
            )
            .map((animation) => animation.finished.catch(() => undefined))
        );
      });
      await expect
        .poll(() =>
          popup.evaluate((el, control) => {
            const r = el.getBoundingClientRect();
            return {
              control,
              x: r.x,
              y: r.y,
              right: r.right,
              bottom: r.bottom,
              width: window.innerWidth,
              height: window.innerHeight,
              fits:
                r.x >= 0 &&
                r.y >= 0 &&
                r.right <= window.innerWidth + 1 &&
                r.bottom <= window.innerHeight + 1,
            };
          }, id)
        )
        .toMatchObject({ fits: true });
      const container = popup.locator('.ant-picker-panel-container');
      expect(await container.evaluate((el) => el.scrollWidth - el.clientWidth)).toBeLessThanOrEqual(
        1
      );
      await expect
        .poll(() => collectUnreadableText(page), {
          message: '日历颜色过渡结束后仍须满足原文字对比度门槛',
        })
        .toEqual([]);
      if (id === 'single-date') {
        const adjacent = popup
          .locator(
            'td.ant-picker-cell:not(.ant-picker-cell-in-view):not(.ant-picker-cell-disabled)'
          )
          .first();
        await expect(adjacent).toBeVisible();
        await adjacent.click();
        await expect(page.locator('[data-fixture="date-selection"]')).not.toHaveText('');
      } else if (id === 'range-start') {
        await popup.locator('td.ant-picker-cell-in-view[title="2026-10-08"]').click();
        await popup.locator('td.ant-picker-cell-in-view[title="2026-11-09"]').click();
        await expect(page.locator('[data-fixture="date-selection"]')).toHaveText(
          '2026/10/08 / 2026/11/09'
        );
      } else {
        await page.keyboard.press('Escape');
      }
      await expect(popup).toHaveCount(0);
    }
  });
}

test('同一业务记录随语言、外部状态与行序更新，显式缓存仍由调用方控制', async ({ page }) => {
  await page.goto('/tests/ui/contract-fixture.html?tableRendering&lang=zh-CN');
  const first = page.locator('[data-fixture="context-first"]');
  await expect(first).toHaveText('Raw A:0:保存:enabled');
  await page.getByRole('button', { name: '切换外部状态' }).click();
  await expect(first).toHaveText('Raw A:0:保存:disabled');
  await expect(page.locator('[data-fixture="explicit-first"]')).toHaveText('original');
  await page.getByRole('button', { name: '切换语言' }).click();
  await expect(first).toHaveText('Raw A:0:Save:disabled');
  await page.getByRole('button', { name: '切换顺序' }).click();
  await expect(first).toHaveText('Raw A:1:Save:disabled');
  await expect(page.locator('[data-fixture="context-second"]')).toHaveText('Raw B:0:Save:disabled');
  await page.getByRole('button', { name: '切换语言' }).click();
  await expect(first).toHaveText('Raw A:1:保存:disabled');
});

for (const width of [320, 768, 1440])
  for (const theme of ['light', 'dark']) {
    test(`侧栏上下菜单与头像末尾登出 ${width} ${theme}`, async ({ page }, testInfo) => {
      await page.setViewportSize({ width, height: 900 });
      await page.goto(`/tests/ui/contract-fixture.html?navigation=1&theme=${theme}`);
      for (const compact of [false, true]) {
        if (compact) await page.getByRole('button', { name: '切换侧栏', exact: true }).click();
        const top = page.locator('[data-fixture="sidebar-top"] .ant-menu-item');
        const bottom = page.locator('[data-fixture="sidebar-bottom"] .ant-menu-item');
        const appearance = async (item: typeof top) =>
          item.evaluate(async (el) => {
            for (let ancestor: Element | null = el; ancestor; ancestor = ancestor.parentElement) {
              await Promise.all(
                ancestor
                  .getAnimations()
                  .filter((a) => a.effect?.getComputedTiming().iterations !== Infinity)
                  .map((a) => a.finished.catch(() => {}))
              );
            }
            const s = getComputedStyle(el);
            const r = el.getBoundingClientRect();
            return {
              height: r.height,
              width: r.width,
              padding: s.padding,
              borderRadius: s.borderRadius,
              color: s.color,
              background: s.backgroundColor,
              font: s.font,
              lineHeight: s.lineHeight,
            };
          });
        await page.mouse.move(width - 1, 899);
        expect(await appearance(bottom)).toEqual(await appearance(top));
        await top.hover();
        const topHover = await appearance(top);
        await bottom.hover();
        expect(await appearance(bottom)).toEqual(topHover);
        await top.click();
        await expect(top).toHaveClass(/ant-menu-item-selected/);
        await page.mouse.move(width - 1, 899);
        const topSelected = await appearance(top);
        await bottom.click();
        await expect(bottom).toHaveClass(/ant-menu-item-selected/);
        await page.mouse.move(width - 1, 899);
        expect(await appearance(bottom)).toEqual(topSelected);
        const user = page.getByRole('button', { name: '测试用户', exact: true });
        await user.hover();
        const popup = page.locator('.ant-dropdown:visible');
        await expect(popup).toBeVisible();
        await expect(popup.getByRole('menuitem').last()).toHaveText('退出登录');
        await popup.getByRole('menuitem', { name: '个人信息', exact: true }).hover();
        await expect(popup).toBeVisible();
        await page.mouse.move(width - 1, 899);
        await expect(popup).toHaveCount(0);
        // 鼠标先悬停再点击不能把菜单反向关闭；点击后允许指针移出。
        await user.hover();
        await user.click();
        await page.mouse.move(width - 1, 899);
        await expect(popup).toBeVisible();
        await page.keyboard.press('Escape');
        await expect(popup).toHaveCount(0);
        await user.focus();
        await user.press('Enter');
        await expect(popup).toBeVisible();
        await expect
          .poll(() => popup.evaluate((el) => el.contains(document.activeElement)))
          .toBe(true);
        await page.keyboard.press('Escape');
        await expect(popup).toHaveCount(0);
        await expect(user).toBeFocused();
        await user.press(' ');
        await expect(popup).toBeVisible();
        await popup.getByRole('menuitem', { name: '个人信息', exact: true }).click();
        await expect(page.locator('[data-fixture="account-actions"]')).toHaveText(
          compact ? '2' : '1'
        );
        await page.mouse.move(width - 1, 899);
        await expect(popup).toHaveCount(0);
        await expectReadableText(page);
        await page.screenshot({
          path: testInfo.outputPath(`sidebar-${compact ? 'collapsed' : 'expanded'}.png`),
        });
        await user.hover();
        await expect(popup).toBeVisible();
        await popup.evaluate(async (el) => {
          await Promise.all(
            el
              .getAnimations({ subtree: true })
              .filter((a) => a.effect?.getComputedTiming().iterations !== Infinity)
              .map((a) => a.finished.catch(() => {}))
          );
        });
        await page.evaluate(async () => {
          await Promise.all(
            document
              .getAnimations()
              .filter((a) => a.effect?.getComputedTiming().iterations !== Infinity)
              .map((a) => a.finished.catch(() => {}))
          );
        });
        await page.screenshot({
          path: testInfo.outputPath(`avatar-${compact ? 'collapsed' : 'expanded'}.png`),
        });
        await user.focus();
        await user.press('Enter');
        await expect
          .poll(() => popup.evaluate((el) => el.contains(document.activeElement)))
          .toBe(true);
        await page.mouse.move(width - 1, 899);
        await expect(popup).toBeVisible();
        await page.keyboard.press('Escape');
        await expect(popup).toHaveCount(0);
        await expect(user).toBeFocused();
      }
      const user = page.getByRole('button', { name: '测试用户', exact: true });
      await user.hover();
      await page
        .locator('.ant-dropdown:visible')
        .getByRole('menuitem', { name: '退出登录', exact: true })
        .click();
      await expect(page.locator('[data-fixture="account-actions"]')).toHaveText('3');
      await user.hover();
      await expect(
        page
          .locator('.ant-dropdown:visible')
          .getByRole('menuitem', { name: '退出登录', exact: true })
      ).toBeDisabled();
    });
  }

test.describe('触屏账户菜单', () => {
  test.use({ hasTouch: true });
  test('轻触头像打开末尾登出，业务操作仅提交一次', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 900 });
    await page.goto(fixture.replace('?catalog', '?navigation=1'));
    const user = page.getByRole('button', { name: '测试用户', exact: true });
    await user.tap();
    const popup = page.locator('.ds-account-menu__popup:visible');
    await expect(popup).toBeVisible();
    await expect(popup.getByRole('menuitem').last()).toHaveText('退出登录');
    await popup.getByRole('menuitem', { name: '个人信息', exact: true }).tap();
    await expect(popup).toHaveCount(0);
    await expect(page.locator('[data-fixture="account-actions"]')).toHaveText('1');
    await user.tap();
    await popup.getByRole('menuitem', { name: '退出登录', exact: true }).tap();
    await expect(page.locator('[data-fixture="account-actions"]')).toHaveText('2');
    await user.tap();
    await expect(popup.getByRole('menuitem').last()).toBeDisabled();
  });
});

test.describe('减少动态效果的账户菜单', () => {
  test.use({ reducedMotion: 'reduce' });
  for (const theme of ['light', 'dark'])
    for (const compact of [false, true]) {
      test(`${theme} ${compact ? '折叠' : '展开'}：头像浮层可见、定位收束且末项为登出`, async ({
        page,
      }) => {
        await page.setViewportSize({ width: 320, height: 900 });
        await page.goto(fixture.replace('?catalog', `?navigation=1&theme=${theme}`));
        if (compact) await page.getByRole('button', { name: '切换侧栏', exact: true }).click();
        const user = page.getByRole('button', { name: '测试用户', exact: true });
        await user.hover();
        const popup = page.locator('.ds-account-menu__popup:visible');
        await expect(popup).toBeVisible();
        await expect
          .poll(() =>
            popup.evaluate((el) => {
              const r = el.getBoundingClientRect();
              return (
                r.left >= 0 &&
                r.top >= 0 &&
                r.right <= innerWidth + 1 &&
                r.bottom <= innerHeight + 1
              );
            })
          )
          .toBe(true);
        await expect(popup.getByRole('menuitem').last()).toHaveText('退出登录');
        await user.click();
        await page.mouse.move(319, 899);
        await expect(popup).toBeVisible();
        await page.keyboard.press('Escape');
        await expect(popup).toHaveCount(0);
        await expect(user).toBeFocused();
      });
    }
});

test('编辑抽屉未修改仅关闭，失败保留草稿，取消不写入', async ({ page }) => {
  await page.goto('/tests/ui/contract-fixture.html?editForm&lang=zh-CN&failure');
  const dialog = page.getByRole('dialog', { name: '编辑记录', exact: true });
  const footer = dialog.locator('.ds-drawer-form-footer');
  // 未修改的编辑态不渲染页脚（退出由抽屉头部 × 承担），不重复提供关闭按钮。
  await expect(footer).toHaveCount(0);
  await dialog.getByRole('textbox', { name: '名称', exact: true }).fill('修改值');
  await expect(footer.getByRole('button', { name: '取消', exact: true })).toBeVisible();
  await footer.getByRole('button', { name: '保存', exact: true }).click();
  await expect(dialog.getByRole('textbox', { name: '名称', exact: true })).toHaveValue('修改值');
  await expect(footer.getByRole('button', { name: '保存', exact: true })).toBeEnabled();
  await expect(page.getByLabel('已保存内容', { exact: true })).toHaveText('');
  await footer.getByRole('button', { name: '取消', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByLabel('已保存内容', { exact: true })).toHaveText('');
  await page.goto('/tests/ui/contract-fixture.html?editForm&lang=zh-CN');
  await dialog.getByRole('textbox', { name: '名称', exact: true }).fill('成功值');
  await footer.getByRole('button', { name: '保存', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByLabel('已保存内容', { exact: true })).toHaveText('成功值');
});

test('默认正常流不占底部槽，长正文底部模式保留空间且动作可达', async ({ page }) => {
  await page.setViewportSize({ width: 768, height: 440 });
  const url = '/tests/ui/contract-fixture.html?editForm&pageActions&lang=zh-CN';
  await page.goto(url);
  const slot = page.locator('[data-layout="page-footer-slot"]');
  const actions = page.locator('[data-kind="save-bar"]');
  await expect(slot.locator('[data-kind="save-bar"]')).toHaveCount(0);
  expect((await slot.boundingBox())!.height).toBe(0);
  await page.goto(url + '&footer');
  await expect(slot.locator('[data-kind="save-bar"]')).toHaveCount(1);
  expect(await page.evaluate(() => document.documentElement.scrollHeight > innerHeight)).toBe(true);
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  const box = (await actions.boundingBox())!;
  expect(box.y).toBeGreaterThanOrEqual(0);
  expect(box.y + box.height).toBeLessThanOrEqual(441);
  await expect(actions.getByRole('button', { name: '保存', exact: true })).toBeVisible();
  const last = page.getByLabel('编辑正文').getByText('正文 40', { exact: true });
  expect((await last.boundingBox())!.y + (await last.boundingBox())!.height).toBeLessThanOrEqual(
    box.y
  );
});
