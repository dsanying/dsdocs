import type { EditorProps } from '@monaco-editor/react';
import { lazy, Suspense, useEffect, useState, type CSSProperties, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

import { LazyBoundary, LoadingState } from '@/components/ui';
import { designTokens, readCssColorToken } from '@/design/tokens';
import { useThemeStore } from '@/stores/useThemeStore';

import './style.css';

const MonacoEditor = lazy(() => import('./MonacoEditor'));
const loadMonacoThemes = () => import('./monacoTheme');

export type JsonEditorProps = {
  value?: string;
  onChange?: (value: string | undefined) => void;
  onValidate?: EditorProps['onValidate'];
  height?: CSSProperties['height'];
  error?: ReactNode;
  readOnly?: boolean;
  ariaLabel?: string;
};

const editorOptions: NonNullable<EditorProps['options']> = {
  minimap: { enabled: false },
  scrollBeyondLastLine: false,
  fontSize: designTokens.font.sizeXs,
  wordWrap: 'on',
  automaticLayout: true,
  formatOnPaste: true,
  formatOnType: true,
  lineNumbers: 'off',
  glyphMargin: false,
  folding: false,
  lineDecorationsWidth: 0,
  lineNumbersMinChars: 0,
  overviewRulerLanes: 0,
  overviewRulerBorder: false,
  hideCursorInOverviewRuler: true,
  scrollbar: {
    vertical: 'visible',
    horizontal: 'visible',
    useShadows: false,
    verticalHasArrows: false,
    horizontalHasArrows: false,
    // Monaco 自绘滚动条不吃页面 CSS，与共享 scrollbar.css 的 WebKit 2px 档对齐
    verticalScrollbarSize: designTokens.space.xxs,
    horizontalScrollbarSize: designTokens.space.xxs,
  },
  tabSize: 2,
  insertSpaces: true,
};

/** JSON 文本编辑唯一入口；Monaco 只在组件实际挂载时加载。 */
export function JsonEditor({
  value,
  onChange,
  onValidate,
  height = 200,
  error,
  readOnly = false,
  ariaLabel,
}: JsonEditorProps) {
  const { t } = useTranslation();
  const mode = useThemeStore((s) => s.mode);
  const loadingLabel = t('components.jsonEditor.loading');
  // 主题名随模式即时切换；主题定义在运行时模块就绪后用当前 CSS 变量重建。
  const [themeName, setThemeName] = useState<string>();
  useEffect(() => {
    let cancelled = false;
    // 主题定义加载失败不阻断编辑器：边界管 Monaco 主模块，主题退回内置 vs/vs-dark
    void loadMonacoThemes()
      .then((module) => {
        if (cancelled) return;
        module.defineMonacoThemes(readCssColorToken);
        setThemeName(module.MONACO_THEME_NAMES[mode]);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [mode]);

  return (
    <div
      className={['ds-json-editor', error ? 'ds-json-editor--error' : undefined]
        .filter(Boolean)
        .join(' ')}
    >
      <LazyBoundary>
        <Suspense fallback={<LoadingState variant="inline" label={loadingLabel} />}>
          <MonacoEditor
            height={height}
            language="json"
            theme={themeName ?? (mode === 'dark' ? 'vs-dark' : 'vs')}
            value={value ?? ''}
            onChange={onChange}
            onValidate={onValidate}
            loading={<LoadingState variant="inline" label={loadingLabel} />}
            options={{ ...editorOptions, readOnly }}
            wrapperProps={ariaLabel ? { 'aria-label': ariaLabel } : undefined}
          />
        </Suspense>
      </LazyBoundary>
      {error ? (
        <div className="ds-json-editor__error" role="alert">
          {error}
        </div>
      ) : null}
    </div>
  );
}
