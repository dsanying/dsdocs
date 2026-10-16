/**
 * 前端唯一设计标度（JS 侧）。
 *
 * 颜色以 src/design/tokens.css 为唯一来源（亮色 :root、暗色 [data-theme="dark"]），
 * 本文件只保留尺寸、字体、布局与两种模式共用的图表数据色板；
 * 页面不得再声明私有颜色、字号、圆角、间距或阴影标度。
 */
export type ThemeMode = 'light' | 'dark';

export const designTokens = {
  color: {
    /**
     * 图表分类色板（亮色档位，与 tokens.css 的 --ds-color-data-1..8 同源；暗色档位只在 CSS 里）：
     * 8 档基色固定顺序，运行时派生 40 档分类色，展示全部系列。运行时图表经 useChartColors 读 CSS 变量取当前主题档位。
     */
    data: ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300', '#4a3aa7', '#e34948'],
  },
  font: {
    family:
      '"IBM Plex Sans", "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", system-ui, sans-serif',
    mono: '"IBM Plex Mono", "SFMono-Regular", Consolas, "Liberation Mono", monospace',
    sizeXs: 12,
    sizeBody: 14,
    sizeLg: 16,
    sizeTitle: 20,
    sizePageTitle: 24,
    sizeMetric: 28,
  },
  radius: { xs: 4, md: 8, lg: 12 },
  space: { xxs: 2, xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32, xxxl: 40 },
  control: { heightSm: 24, height: 32, heightLg: 40 },
  /** CSS 只使用 compact/narrow/mobile 三档；JS 行为判断必须引用同一数值。 */
  breakpoint: { compact: 480, narrow: 640, mobile: 768 },
  layout: {
    siderWidth: 240,
    headerHeight: 60,
    contentMaxWidth: 1600,
    detailAsideWidth: 200,
    controlWidth: 320,
    /** 查询条里自由文本/日期控件的宽度；下拉按最长选项自适应。 */
    queryControlWidth: 240,
    wideControlWidth: 420,
    /** 新建 / 编辑抽屉（DrawerForm）的统一宽度；页面不再各自指定。 */
    drawerWidth: 520,
    scrollRegionMaxHeight: 300,
    /** 集合（InlineList）/长文本（LongText）列的列宽；内容在列宽内左右滚动。 */
    longColumnWidth: 420,
  },
  motion: { fast: '120ms', normal: '200ms' },
} as const;

let colorProbe: HTMLSpanElement | undefined;

const toHex = (channel: number) =>
  Math.round(Math.min(255, Math.max(0, channel)))
    .toString(16)
    .padStart(2, '0');

/** 把浏览器计算出的颜色（rgb()/rgba() 或 color(srgb …)）归一为 #rrggbb；带透明度时为 rgba()。 */
export function normalizeComputedColor(value: string): string | undefined {
  const rgb = value.match(/^rgba?\(([^)]+)\)$/);
  const srgb = value.match(/^color\(srgb\s+([^)]+)\)$/);
  let channels: number[];
  let alpha = 1;
  if (rgb) {
    const parts = rgb[1]
      .split(/[\s,/]+/)
      .filter(Boolean)
      .map(Number);
    channels = parts.slice(0, 3);
    if (parts.length > 3) alpha = parts[3];
  } else if (srgb) {
    const parts = srgb[1]
      .split(/[\s/]+/)
      .filter(Boolean)
      .map(Number);
    channels = parts.slice(0, 3).map((part) => part * 255);
    if (parts.length > 3) alpha = parts[3];
  } else {
    return undefined;
  }
  if (channels.length !== 3 || channels.some(Number.isNaN)) return undefined;
  if (alpha < 1)
    return `rgba(${channels.map((channel) => Math.round(channel)).join(', ')}, ${alpha})`;
  return `#${channels.map(toHex).join('')}`;
}

/**
 * 运行时从 CSS 变量读取当前主题的语义色，供 Ant 主题、图表与编辑器主题的字面量派生。
 * 品牌派生色写成 color-mix(var(...)) 表达式，getPropertyValue 只拿到未解析的表达式（ECharts、Monaco 都不认，
 * 会画成透明），因此交给浏览器在探针元素上解析成实际颜色再归一为十六进制。
 */
export function readCssColorToken(name: string): string {
  const raw = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  if (!raw || /^#[0-9a-f]{3,8}$/i.test(raw)) return raw;
  colorProbe ??= Object.assign(document.createElement('span'), { hidden: true });
  if (!colorProbe.isConnected) document.documentElement.append(colorProbe);
  colorProbe.style.color = `var(${name})`;
  return normalizeComputedColor(getComputedStyle(colorProbe).color) ?? raw;
}

/**
 * 把运行时颜色向某个 CSS 变量混合一档：图表分类色直接作图标/徽章前景时对比度不足，
 * 向当前主题文字色（--ds-color-text）混合后亮色主题变深、暗色变亮，仍与图表色系同源。
 */
export function mixCssColor(color: string, weightPercent: number, mixToken: string): string {
  if (typeof document === 'undefined') return color;
  colorProbe ??= Object.assign(document.createElement('span'), { hidden: true });
  if (!colorProbe.isConnected) document.documentElement.append(colorProbe);
  colorProbe.style.color = `color-mix(in srgb, ${color} ${weightPercent}%, var(${mixToken}))`;
  return normalizeComputedColor(getComputedStyle(colorProbe).color) ?? color;
}
