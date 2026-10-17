import i18n, { type TFunction, type ParseKeys } from 'i18next';
import { initReactI18next } from 'react-i18next';
import dayjs from 'dayjs';
import 'dayjs/locale/zh-cn.js';
import 'dayjs/locale/en.js';
import zhCN from './locales/zh-CN.json';
import enUS from './locales/en-US.json';

/** 语言偏好的持久化键，应用壳语言控件与检测顺序共用。 */
export const LANGUAGE_STORAGE_KEY = 'dsdocs-lang';

const SUPPORTED_LANGUAGES = ['zh-CN', 'en-US'] as const;
export type SupportedLanguage = (typeof SUPPORTED_LANGUAGES)[number];

function normalizeLanguage(candidate: string | null | undefined): SupportedLanguage | undefined {
  if (!candidate) return undefined;
  const lower = candidate.toLowerCase();
  return SUPPORTED_LANGUAGES.find(
    (lang) => lower === lang.toLowerCase() || lower.startsWith(lang.slice(0, 2).toLowerCase())
  );
}

/** 页面元数据（html lang）与可见 UI 使用同一已规范化语言。 */
export function syncDocumentLanguage(language: string | undefined): void {
  if (typeof document !== 'undefined')
    document.documentElement.lang = normalizeLanguage(language) ?? 'zh-CN';
}

/** 按 localStorage → navigator → htmlTag 的顺序检测初始语言，只接受受支持的语言集合。 */
export function detectLanguage(): SupportedLanguage {
  if (typeof window === 'undefined') return 'zh-CN';
  let stored: string | null;
  try {
    stored = window.localStorage.getItem(LANGUAGE_STORAGE_KEY);
  } catch {
    stored = null;
  }
  return (
    normalizeLanguage(stored) ??
    (window.navigator.languages ?? [window.navigator.language])
      .map(normalizeLanguage)
      .find((language) => language !== undefined) ??
    normalizeLanguage(document.documentElement.lang) ??
    'zh-CN'
  );
}

/**
 * 文案排版后处理器（字典只负责词条与拼接，排版细节统一在这里）：
 * - 句首大写：英文词条在字典里统一小写以便拼接，最终展示时首字母大写；句中大小写以字典为准；
 * - 中西文间距：汉字与拉丁字母/数字相邻处补一个空格（拼接产生的 "同步ID" → "同步 ID"），中文不受其它影响。
 */
const typeset = {
  type: 'postProcessor' as const,
  name: 'typeset',
  process: (value: string) => {
    if (typeof value !== 'string' || !value) return value;
    const spaced = value
      .replace(/(\p{Script=Han})([A-Za-z0-9])/gu, '$1 $2')
      .replace(/([A-Za-z0-9%])(\p{Script=Han})/gu, '$1 $2');
    return spaced.charAt(0).toUpperCase() + spaced.slice(1);
  },
};

i18n
  .use(initReactI18next)
  .use(typeset)
  .init({
    postProcess: ['typeset'],
    resources: {
      'zh-CN': { translation: zhCN },
      'en-US': { translation: enUS },
    },
    lng: detectLanguage(),
    fallbackLng: 'zh-CN',
    supportedLngs: [...SUPPORTED_LANGUAGES],
    interpolation: {
      escapeValue: false,
      // 支持单大括号占位符 {name}，
      // 而不是 i18next 默认的双大括号 {{name}}。
      // 所有从 admin 搬来的文案都是 ICU 风，统一这里。
      prefix: '{',
      suffix: '}',
    },
    // JSON 是嵌套结构，沿用 i18next 默认的 keySeparator: "." 即可。
    // 父子冲突（如 menu.home 同时是分类标题和有子菜单）通过 _self 约定处理：
    // 冲突的父值放在 X._self 节点。详见 i18n-flatten-to-nested.mjs 转换脚本。
  });

/** 当前翻译命名空间的合法叶子键，供动态键来源与共享包装器复用。 */
export type TranslationKey = ParseKeys<'translation'>;

/**
 * 取一段用于再拼接的文案片段：跳过句首大写后处理，由外层模板（t(template, { object: tFragment(...) })）
 * 统一决定最终大小写。片段不得直接展示。
 */
export function tFragment(
  key: TranslationKey,
  options?: Record<string, unknown>,
  translator: TFunction = i18n.t
): string {
  return translator(key, { ...(options ?? {}), applyPostProcessor: false });
}

// 日期库的月份、星期和相对时间，与页面元数据使用同一已规范化语言。
function syncUiLanguage(language: string | undefined): void {
  const normalized = normalizeLanguage(language) ?? 'zh-CN';
  dayjs.locale(normalized === 'en-US' ? 'en' : 'zh-cn');
  syncDocumentLanguage(normalized);
}

// 语言切换只经 i18n.changeLanguage；日期库、页面元数据和持久化与可见语言同源。
syncUiLanguage(i18n.resolvedLanguage ?? i18n.language);
i18n.on('languageChanged', (lang) => {
  syncUiLanguage(lang);
  try {
    window.localStorage.setItem(LANGUAGE_STORAGE_KEY, lang);
  } catch {
    // 隐私模式等不可写存储时保持内存语言即可。
  }
});

export default i18n;

/** 按当前语言把若干词项连成一个并列列表（“甲、乙、丙” / “a, b, c”），由浏览器内置 Intl.ListFormat 决定分隔符。 */
export function formatList(
  items: readonly string[],
  type: 'conjunction' | 'disjunction' = 'conjunction'
): string {
  return new Intl.ListFormat(i18n.language, { style: 'narrow', type }).format(items);
}
