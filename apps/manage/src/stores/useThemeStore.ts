import { create } from 'zustand';
import { readCssColorToken, type ThemeMode } from '@/design/tokens';

export const THEME_STORAGE_KEY = 'dsdocs-theme';

/** 用户偏好三态：跟随系统或显式亮暗。 */
export type ThemePreference = 'system' | 'light' | 'dark';

export function resolveThemeMode(preference: ThemePreference, systemDark: boolean): ThemeMode {
  return preference === 'system' ? (systemDark ? 'dark' : 'light') : preference;
}

export function readPersistedThemePreference(): ThemePreference {
  try {
    const saved = localStorage.getItem(THEME_STORAGE_KEY);
    return saved === 'light' || saved === 'dark' || saved === 'system' ? saved : 'system';
  } catch {
    return 'system';
  }
}

/** 把生效主题应用到 DOM：data-theme、color-scheme、根色与移动端地址栏色。 */
export function applyThemeMode(mode: ThemeMode) {
  const root = document.documentElement;
  root.dataset.theme = mode;
  root.style.colorScheme = mode;
  root.classList.toggle('dark', mode === 'dark');
  root.classList.toggle('light', mode === 'light');
  root.style.color = `var(--ds-color-text)`;
  root.style.backgroundColor = `var(--ds-color-canvas)`;
  document
    .querySelector<HTMLMetaElement>('meta[name="theme-color"]')
    ?.setAttribute('content', readCssColorToken('--ds-color-canvas'));
}

function systemPrefersDark(): boolean {
  return window.matchMedia('(prefers-color-scheme: dark)').matches;
}

/** 在 React 挂载前应用持久化偏好，避免首帧主题闪变。 */
export function bootstrapPersistedTheme() {
  applyThemeMode(resolveThemeMode(readPersistedThemePreference(), systemPrefersDark()));
}

interface ThemeState {
  preference: ThemePreference;
  /** 偏好解析后的生效主题，驱动 Ant 主题与图表重绘。 */
  mode: ThemeMode;
  setPreference: (preference: ThemePreference) => void;
  /** 按钮在生效亮暗间直接切换。 */
  toggle: () => void;
}

export const useThemeStore = create<ThemeState>((set) => ({
  preference: readPersistedThemePreference(),
  mode: resolveThemeMode(readPersistedThemePreference(), systemPrefersDark()),
  setPreference: (preference) => {
    try {
      localStorage.setItem(THEME_STORAGE_KEY, preference);
    } catch {
      // 隐私模式等场景下持久化失败不阻断切换。
    }
    applyThemeMode(resolveThemeMode(preference, systemPrefersDark()));
    set({ preference, mode: resolveThemeMode(preference, systemPrefersDark()) });
  },
  toggle: () => {
    const next = useThemeStore.getState().mode === 'dark' ? 'light' : 'dark';
    useThemeStore.getState().setPreference(next);
  },
}));

if (typeof window !== 'undefined') {
  // 偏好为 system 时实时跟随系统亮暗变化。
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (event) => {
    const { preference } = useThemeStore.getState();
    const mode = resolveThemeMode(preference, event.matches);
    applyThemeMode(mode);
    useThemeStore.setState({ mode });
  });
  // 跨标签页同步：其他标签写入 localStorage 时跟随切换。
  window.addEventListener('storage', (event) => {
    if (event.key !== THEME_STORAGE_KEY || !event.newValue) return;
    const preference = readPersistedThemePreference();
    const mode = resolveThemeMode(preference, systemPrefersDark());
    applyThemeMode(mode);
    useThemeStore.setState({ preference, mode });
  });
}
