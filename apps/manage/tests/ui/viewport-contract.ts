import type { Page } from '@playwright/test';
/** 几何与滚动所有权只能由真实浏览器确认，不能以 class 存在替代。 */
export async function inspectViewportRegions(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const errors: string[] = [];
    const root = document.documentElement;
    if (
      root.scrollHeight > root.clientHeight + 1 ||
      root.scrollWidth > root.clientWidth + 1 ||
      window.scrollY !== 0
    )
      errors.push('页面根发生滚动或溢出');
    for (const frame of document.querySelectorAll<HTMLElement>('.ds-sidebar-frame')) {
      if (!frame.getClientRects().length) continue;
      const footer = frame.querySelector<HTMLElement>('.ds-sidebar-frame__footer');
      if (
        !footer ||
        Math.abs(footer.getBoundingClientRect().bottom - frame.getBoundingClientRect().bottom) > 2
      )
        errors.push('账号和偏好区未锚定侧栏底部');
    }
    return errors;
  });
}
