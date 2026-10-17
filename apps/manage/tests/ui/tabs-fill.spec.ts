import { test, expect } from './console-guard';
import {
  expectNoCellOverflows,
  expectNoForcedWraps,
  expectNoStuckOverflows,
  expectReadableText,
} from './forced-wrap';

const fixture = '/tests/ui/tabs-fill-fixture.html';

for (const theme of ['light', 'dark'] as const) {
  for (const semantics of ['object', 'callback'] as const) {
    test(`${theme} ${semantics}: fill 页签收缩真实候选列表，底部键盘/鼠标选择与范围保留`, async ({
      page,
    }, info) => {
      const english = semantics === 'callback';
      const labels = english
        ? {
            candidates: 'Candidates',
            selected: 'Selected',
            last: 'Candidate 40',
            term: 'Term',
            scope: 'Current scope',
            second: 'Second term',
            selection: 'Selection',
            theme: 'Toggle theme',
            loading: 'Toggle loading',
          }
        : {
            candidates: '候选人员',
            selected: '已选人员',
            last: '候选 40',
            term: '学期',
            scope: '当前范围',
            second: '第二学期',
            selection: '选项统计',
            theme: '切换主题',
            loading: '切换加载',
          };
      const diagnostics: string[] = [];
      page.on('console', (message) => {
        if (message.type() === 'info') diagnostics.push(message.text());
      });
      await page.setViewportSize({ width: 320, height: 900 });
      await page.goto(
        `${fixture}?theme=${theme}&lang=${english ? 'en-US' : 'zh-CN'}&semantics=${semantics}`
      );
      await expect(page.locator('html')).toHaveAttribute('lang', english ? 'en-US' : 'zh-CN');
      const pane = page.getByRole('tabpanel', { name: labels.candidates });
      const scroller = pane.getByRole('list', { name: labels.candidates, exact: true });
      await expect(scroller.getByRole('button')).toHaveCount(40);
      await page.evaluate(async () => {
        await document.fonts.ready;
        await new Promise<void>((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
        );
      });
      const dimensions = await scroller.evaluate((element) => {
        const boundary = element.closest('section')!;
        const panel = element.closest('[role="tabpanel"]')!;
        return {
          client: element.clientHeight,
          scroll: element.scrollHeight,
          boundary: boundary.clientHeight,
          panel: panel.clientHeight,
          panelDisplay: getComputedStyle(panel).display,
        };
      });
      await info.attach('bounded-candidate-geometry', {
        body: JSON.stringify(dimensions),
        contentType: 'application/json',
      });
      expect(dimensions.client).toBeGreaterThan(0);
      expect(dimensions.client).toBeLessThan(dimensions.boundary);
      expect(dimensions.scroll).toBeGreaterThan(dimensions.client * 3);
      await expect(
        page.getByRole('tabpanel', { name: labels.selected, includeHidden: true })
      ).toBeHidden();

      await scroller.focus();
      await scroller.press('End');
      await expect.poll(() => scroller.evaluate((element) => element.scrollTop)).toBeGreaterThan(0);
      const last = scroller.getByRole('button', { name: labels.last, exact: true });
      await expect
        .poll(() =>
          last.evaluate((element) => {
            const row = element.getBoundingClientRect();
            const list = element.closest('[role="list"]')!.getBoundingClientRect();
            return row.top >= list.top - 1 && row.bottom <= list.bottom + 1;
          })
        )
        .toBe(true);
      await scroller.press('Home');
      for (let index = 0; index < 40; index += 1) await page.keyboard.press('Tab');
      await expect(last).toBeFocused();
      await page.keyboard.press('Space');
      const selection = page.getByLabel(labels.selection, { exact: true });
      await expect(selection).toHaveText(labels.last);
      await expect(selection).toHaveAttribute('data-clicks', '1');
      await last.click();
      await expect(selection).toHaveText('—');
      await expect(selection).toHaveAttribute('data-clicks', '2');
      await last.click();
      await expect(selection).toHaveText(labels.last);
      await expect(selection).toHaveAttribute('data-clicks', '3');

      const scope = pane.getByRole('combobox', { name: labels.term, exact: true });
      await scope.click();
      await scope.press('ArrowDown');
      await scope.press('Enter');
      await expect(page.getByLabel(labels.scope, { exact: true })).toHaveText(labels.second);
      // 选择值已更新不代表弹层退出完成，等其真实隐藏后再测量页面布局。
      await expect(
        page.locator('.ant-select-dropdown').filter({ has: page.locator('#tabs-fill-term_list') })
      ).toBeHidden();
      const candidatesTab = page.getByRole('tab', { name: new RegExp(`${labels.candidates}$`) });
      const selectedTab = page.getByRole('tab', { name: new RegExp(`${labels.selected}$`) });
      await candidatesTab.click();
      await candidatesTab.press('ArrowRight');
      await expect(selectedTab).toBeFocused();
      await selectedTab.press('Enter');
      await expect(selectedTab).toHaveAttribute('aria-selected', 'true');
      const selectedPane = page.getByRole('tabpanel', { name: new RegExp(`${labels.selected}$`) });
      await expect(
        selectedPane.getByRole('button', { name: labels.last, exact: true })
      ).toHaveAttribute('aria-pressed', 'true');
      await expect(
        page.getByRole('tabpanel', { name: labels.candidates, includeHidden: true })
      ).toBeHidden();
      await page.getByRole('button', { name: labels.theme, exact: true }).click();
      await expect(page.locator('html')).toHaveAttribute(
        'data-theme',
        theme === 'light' ? 'dark' : 'light'
      );
      await expect(
        selectedPane.getByRole('button', { name: labels.last, exact: true })
      ).toBeVisible();
      await selectedTab.click();
      await selectedTab.press('ArrowLeft');
      await expect(candidatesTab).toBeFocused();
      await candidatesTab.press('Enter');
      await expect(candidatesTab).toHaveAttribute('aria-selected', 'true');
      await expect(page.getByLabel(labels.scope, { exact: true })).toHaveText(labels.second);
      await expect(last).toHaveAttribute('aria-pressed', 'true');
      await page.getByRole('button', { name: labels.loading, exact: true }).click();
      await expect(page.locator('.ant-spin-spinning')).toHaveCount(1);
      await page.getByRole('button', { name: labels.loading, exact: true }).click();
      await expect(page.locator('.ant-spin-spinning')).toHaveCount(0);
      await expect(last).toHaveAttribute('aria-pressed', 'true');
      await expect(scroller.getByRole('button')).toHaveCount(40);
      await expect(page.locator('.tabs-fill-user-body')).toHaveCount(1);
      await expect(pane).toHaveClass(/tabs-fill-user-content/);
      await page.mouse.move(0, 0);
      await expect(page.locator('.ant-tooltip:not(.ant-tooltip-hidden)')).toHaveCount(0);
      await expect
        .poll(() =>
          page.evaluate(
            () =>
              document.getAnimations().filter((animation) => animation.playState === 'running')
                .length
          )
        )
        .toBe(0);
      await expectNoForcedWraps(page);
      await expectNoCellOverflows(page);
      await expectNoStuckOverflows(page);
      await expectReadableText(page);
      expect(
        diagnostics.filter((message) => message === '[tabs-fill-fixture] initialized')
      ).toHaveLength(1);
    });
  }
}
