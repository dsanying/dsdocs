import { CheckOutlined, CopyOutlined } from '@ant-design/icons';
import type { CSSProperties, KeyboardEvent, MouseEvent, ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

import { Tooltip } from './Tooltip';
import { useCopyToClipboard } from './useCopyToClipboard';

import './CopyableValue.css';

export type CopyableValueProps = {
  /** 实际写入剪贴板的原值。 */
  text: string;
  /** 可见内容；缺省直接显示原值。传函数可根据已复制态让内部截断 Tooltip 让位。 */
  children?: ReactNode | ((state: { copied: boolean }) => ReactNode);
  /** 独占一行的长值（明文密钥、规则预览）用 block；表格单元与字段值用默认 inline。 */
  block?: boolean;
  className?: string;
  style?: CSSProperties;
};

/**
 * 可复制信息的统一入口：整块区域点击即复制，前置复制图标只作可复制提示，
 * 成功后短暂切换为已复制态，失败经共享通知反馈。
 */
export function CopyableValue({
  text,
  children,
  block = false,
  className,
  style,
}: CopyableValueProps) {
  const { t } = useTranslation();
  const { copy, copied } = useCopyToClipboard();
  const label = t('common.copy.hint');
  const copiedLabel = t('common.copy.copied');

  const handleClick = (event: MouseEvent<HTMLSpanElement>) => {
    event.stopPropagation();
    void copy(text);
  };
  const handleKeyDown = (event: KeyboardEvent<HTMLSpanElement>) => {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    event.preventDefault();
    void copy(text);
  };

  return (
    <Tooltip title={copiedLabel} open={copied}>
      <span
        role="button"
        tabIndex={0}
        aria-label={label}
        data-copied={copied ? 'true' : undefined}
        className={['ds-copyable', block ? 'ds-copyable--block' : undefined, className]
          .filter(Boolean)
          .join(' ')}
        style={style}
        onClick={handleClick}
        onKeyDown={handleKeyDown}
      >
        <span className="ds-copyable__icon" aria-hidden="true">
          {copied ? <CheckOutlined /> : <CopyOutlined />}
        </span>
        <span className="ds-copyable__content">
          {typeof children === 'function' ? children({ copied }) : (children ?? text)}
        </span>
      </span>
    </Tooltip>
  );
}
