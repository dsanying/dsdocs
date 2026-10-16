import { useMemo } from 'react';
import { readCssColorToken } from '@/design/tokens';
import { useThemeStore } from '@/stores/useThemeStore';

const SEMANTIC_KEYS = [
  'canvas',
  'surface',
  'surfaceMuted',
  'surfaceElevated',
  'text',
  'textSecondary',
  'textTertiary',
  'textDisabled',
  'border',
  'borderStrong',
  'primary',
  'link',
  'info',
  'infoSurface',
  'success',
  'warning',
  'error',
] as const;

/** 分类色板 8 档基色（tokens.css 发布的 --ds-color-data-1..8）。 */
export const CHART_BASE_SERIES = 8;
/** 派生环数：基色之外按明度交替派生浅/深各两环，共 40 档，系列再多也有确定的取色顺序，不折叠数据。 */
export const CHART_PALETTE_RINGS = 5;

function hexToHsl(hex: string): [number, number, number] {
  const value = hex.replace('#', '');
  const full =
    value.length === 3
      ? value
          .split('')
          .map((c) => c + c)
          .join('')
      : value;
  const r = parseInt(full.slice(0, 2), 16) / 255;
  const g = parseInt(full.slice(2, 4), 16) / 255;
  const b = parseInt(full.slice(4, 6), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const sat = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  const h =
    max === r
      ? ((g - b) / d + (g < b ? 6 : 0)) / 6
      : max === g
        ? ((b - r) / d + 2) / 6
        : ((r - g) / d + 4) / 6;
  return [h, sat, l];
}

function hslToHex(h: number, sat: number, l: number): string {
  const hue2rgb = (p: number, q: number, t: number) => {
    let x = t;
    if (x < 0) x += 1;
    if (x > 1) x -= 1;
    if (x < 1 / 6) return p + (q - p) * 6 * x;
    if (x < 1 / 2) return q;
    if (x < 2 / 3) return p + (q - p) * (2 / 3 - x) * 6;
    return p;
  };
  const q = l < 0.5 ? l * (1 + sat) : l + sat - l * sat;
  const p = 2 * l - q;
  const channel = (t: number) =>
    Math.round(hue2rgb(p, q, t) * 255)
      .toString(16)
      .padStart(2, '0');
  return `#${channel(h + 1 / 3)}${channel(h)}${channel(h - 1 / 3)}`;
}

/**
 * 由 8 档基色派生分类色板：各环按明度交替提亮/压暗（暗色主题先提亮，亮色主题先压暗），
 * 同一色相的各档明度差可读，系列顺序固定、不循环取色。
 */
export function extendDataPalette(
  base: string[],
  mode: 'light' | 'dark',
  rings = CHART_PALETTE_RINGS
): string[] {
  const steps = [0, 0.16, -0.14, 0.3, -0.26, 0.42, -0.36];
  const shifts = steps.slice(0, rings).map((step) => (mode === 'dark' ? step : -step));
  const out: string[] = [];
  for (let ring = 0; ring < rings; ring += 1) {
    const shift = shifts[ring] ?? 0;
    for (const color of base) {
      if (shift === 0 || !/^#[0-9a-f]{3,6}$/i.test(color)) {
        out.push(color);
        continue;
      }
      const [h, sat, l] = hexToHsl(color);
      out.push(hslToHex(h, sat, Math.min(0.92, Math.max(0.12, l + shift))));
    }
  }
  return out;
}

const readDataPalette = () => [
  readCssColorToken('--ds-color-data-1'),
  readCssColorToken('--ds-color-data-2'),
  readCssColorToken('--ds-color-data-3'),
  readCssColorToken('--ds-color-data-4'),
  readCssColorToken('--ds-color-data-5'),
  readCssColorToken('--ds-color-data-6'),
  readCssColorToken('--ds-color-data-7'),
  readCssColorToken('--ds-color-data-8'),
];

export type ChartColors = Record<(typeof SEMANTIC_KEYS)[number], string> & {
  /** 当前主题的 8 档分类基色（--ds-color-data-1..8）。 */
  data: string[];
  /** 基色派生的 40 档分类色（主题 color 列表），系列按固定顺序取色。 */
  dataExtended: string[];
};

const toCssKey = (key: string) => key.replace(/[A-Z]/g, (char) => `-${char.toLowerCase()}`);

/**
 * ECharts 画布无法解析 CSS 变量，图表语义色与分类色板统一从这里按当前主题读取字面量；
 * 模式切换时重新求值并重建图表主题。
 */
export function useChartColors(): ChartColors {
  const mode = useThemeStore((s) => s.mode);
  return useMemo(
    () => ({
      ...(Object.fromEntries(
        SEMANTIC_KEYS.map((key) => [key, readCssColorToken(`--ds-color-${toCssKey(key)}`)])
      ) as Record<(typeof SEMANTIC_KEYS)[number], string>),
      data: readDataPalette(),
      dataExtended: extendDataPalette(readDataPalette(), mode),
    }),
    [mode]
  );
}
