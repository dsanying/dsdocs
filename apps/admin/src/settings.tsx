import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { App, ConfigProvider, theme } from 'antd';
import zhCN from 'antd/locale/zh_CN';
import enUS from 'antd/locale/en_US';
import { useText } from './i18n';
type Preference = 'system' | 'light' | 'dark';
const Context = createContext<{
  mode: 'light' | 'dark';
  preference: Preference;
  setPreference: (value: Preference) => void;
}>({ mode: 'light', preference: 'system', setPreference: () => {} });
export const useSettings = () => useContext(Context);
export function Settings({ children }: { children: ReactNode }) {
  const { locale } = useText(),
    [preference, set] = useState<Preference>(() => {
      try {
        const saved = localStorage.getItem('dsdocs-admin-theme');
        if (saved === 'dark' || saved === 'light') return saved;
      } catch {
        /* Optional preference. */
      }
      return 'system';
    }),
    [systemDark, setSystemDark] = useState(
      () => matchMedia('(prefers-color-scheme: dark)').matches
    );
  const mode = preference === 'system' ? (systemDark ? 'dark' : 'light') : preference;
  useEffect(() => {
    const query = matchMedia('(prefers-color-scheme: dark)'),
      update = () => setSystemDark(query.matches);
    query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  }, []);
  useEffect(() => {
    document.documentElement.dataset.theme = mode;
    document.documentElement.style.colorScheme = mode;
  }, [mode]);
  function setPreference(value: Preference) {
    set(value);
    try {
      localStorage.setItem('dsdocs-admin-theme', value);
    } catch {
      /* Optional preference. */
    }
  }
  const config = useMemo(
    () => ({
      algorithm: mode === 'dark' ? theme.darkAlgorithm : theme.defaultAlgorithm,
      token: {
        colorPrimary: '#1677ff',
        fontSize: 14,
        controlHeight: 32,
        borderRadius: 6,
        fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      },
    }),
    [mode]
  );
  return (
    <Context.Provider value={{ mode, preference, setPreference }}>
      <ConfigProvider locale={locale === 'zh' ? zhCN : enUS} theme={config}>
        <App notification={{ placement: 'topRight', duration: 3 }}>{children}</App>
      </ConfigProvider>
    </Context.Provider>
  );
}
