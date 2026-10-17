import { useEffect } from 'react';
import { useRoutes } from 'react-router';
import { QuestionCircleOutlined } from '@ant-design/icons';
import { ConfigProvider, App as AntdApp } from 'antd';
import { useTranslation } from 'react-i18next';
import zhCN from 'antd/locale/zh_CN';
import enUS from 'antd/locale/en_US';
import type { Locale } from 'antd/es/locale';
import { AccessLayout } from '@/layouts/AccessLayout';
import { routes } from '@/routes';
import { buildThemeConfig } from '@/config/theme';
import { useThemeStore } from '@/stores/useThemeStore';
import { modalDefaults, notificationDefaults, IconLabelHint } from '@/components/ui';
import { setStaticInstances } from '@/utils/antdStatic';

const normalizeAntdLocale = (localeModule: Locale | { default: Locale }) =>
  'default' in localeModule ? localeModule.default : localeModule;

/**
 * 输入控件不使用 placeholder：递归把 Ant locale 里所有 *placeholder* 文案置空
 * （DatePicker/TimePicker 的起止占位、Transfer/Table 的搜索占位等），
 * 让业务代码与框架默认值遵循同一口径，不再逐控件覆写。
 */
function silenceLocalePlaceholders<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map((item) =>
      typeof item === 'string' ? '' : silenceLocalePlaceholders(item)
    ) as T;
  }
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, entry]) => {
        if (/placeholder/i.test(key)) {
          return [
            key,
            typeof entry === 'string' ? '' : Array.isArray(entry) ? entry.map(() => '') : entry,
          ];
        }
        return [key, silenceLocalePlaceholders(entry)];
      })
    ) as T;
  }
  return value;
}

const antdLocaleMap: Record<string, Locale> = {
  'zh-CN': silenceLocalePlaceholders(normalizeAntdLocale(zhCN)),
  'en-US': silenceLocalePlaceholders(normalizeAntdLocale(enUS)),
};

/**
 * 桥接组件：从 AntdApp context 拿到 contextual notification，
 * 注入到 @/utils/antdStatic 模块的 module-level 单例。
 * 这样非组件代码可以静态调用而不警告。
 */
const AntdStaticBridge: React.FC = () => {
  const { notification } = AntdApp.useApp();
  useEffect(() => {
    setStaticInstances({ notification });
  }, [notification]);
  return null;
};

/**
 * 根组件 — 包含 ConfigProvider、i18n locale 切换、路由渲染
 */
export function App() {
  const { i18n } = useTranslation();
  const themeMode = useThemeStore((s) => s.mode);
  const antdLocale = antdLocaleMap[i18n.language] ?? antdLocaleMap['zh-CN'];
  const routeElements = useRoutes(routes);

  return (
    <ConfigProvider
      locale={antdLocale}
      theme={buildThemeConfig(themeMode)}
      // Modal 的确定/取消与页面动作同为“图标 + 文字”，窄屏一起收成仅图标；
      // Popconfirm 不支持全局注入，由 components/ui 的 Popconfirm 包装完成。
      modal={modalDefaults}
      // 候选面板跟随控件并限制在视口内；超长候选只在自己的文字槽位滚动。
      popupMatchSelectWidth
      // 字段说明问号是装饰图标：不让 Ant 默认的 aria-label "question-circle" 混进字段的可访问名称
      form={{
        tooltip: {
          icon: <QuestionCircleOutlined aria-hidden />,
          classNames: { root: 'ds-tooltip', container: 'ds-tooltip__container' },
          align: { overflow: { adjustX: true, adjustY: true, shiftX: true } },
        },
      }}
      // 候选项与已选标签完整展开（components/ui/select.css）：不省略、不折叠成 +N
      select={{
        classNames: {
          content: 'ds-select-content',
          itemContent: 'ds-select-tag-content',
          popup: { listItem: 'ds-select-option' },
        },
      }}
    >
      <AntdApp
        notification={{
          ...notificationDefaults,
          duration: 3,
          placement: 'topRight',
          showProgress: true,
          stack: { threshold: 2 },
        }}
      >
        <AntdStaticBridge />
        {/* 只剩图标的按钮 / 链接：悬停或键盘聚焦显示被隐藏的文字（全站一处） */}
        <IconLabelHint />
        <AccessLayout>{routeElements}</AccessLayout>
      </AntdApp>
    </ConfigProvider>
  );
}
