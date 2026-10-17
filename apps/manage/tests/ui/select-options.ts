import { expect, type Locator } from '@playwright/test';
import { waitForNativeOverlayReady } from './native-overlay';

/** 按控件拥有的 listbox 找当前弹层，排除其它字段尚在退出的弹层及隐藏 ARIA 候选。 */
export async function openSelectPopup(control: Locator): Promise<Locator> {
  const field = control.locator(
    "xpath=ancestor::*[contains(concat(' ',normalize-space(@class),' '),' ant-select ')][1]"
  );
  await field.click();
  await expect(control).toHaveAttribute('aria-expanded', 'true');
  const listId = await control.getAttribute('aria-controls');
  expect(listId).not.toBeNull();
  const popup = control
    .page()
    .locator('.ant-select-dropdown')
    .filter({ has: control.page().locator(`[id="${listId}"]`) });
  await waitForNativeOverlayReady(popup);
  return popup;
}

/** 点击实际候选行；Ant 虚拟列表另有同名隐藏 option，不能按全弹层文本点击。 */
export function selectOptionRow(popup: Locator, text: string): Locator {
  const exact = new RegExp(`^${text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`);
  return popup.locator('.ant-select-item-option').filter({
    has: popup.page().locator('.ant-select-item-option-content').filter({ hasText: exact }),
  });
}
