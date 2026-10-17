import { expect, test } from './console-guard';

for (const theme of ['light', 'dark'])
  for (const width of [320, 768, 1440]) {
    test(`查询收尾始终靠右且使用统一蓝色14px ${theme} ${width}`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.goto(`/tests/ui/contract-fixture.html?queryLayout&theme=${theme}`);
      const form = page.locator('.ds-query-form');
      const button = form.getByRole('button', { name: /查询|Query/ });
      await expect(button).toBeVisible();
      await expect
        .poll(async () => {
          const a = await form.boundingBox();
          const b = await button.boundingBox();
          return a && b ? Math.abs(a.x + a.width - b.x - b.width) : Infinity;
        })
        .toBeLessThanOrEqual(1);
      await expect(form.locator('input').first()).toHaveCSS('font-size', '14px');
      const colors = await button.evaluate((node) => {
        const probe = document.createElement('span');
        probe.style.color = 'var(--ds-color-primary)';
        document.body.append(probe);
        const primary = getComputedStyle(probe).color;
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d')!;
        const channels = (color: string) => {
          ctx.clearRect(0, 0, 1, 1);
          ctx.fillStyle = color;
          ctx.fillRect(0, 0, 1, 1);
          return [...ctx.getImageData(0, 0, 1, 1).data].slice(0, 3);
        };
        probe.remove();
        return {
          background: channels(getComputedStyle(node).backgroundColor),
          foreground: channels(getComputedStyle(node).color),
          primary: channels(primary),
          brand: getComputedStyle(document.documentElement)
            .getPropertyValue('--ds-color-brand')
            .trim(),
        };
      });
      expect(colors.brand).toBe('#1677ff');
      expect(colors.background).toEqual(colors.primary);
      const luminance = (channels: number[]) =>
        channels
          .map((value) => {
            const channel = value / 255;
            return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
          })
          .reduce((sum, channel, index) => sum + channel * [0.2126, 0.7152, 0.0722][index], 0);
      const light = Math.max(luminance(colors.background), luminance(colors.foreground));
      const dark = Math.min(luminance(colors.background), luminance(colors.foreground));
      expect((light + 0.05) / (dark + 0.05)).toBeGreaterThanOrEqual(4.5);
      if (theme === 'light') expect(colors.primary).toEqual([21, 112, 240]);
    });
  }
