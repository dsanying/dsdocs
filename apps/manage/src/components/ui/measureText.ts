let canvas: HTMLCanvasElement | null = null;

/** 用画布量文本的渲染宽度（px）；无 DOM 环境时按每字 0.6em 估算。 */
export function measureTextWidth(text: string, font: string): number {
  if (typeof document === 'undefined') return text.length * 9;
  canvas ??= document.createElement('canvas');
  const context = canvas.getContext('2d');
  if (!context) return text.length * 9;
  context.font = font;
  return context.measureText(text).width;
}

/** 读取元素当前生效的 CSS font 简写，供画布测量用。 */
export function readBodyFont(): string {
  if (typeof document === 'undefined') return '16px sans-serif';
  const style = getComputedStyle(document.body);
  return `${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
}

/** 下拉面板按最长候选文字量出的宽度（含候选项内边距与选中勾图标），供 popupMatchSelectWidth 使用。 */
export function measureOptionsWidth(labels: readonly string[], chrome = 56, min = 120): number {
  const font = readBodyFont();
  const longest = labels.reduce((max, label) => Math.max(max, measureTextWidth(label, font)), 0);
  return Math.max(min, Math.ceil(longest + chrome));
}
