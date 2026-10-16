import { MoonOutlined, SunOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import { IconButton } from '@/components/ui';
import { useThemeStore } from '@/stores/useThemeStore';

/** 应用壳的亮暗主题切换入口，与语言切换同处头部操作区。 */
const ThemeToggle: React.FC = () => {
  const { t } = useTranslation();
  const mode = useThemeStore((s) => s.mode);
  const toggle = useThemeStore((s) => s.toggle);
  const isDark = mode === 'dark';
  return (
    <IconButton
      key="ThemeToggle"
      type="text"
      label={t('common.theme.toggle')}
      icon={isDark ? <SunOutlined /> : <MoonOutlined />}
      onClick={toggle}
      aria-pressed={isDark}
    />
  );
};

export default ThemeToggle;
