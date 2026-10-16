import i18n from '@/i18n';
import type { SupportedLanguage, TranslationKey } from '@/i18n';

/**
 * 双语内容种子：同一个键在两种语言字典里的值，同时取出作为 {zh, en} 内容对。
 * 用于通知页面等“内容本身分中英文字段”的默认值，避免为每种语言各存一份键。
 */
export function bilingualText(key: TranslationKey): { zh: string; en: string } {
  const pick = (language: SupportedLanguage) => i18n.getFixedT(language)(key);
  return { zh: pick('zh-CN'), en: pick('en-US') };
}
