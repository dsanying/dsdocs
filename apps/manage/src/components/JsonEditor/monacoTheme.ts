import * as monaco from 'monaco-editor/editor/editor.api.js';

/** 与设计 token 同源的编辑器主题名：随亮暗模式切换。 */
export const MONACO_THEME_NAMES = { light: 'dsdocs-light', dark: 'dsdocs-dark' } as const;

/**
 * 用当前 CSS 变量定义 Monaco 主题：画布/文字/选中/当前行全部来自 tokens.css，
 * 语法只用前景层级区分，不引入第二套调色板。每次模式切换后重新定义以读到新值。
 */
/** 生产 CSS 会把 #000000 压缩成 #000，Monaco 只接受六位十六进制。 */
function normalizeHex(value: string): string {
  const hex = value.trim();
  const short = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/i.exec(hex);
  return short ? `#${short[1]}${short[1]}${short[2]}${short[2]}${short[3]}${short[3]}` : hex;
}

export function defineMonacoThemes(readToken: (name: string) => string) {
  const read = (name: string) => normalizeHex(readToken(name));
  const surface = read('--ds-color-surface');
  const text = read('--ds-color-text');
  const textSecondary = read('--ds-color-text-secondary');
  const textTertiary = read('--ds-color-text-tertiary');
  const subtle = read('--ds-color-surface-subtle');
  const infoSurface = read('--ds-color-info-surface');
  const border = read('--ds-color-border');
  for (const [mode, base] of [
    ['light', 'vs'],
    ['dark', 'vs-dark'],
  ] as const) {
    monaco.editor.defineTheme(MONACO_THEME_NAMES[mode], {
      base,
      inherit: false,
      rules: [
        { token: '', foreground: text.slice(1) },
        { token: 'string.key.json', foreground: text.slice(1), fontStyle: 'bold' },
        { token: 'string.value.json', foreground: textSecondary.slice(1) },
        { token: 'number', foreground: textSecondary.slice(1) },
        { token: 'keyword', foreground: textSecondary.slice(1) },
        { token: 'delimiter', foreground: textTertiary.slice(1) },
        { token: 'comment', foreground: textTertiary.slice(1), fontStyle: 'italic' },
      ],
      colors: {
        'editor.background': surface,
        'editor.foreground': text,
        'editorCursor.foreground': text,
        'editor.lineHighlightBackground': subtle,
        'editor.selectionBackground': infoSurface,
        'editor.inactiveSelectionBackground': subtle,
        'editorWidget.background': surface,
        'editorWidget.border': border,
        'scrollbarSlider.background': border,
        'scrollbarSlider.hoverBackground': border,
        'scrollbarSlider.activeBackground': border,
      },
    });
  }
}
