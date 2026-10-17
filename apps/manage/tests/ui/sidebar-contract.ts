import type { Page } from '@playwright/test';

/** 真实页面的上下区不能用私有按钮条逃逸出共享菜单；状态色另由交互契约验证。 */
export async function inspectSidebarRegions(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const errors: string[] = [];
    const visible = (node: HTMLElement) =>
      node.getClientRects().length > 0 && getComputedStyle(node).visibility !== 'hidden';
    for (const footer of document.querySelectorAll<HTMLElement>('.ds-basic-layout__sider-footer')) {
      if (!visible(footer)) continue;
      const shell = footer.closest('.ds-basic-layout__sider, .ds-basic-layout__navigation');
      const top = shell?.querySelector<HTMLElement>('.ant-menu-root');
      if (!top || !visible(top)) {
        errors.push('可见下区缺少上区菜单');
        continue;
      }
      for (const menu of shell!.querySelectorAll<HTMLElement>('.ant-menu-root')) {
        if (visible(menu) && !menu.classList.contains('ds-sidebar-menu'))
          errors.push('上下区存在未采用 SidebarMenu 的菜单');
      }
      if (footer.querySelector('button.ant-btn, a.ant-btn')) errors.push('下区仍存在独立按钮条');
      const baselines = {
        item: [...top.querySelectorAll<HTMLElement>(':scope > .ant-menu-item')].find(visible),
        submenu: [
          ...top.querySelectorAll<HTMLElement>(
            ':scope > .ant-menu-submenu > .ant-menu-submenu-title'
          ),
        ].find(visible),
      };
      const geometry = (node: HTMLElement, sameKind: boolean) => {
        const s = getComputedStyle(node);
        return JSON.stringify({
          height: node.getBoundingClientRect().height,
          paddingBlock: s.paddingBlock,
          paddingInlineStart: s.paddingInlineStart,
          ...(sameKind ? { paddingInlineEnd: s.paddingInlineEnd } : {}),
          fontSize: s.fontSize,
          lineHeight: s.lineHeight,
          borderRadius: s.borderRadius,
        });
      };
      for (const item of footer.querySelectorAll<HTMLElement>(
        '.ant-menu-root > .ant-menu-item, .ant-menu-root > .ant-menu-submenu > .ant-menu-submenu-title'
      )) {
        if (!visible(item)) continue;
        const kind = item.classList.contains('ant-menu-submenu-title') ? 'submenu' : 'item';
        const matching = baselines[kind];
        const baseline = matching ?? baselines.item ?? baselines.submenu;
        if (!baseline) continue;
        // 同类型逐项比较全部内边距；不同类型保留 Ant 子菜单的原生展开箭头槽。
        const expected = geometry(baseline, Boolean(matching)),
          actual = geometry(item, Boolean(matching));
        if (actual !== expected)
          errors.push(
            '上下区菜单项几何不同：' +
              (item.textContent ?? '') +
              '；上区=' +
              expected +
              '；下区=' +
              actual
          );
      }
    }
    return errors;
  });
}
