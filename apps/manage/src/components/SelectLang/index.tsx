import { GlobalOutlined } from '@ant-design/icons';
import { Button } from 'antd';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import type { SupportedLanguage } from '@/i18n';

/** 语言用它自己的写法称呼：传入的 t 是目标语言的翻译函数（getFixedT），不是当前界面的。 */
function nativeLanguageName(t: TFunction, language: SupportedLanguage): string {
  return language === 'zh-CN' ? t('common.vocab.chinese') : t('common.language.short.enUS');
}

/**
 * 语言切换：只有中英两种，所以不用分段选择器（点选中项不会切换，还要额外一个框占位），
 * 直接一个无边框按钮——写着“切过去的那种语言”，点一下就切，和旁边的主题按钮同一排。
 * 按钮文字用目标语言自己的写法（英文界面显示“中文”，中文界面显示“EN”），
 * 看不懂当前界面语言的人也认得出来：用目标语言的翻译函数取它自己的名称，并标上 lang 供读屏按该语言朗读。
 * 侧栏折叠（compact）时只剩地球图标。
 */
const SelectLang: React.FC<{ compact?: boolean }> = ({ compact = false }) => {
  const { i18n, t } = useTranslation();
  const other: SupportedLanguage = i18n.language === 'en-US' ? 'zh-CN' : 'en-US';
  const nativeName = nativeLanguageName(i18n.getFixedT(other), other);
  return (
    <Button
      type="text"
      size="small"
      icon={<GlobalOutlined />}
      aria-label={t('common.language.switch')}
      onClick={() => void i18n.changeLanguage(other)}
    >
      {/* 侧栏折叠时文字视觉隐藏（仍是可读的内容），悬停 / 聚焦由全局 IconLabelHint 显示 */}
      <span lang={other} className={compact ? 'ds-visually-hidden' : undefined}>
        {nativeName}
      </span>
    </Button>
  );
};

export default SelectLang;
