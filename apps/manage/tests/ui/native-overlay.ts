import { expect, type Locator } from '@playwright/test';

/** 等待原生浮层进入最终位置；刻意测试动画中交互的用例不得调用。 */
export async function waitForNativeOverlayReady(overlay: Locator): Promise<void> {
  await expect(overlay).toBeVisible();
  await expect
    .poll(() =>
      overlay.evaluate((element) => {
        const pending: string[] = [];
        for (
          let node: Element | null = element;
          node && node !== document.body;
          node = node.parentElement
        ) {
          // Motion prepare 阶段还没有 Animation 对象，必须同时检查原生入场类。
          if (/\bant-[\w-]+-(?:appear|enter)(?:-[\w-]+)?\b/.test(node.className))
            pending.push('enter');
          for (const animation of node.getAnimations()) {
            const iterations = animation.effect?.getTiming().iterations;
            if (iterations !== Infinity && (animation.pending || animation.playState === 'running'))
              pending.push('animation');
          }
        }
        return pending;
      })
    )
    .toEqual([]);
}
