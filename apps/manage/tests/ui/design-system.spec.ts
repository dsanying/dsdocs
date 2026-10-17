import { expectConsistentActionButtons, expectReadableText } from './forced-wrap';
import { test as playwrightTest } from '@playwright/test';
import {
  expect,
  installRuntimeDiagnostics,
  isAuditedFirefoxEngineDiagnostic,
  RuntimeNetworkExpectations,
  test,
} from './console-guard';
import { extractRequestErrorMessage } from '../../src/utils/requestError';
import { APP_HOST } from './app-origin';
import { waitForNativeOverlayReady } from './native-overlay';

const fixtureURL = '/tests/ui/contract-fixture.html';
const uiBundleConsoleSentinel = '[frontend-ui] console-bundle-sentinel';

playwrightTest('UI 契约构建保留真实 bundle 的 console 诊断', async ({ page }) => {
  const messages: string[] = [];
  page.on('console', (message) => messages.push(message.text()));

  await page.goto(fixtureURL);

  expect(messages).toContain(uiBundleConsoleSentinel);
});

test('请求错误提取区分本地消息、安全客户端错误与服务端错误', () => {
  expect(extractRequestErrorMessage(' 本地字符串错误 ', '请求失败')).toBe('本地字符串错误');
  expect(extractRequestErrorMessage(new Error('本地校验失败'), '请求失败')).toBe('本地校验失败');
  expect(
    extractRequestErrorMessage(
      {
        response: {
          status: 422,
          data: { message: '字段格式错误' },
        },
      },
      '提交失败'
    )
  ).toBe('字段格式错误');
  expect(
    extractRequestErrorMessage(
      { response: { status: 400, data: 'database constraint details' } },
      '请求参数错误'
    )
  ).toBe('请求参数错误 (400)');
  expect(
    extractRequestErrorMessage(
      {
        response: {
          status: 404,
          data: '<html><body>gateway internals</body></html>',
        },
      },
      '未找到资源'
    )
  ).toBe('未找到资源 (404)');
  expect(
    extractRequestErrorMessage(
      {
        response: {
          status: 503,
          data: { message: 'database password=super-secret' },
        },
      },
      '加载失败'
    )
  ).toBe('加载失败 (503)');
  expect(
    extractRequestErrorMessage(
      { status: 404, message: 'Request failed with status code 404' },
      '未找到资源'
    )
  ).toBe('未找到资源 (404)');

  const circularMessage: { message?: unknown } = {};
  circularMessage.message = circularMessage;
  expect(extractRequestErrorMessage(circularMessage, '请求失败')).toBe('请求失败');
});

for (const theme of ['light', 'dark'] as const) {
  playwrightTest(`${theme} 主题只改品牌种子后，分段项和页签选中态同步换色`, async ({ page }) => {
    await page.goto(`${fixtureURL}?theme=${theme}`);
    const switchItem = page.locator(
      '[aria-label="生效切换"] .ds-view-switch__item:has(input:checked)'
    );
    const tabItem = page.locator(
      '[aria-label="页签"] .ds-responsive-tabs__item:has(> [role="tab"][aria-selected="true"])'
    );
    const inkBar = page.locator('[aria-label="页签"] .ds-responsive-tabs__indicator');
    const selectedColors = async () =>
      page.evaluate(() => {
        const probe = document.createElement('div');
        probe.style.backgroundColor = 'var(--ds-color-primary-surface)';
        probe.style.color = 'var(--ds-color-primary-text)';
        document.body.append(probe);
        const token = getComputedStyle(probe).backgroundColor;
        const foreground = getComputedStyle(probe).color;
        probe.remove();
        const selected = [
          ...document.querySelectorAll<HTMLElement>(
            '[aria-label="生效切换"] .ds-view-switch__item:has(input:checked)'
          ),
        ];
        return {
          token,
          foreground,
          selected: selected.map((item) => getComputedStyle(item).backgroundColor),
        };
      });
    const primaryColor = async () =>
      page.evaluate(() => {
        const probe = document.createElement('div');
        probe.style.color = 'var(--ds-color-primary-text)';
        document.body.append(probe);
        const color = getComputedStyle(probe).color;
        probe.remove();
        return color;
      });
    await expect(switchItem).toBeVisible();
    await expect(tabItem).toBeVisible();
    await expect(inkBar).toBeVisible();
    const before = await selectedColors();
    const beforePrimary = await primaryColor();
    await page.addStyleTag({ content: ':root { --ds-color-brand: #6f2dbd; }' });
    const after = await selectedColors();
    const afterPrimary = await primaryColor();
    expect(after.token).not.toBe(before.token);
    expect(afterPrimary).not.toBe(beforePrimary);
    // ViewSwitch 仍是药丸弱底；页签是 line 原生形态——主色文字 + 主色下划线
    await expect(switchItem).toHaveCSS('background-color', after.token);
    expect(after.selected).toHaveLength(1);
    await expect(switchItem.locator('.ds-view-switch__label')).toHaveCSS('color', after.foreground);
    await expect(tabItem.locator('[role="tab"]')).toHaveCSS('color', afterPrimary);
    await expect(inkBar).toHaveCSS('background-color', afterPrimary);
    await expectReadableText(page);
  });

  playwrightTest(`${theme} 主题下选中项弱底保持状态图标的当前主题语义色`, async ({ page }) => {
    await page.goto(`${fixtureURL}?theme=${theme}`);
    await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
    const selected = page.locator(
      '[aria-label="生效切换"] .ds-view-switch__item:has(input:checked) .anticon'
    );
    await expect(selected).toBeVisible();
    // 选中项采用品牌弱底：状态色按当前主题保持，不被按钮品牌色覆盖
    const expected = theme === 'light' ? 'rgb(33, 122, 75)' : 'rgb(101, 214, 151)';
    await expect(selected).toHaveCSS('color', expected);
    await expectReadableText(page);
  });
}

test('Firefox 引擎诊断只归属当前 宿主页面与精确引擎', () => {
  const pageUrl = `http://${APP_HOST}/overview`;
  const text = `[JavaScript Warning: "This site appears to use a scroll-linked positioning effect. This may not work well with asynchronous panning; see https://firefox-source-docs.mozilla.org/performance/scroll-linked_effects.html for further details and to join the discussion on related tools and features!" {file: "${pageUrl}" line: 0}]`;
  const diagnostic = {
    browserName: 'firefox',
    pageUrl,
    type: 'warning',
    text,
    lineNumber: 0,
  };
  expect(isAuditedFirefoxEngineDiagnostic(diagnostic)).toBe(true);
  expect(isAuditedFirefoxEngineDiagnostic({ ...diagnostic, browserName: 'chromium' })).toBe(false);
  expect(
    isAuditedFirefoxEngineDiagnostic({
      ...diagnostic,
      pageUrl: `http://${APP_HOST}/analysis`,
    })
  ).toBe(false);
  expect(
    isAuditedFirefoxEngineDiagnostic({
      ...diagnostic,
      text: text.replace(APP_HOST, 'example.invalid'),
    })
  ).toBe(false);
});

test('运行时网络预期按方法、完整 URL、状态或失败原因及次数精确匹配', () => {
  const expectations = new RuntimeNetworkExpectations();
  const url = `http://${APP_HOST}/api/itemHeatMap?range=7d`;
  expectations.registerHttpFailure({
    method: 'POST',
    url,
    status: 503,
    count: 2,
  });

  expect(expectations.consumeHttpFailure({ method: 'GET', url, status: 503 })).toBe(false);
  expect(expectations.consumeHttpFailure({ method: 'POST', url, status: 500 })).toBe(false);
  expect(
    expectations.consumeHttpFailure({
      method: 'POST',
      url: `${url}&extra=1`,
      status: 503,
    })
  ).toBe(false);
  expect(expectations.consumeHttpFailure({ method: 'POST', url, status: 503 })).toBe(true);
  expect(expectations.consumeHttpFailure({ method: 'POST', url, status: 503 })).toBe(true);
  expect(expectations.consumeHttpFailure({ method: 'POST', url, status: 503 })).toBe(false);
  expect(expectations.consumeHttpConsoleDiagnostic(url, 503)).toBe(true);
  expect(expectations.consumeHttpConsoleDiagnostic(url, 503)).toBe(true);
  expect(expectations.consumeHttpConsoleDiagnostic(url, 503)).toBe(false);

  expectations.registerRequestFailure({
    method: 'GET',
    url,
    errorText: 'net::ERR_CONNECTION_RESET',
  });
  expect(
    expectations.consumeRequestFailure({
      method: 'GET',
      url,
      errorText: 'net::ERR_FAILED',
    })
  ).toBe(false);
  expect(
    expectations.consumeRequestFailure({
      method: 'GET',
      url,
      errorText: 'net::ERR_CONNECTION_RESET',
    })
  ).toBe(true);
  expect(expectations.describeUnmet()).toEqual([]);
});

playwrightTest('运行时守卫收集页面异常、请求失败和未声明 HTTP 失败', async ({ page }) => {
  const violations: string[] = [];
  const removeRuntimeDiagnostics = installRuntimeDiagnostics(page, violations);
  await page.route('**/runtime-guard-http', (route) =>
    route.fulfill({ status: 418, body: 'expected fixture failure' })
  );
  await page.route('**/runtime-guard-request', (route) => route.abort('failed'));
  await page.goto(fixtureURL);
  await page.evaluate(async () => {
    await fetch('/runtime-guard-http');
    await fetch('/runtime-guard-request').catch(() => undefined);
    setTimeout(() => {
      throw new Error('runtime guard page error');
    }, 0);
  });
  await expect.poll(() => violations.length).toBe(3);
  removeRuntimeDiagnostics();

  expect(violations.join('\n')).toContain(
    `[http] GET http://${APP_HOST}/runtime-guard-http\n  status: 418`
  );
  expect(violations.join('\n')).toContain(
    `[requestfailed] GET http://${APP_HOST}/runtime-guard-request`
  );
  expect(violations.join('\n')).toContain('[pageerror] Error: runtime guard page error');
});

test('AppPage 为 ReactNode 标题提供唯一一级标题且不生成原生 title', async ({ page }) => {
  await page.goto(`${fixtureURL}?appPageTitle=1`);
  const heading = page.getByRole('heading', {
    level: 1,
    name: 'ReactNode 页面标题',
  });
  await expect(heading).toHaveCount(1);
  await expect(heading.locator('xpath=..')).not.toHaveAttribute('title');
});

test('QueryFeedback 在真实界面保留可操作错误并隐藏服务端敏感原文', async ({ page }) => {
  await page.goto(`${fixtureURL}?queryFeedback=1`);

  await expect(page.getByRole('region', { name: '本地文本错误' }).getByRole('alert')).toContainText(
    '本地字符串错误'
  );
  await expect(page.getByRole('region', { name: '本地 Error' }).getByRole('alert')).toContainText(
    '本地校验失败'
  );
  await expect(page.getByRole('region', { name: '客户端错误' }).getByRole('alert')).toContainText(
    '字段格式错误'
  );
  const plainTextError = page.getByRole('region', { name: '客户端裸文本错误' }).getByRole('alert');
  await expect(plainTextError).toContainText('请求参数错误 (400)');
  await expect(plainTextError).not.toContainText('database constraint details');
  const htmlError = page.getByRole('region', { name: '客户端 HTML 错误' }).getByRole('alert');
  await expect(htmlError).toContainText('未找到资源 (404)');
  await expect(htmlError).not.toContainText('gateway internals');

  const serverError = page.getByRole('region', { name: '服务端错误' }).getByRole('alert');
  await expect(serverError).toContainText('加载失败 (503)');
  await expect(serverError).not.toContainText('database password=super-secret');
  await expect(page.getByRole('region', { name: '服务端错误' }).getByRole('button')).toBeVisible();
});

test('AtomicValue 过长时在自身范围内左右滚动，不省略、不弹 Tooltip', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 720 });
  await page.goto(fixtureURL);
  const shortValue = page.locator('.identifier-wide .ds-atomic-value');
  expect(
    await shortValue.evaluate((element) => element.scrollWidth <= element.clientWidth + 1)
  ).toBe(true);
  await expect(shortValue).not.toHaveAttribute('tabindex', '0');
  const longValue = page.locator('.identifier-narrow .ds-atomic-value');
  await expect
    .poll(() => longValue.evaluate((element) => element.scrollWidth > element.clientWidth + 1))
    .toBe(true);
  // 全文就在页面上：不省略号、可滚到末尾、溢出时可键盘聚焦
  const style = await longValue.evaluate((element) => {
    element.scrollLeft = 9999;
    const computed = getComputedStyle(element);
    return {
      textOverflow: computed.textOverflow,
      overflowX: computed.overflowX,
      scrolled: element.scrollLeft > 0,
      text: element.textContent,
    };
  });
  expect(style).toEqual({
    textOverflow: 'clip',
    overflowX: 'auto',
    scrolled: true,
    text: expect.stringContaining('item-production-'),
  });
  await expect(longValue).toHaveAttribute('tabindex', '0');
  await longValue.hover();
  await expect(page.getByRole('tooltip')).toHaveCount(0);
});

test('纯图标动作以可访问名称为唯一文字：悬停由全局 IconLabelHint 显示该名称，且支持键盘', async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 720 });
  await page.goto(fixtureURL);
  const action = page.getByRole('button', { name: '复制标识符' });
  // 先滚到可见再悬停：滚动会收起提示（锚点位置失效），hover 自带的滚动与 pointerover 先后不定
  await action.scrollIntoViewIfNeeded();
  await action.hover();
  await expect(page.getByRole('tooltip')).toHaveText('复制标识符');
  await expect(page.getByRole('tooltip')).toHaveCount(1);
  await action.focus();
  await page.keyboard.press('Enter');
  await expect(action).toBeFocused();
  await expect(page.getByText('已复制 1 次')).toBeVisible();
});

test('图标提示不接收指针，步骤改名及移除后清理旧提示并允许下一项提交', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 720 });
  await page.goto(`${fixtureURL}?iconHintSteps`);
  const preview = page.getByRole('button', { name: '预览上传内容', exact: true });
  await preview.hover();
  await expect(page.getByRole('tooltip')).toHaveText('预览上传内容');
  await expect(page.locator('.ds-icon-label-hint')).toHaveCSS('pointer-events', 'none');
  await preview.focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('tooltip')).toHaveCount(0);
  const confirm = page.getByRole('button', { name: '确认上传', exact: true });
  await page.mouse.move(319, 719);
  await confirm.hover();
  await expect(page.getByRole('tooltip')).toHaveText('确认上传');
  await confirm.focus();
  await page.keyboard.press('Enter');
  await expect(confirm).toHaveCount(0);
  await expect(page.getByRole('tooltip')).toHaveCount(0);
  await page.getByRole('button', { name: '提交下一项', exact: true }).click();
  await expect(page.getByLabel('下一项提交次数')).toHaveText('1');
});

test('320px 下无内容页签可键盘切换，搜索规则可从问号聚焦查看', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 720 });
  await page.goto(fixtureURL);

  const navigation = page.getByRole('region', { name: '无内容页签' });
  const firstTab = navigation.getByRole('tab').first();
  const secondTab = navigation.getByRole('tab').nth(1);
  await firstTab.focus();
  await page.keyboard.press('ArrowRight');
  await expect(secondTab).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(secondTab).toHaveAttribute('aria-selected', 'true');

  const search = page.getByRole('searchbox', { name: '检索词' });
  await search.focus();
  // 匹配规则收在输入框尾部问号：读屏聚焦输入框即可听到，悬停/聚焦问号才展示，不常驻占位
  await expect(search).toHaveAttribute('aria-description', '按空格拆分多个关键词，全部命中才显示');
  const hint = page.getByRole('img', { name: '按空格拆分多个关键词，全部命中才显示' });
  await expect(hint).toBeVisible();
  await expect(page.getByRole('tooltip')).toHaveCount(0);
  await hint.focus();
  await expect(page.getByRole('tooltip')).toContainText('按空格拆分多个关键词，全部命中才显示');
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1
    )
  ).toBe(true);
});

test('ViewSwitch 与横向页签的文字在固定控件高度内垂直居中', async ({ page }) => {
  await page.goto(fixtureURL);
  const centered = async (
    outer: ReturnType<typeof page.locator>,
    inner: ReturnType<typeof page.locator>
  ) => {
    const [outerBox, innerBox] = await Promise.all([outer.boundingBox(), inner.boundingBox()]);
    expect(outerBox).not.toBeNull();
    expect(innerBox).not.toBeNull();
    const above = innerBox!.y - outerBox!.y;
    const below = outerBox!.y + outerBox!.height - (innerBox!.y + innerBox!.height);
    expect(Math.abs(above - below)).toBeLessThanOrEqual(1);
    const minimum = await outer.evaluate(() =>
      parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--ds-control-height'))
    );
    expect(minimum).toBe(32);
    expect(outerBox!.height).toBeGreaterThanOrEqual(minimum);
  };

  const control = page
    .getByRole('region', { name: '视图切换' })
    .locator('.ds-view-switch__control');
  await centered(control, control.locator('.ds-view-switch__label').first());

  const header = page
    .getByRole('region', { name: '无内容页签' })
    .locator('.ds-responsive-tabs__header');
  await centered(header, header.getByRole('tab').first());
});

test('useRequest 丢弃旧实体响应并在同实体刷新时保留内容', async ({ page }) => {
  await page.goto(fixtureURL);
  await page.getByRole('button', { name: '切换实体' }).click();
  await expect(page.getByLabel('请求状态')).toHaveText('加载中');
  await expect(page.getByLabel('请求数据')).toHaveText('无数据');
  await page.getByRole('button', { name: '完成当前实体请求' }).click();
  await expect(page.getByLabel('请求数据')).toHaveText(/^fast-\d+$/);
  const current = await page.getByLabel('请求数据').textContent();
  await page.getByRole('button', { name: '完成旧实体请求' }).click();
  await expect(page.getByLabel('请求完成确认')).toHaveText(/^slow-\d+$/);
  await expect(page.getByLabel('请求数据')).toHaveText(current ?? '');

  await page.getByRole('button', { name: '刷新当前实体' }).click();
  await expect(page.getByLabel('请求状态')).toHaveText('加载中');
  await expect(page.getByLabel('请求数据')).toHaveText(current ?? '');
  await page.getByRole('button', { name: '完成当前实体请求' }).click();
  await expect(page.getByLabel('请求数据')).not.toHaveText(current ?? '');
});

test('useDataTable 只接受末次请求结果并在翻页与排序时重新请求', async ({ page }) => {
  await page.goto(fixtureURL);
  const rows = page.getByLabel('表格行');
  await expect(page.getByLabel('表格状态')).toHaveText('加载中');
  await page.getByRole('button', { name: /(^|\s)提交筛选$/ }).click();
  await page.getByRole('button', { name: /(^|\s)完成最早请求$/ }).click();
  await expect(rows).toHaveText('无');
  await expect(page.getByLabel('表格状态')).toHaveText('加载中');
  await page.getByRole('button', { name: /(^|\s)完成最新请求$/ }).click();
  await expect(rows).toHaveText('fast:1:none');
  await expect(page.getByLabel('表格状态')).toHaveText('已完成');

  await page.getByRole('button', { name: /(^|\s)翻到第二页$/ }).click();
  await expect(page.getByLabel('表格页码')).toHaveText('2');
  await page.getByRole('button', { name: /(^|\s)完成最新请求$/ }).click();
  await expect(rows).toHaveText('fast:2:none');

  await page.getByRole('columnheader', { name: /名称/ }).click();
  await expect(page.getByLabel('表格页码')).toHaveText('1');
  await page.getByRole('button', { name: /(^|\s)完成最新请求$/ }).click();
  await expect(rows).toHaveText('fast:1:name');
});

test('useDataTable 总数收缩时校正越界页码并重发请求', async ({ page }) => {
  await page.goto(fixtureURL);
  const rows = page.getByLabel('表格行');
  await page.getByRole('button', { name: /(^|\s)提交筛选$/ }).click();
  await page.getByRole('button', { name: /(^|\s)完成最新请求$/ }).click();
  await expect(rows).toHaveText('fast:1:none');

  // 在第 2 页时末页数据被删（总数 30→10）：成功响应确认越界后页码校正为 1 并重发
  await page.getByRole('button', { name: /(^|\s)翻到第二页$/ }).click();
  await expect(page.getByLabel('表格页码')).toHaveText('2');
  await page.getByRole('button', { name: /(^|\s)完成最新请求总数10$/ }).click();
  await expect(page.getByLabel('表格页码')).toHaveText('1');
  await page.getByRole('button', { name: /(^|\s)完成最新请求$/ }).click();
  await expect(rows).toHaveText('fast:1:none');
  await expect(page.getByLabel('表格状态')).toHaveText('已完成');
});

test('useDataTable 迟到的旧响应不回退页码、不重发请求', async ({ page }) => {
  await page.goto(fixtureURL);
  const rows = page.getByLabel('表格行');
  await page.getByRole('button', { name: /(^|\s)提交筛选$/ }).click();
  await page.getByRole('button', { name: /(^|\s)完成最新请求$/ }).click();
  await expect(rows).toHaveText('fast:1:none');

  // 第 2 页请求挂起期间用户切到第 3 页并拿到完整结果；随后旧响应迟到返回 total=10，
  // 它既不能把页码回退到 1，也不能以旧查询参数再发一次请求
  await page.getByRole('button', { name: /(^|\s)翻到第二页$/ }).click();
  await page.getByRole('button', { name: /(^|\s)翻到第三页$/ }).click();
  await page.getByRole('button', { name: /(^|\s)完成最新请求$/ }).click();
  await expect(page.getByLabel('表格页码')).toHaveText('3');
  await expect(rows).toHaveText('fast:3:none');

  await page.getByRole('button', { name: /(^|\s)完成最早请求总数10$/ }).click();
  await expect(page.getByLabel('表格页码')).toHaveText('3');
  await expect(rows).toHaveText('fast:3:none');
  await expect(page.getByLabel('表格状态')).toHaveText('已完成');
});

test('DataTable 首次失败占据空态，刷新失败保留旧行并提供重试', async ({ page }) => {
  await page.goto(fixtureURL);
  const section = page.getByLabel('表格请求契约');
  await page.getByRole('button', { name: /(^|\s)失败最新请求$/ }).click();
  await expect(section.getByRole('alert')).toContainText(/Request failed|请求失败/);
  await expect(section.getByText('没有符合条件的记录')).toHaveCount(0);

  await section.getByRole('button', { name: /(重试|Retry)$/ }).click();
  await page.getByRole('button', { name: /(^|\s)完成最新请求$/ }).click();
  await expect(page.getByLabel('表格行')).toHaveText('all:1:none');
  await expect(section.getByRole('alert')).toHaveCount(0);

  await page.getByRole('button', { name: /(^|\s)刷新表格$/ }).click();
  await page.getByRole('button', { name: /(^|\s)失败最新请求$/ }).click();
  await expect(page.getByLabel('表格行')).toHaveText('all:1:none');
  await expect(section.getByRole('alert')).toContainText(/Request failed|请求失败/);
  await expect(section.getByRole('row', { name: /all:1:none/ })).toBeVisible();
});

test('窄屏下所有动作按钮同步收成仅图标：页面动作、Modal 页脚、Modal.confirm 与 Popconfirm 一致', async ({
  page,
}) => {
  await page.setViewportSize({ width: 480, height: 900 });
  await page.goto(fixtureURL);
  const section = page.getByRole('region', { name: '确认按钮契约' });
  await expect(section).toBeVisible();
  await expectConsistentActionButtons(page);

  await section.getByRole('button', { name: '移除' }).click();
  await expect(page.locator('.ant-popconfirm')).toBeVisible();
  await expectConsistentActionButtons(page);
  await page.keyboard.press('Escape');

  await section.getByRole('button', { name: '打开弹窗' }).click();
  await expect(page.locator('.ant-modal-footer')).toBeVisible();
  await expectConsistentActionButtons(page);
  await page
    .locator('.ant-modal-footer')
    .getByRole('button', { name: /OK|确定|确 定/ })
    .click();

  await section.getByRole('button', { name: '打开确认' }).click();
  await expect(page.locator('.ant-modal-confirm-btns')).toBeVisible();
  await expectConsistentActionButtons(page);

  // 宽屏下同一批按钮全部恢复“图标 + 文字”
  await page.setViewportSize({ width: 1280, height: 900 });
  await expectConsistentActionButtons(page);
  const okLabel = page.locator(
    '.ant-modal-confirm-btns .ant-btn-primary > span:not(.ant-btn-icon)'
  );
  expect(
    await okLabel.evaluate((element) => element.getBoundingClientRect().width)
  ).toBeGreaterThan(1);
});

test('指标条按内容宽度均衡分列：短值一行三列，长值放不下整体单列', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto(fixtureURL);
  const columns = (name: string) =>
    page
      .getByRole('region', { name })
      .locator('.ds-summary-strip__track')
      .evaluate((track) => getComputedStyle(track).gridTemplateColumns.split(' ').length);
  await expect.poll(() => columns('继承关系')).toBe(3);
  await expect.poll(() => columns('余额')).toBe(1);
});

for (const kind of ['抽屉', '弹窗']) {
  test(`${kind}表单提交中禁止关闭复用，阻止重复提交并允许下一次编辑`, async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem('dsdocs-lang', 'zh-CN'));
    await page.goto(fixtureURL);
    const fixture = page.getByRole('region', { name: '表单提交契约' });
    await fixture.getByRole('button', { name: `打开${kind}表单` }).click();
    const container = page.locator(kind === '抽屉' ? '.ant-drawer:visible' : '.ant-modal:visible');
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
    await fixture.getByRole('button', { name: `打开${kind}表单` }).click();
    await expect(container.getByLabel('会话草稿')).toHaveValue('初始内容');
    await container.getByLabel('会话草稿').fill('草稿 C');
    await container.getByRole('button', { name: /取消/ }).click();
  });
}

test('详情抽屉拖拽调宽后保持宽度且可关闭重开', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`${fixtureURL}?nativeCompare`);
  const open = page
    .getByRole('region', { name: '详情抽屉（拖拽调宽）' })
    .getByRole('button', { name: '打开抽屉', exact: true })
    .first();
  await open.click();
  const drawer = page.getByRole('dialog');
  await expect(drawer).toBeVisible();
  const dragger = page.locator('.ant-drawer-resizable-dragger');
  await expect(dragger).toBeVisible();
  await waitForNativeOverlayReady(drawer);
  const initialWidth = await drawer.evaluate((node) => node.getBoundingClientRect().width);
  const handle = await dragger.boundingBox();
  expect(handle).not.toBeNull();
  await page.mouse.move(handle!.x + handle!.width / 2, handle!.y + handle!.height / 2);
  await page.mouse.down();
  await page.mouse.move(handle!.x - 100, handle!.y + handle!.height / 2, { steps: 10 });
  await page.mouse.up();
  await expect
    .poll(() => drawer.evaluate((node) => node.getBoundingClientRect().width))
    .toBeGreaterThan(initialWidth + 80);
  const resizedWidth = await drawer.evaluate((node) => node.getBoundingClientRect().width);
  await drawer.locator('.ant-drawer-close').click();
  await expect(drawer).toBeHidden();
  await open.click();
  await expect(drawer).toBeVisible();
  await waitForNativeOverlayReady(drawer);
  await expect
    .poll(() => drawer.evaluate((node) => node.getBoundingClientRect().width))
    .toBeCloseTo(resizedWidth, 0);
});
