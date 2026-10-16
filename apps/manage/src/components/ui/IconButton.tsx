import { Button, type ButtonProps } from 'antd';
import type { ReactNode } from 'react';

export type IconButtonProps = Omit<
  ButtonProps,
  'aria-label' | 'aria-labelledby' | 'children' | 'icon'
> & {
  /** 按钮的可访问名称；悬停 / 键盘聚焦时由全局 IconLabelHint 显示为提示。 */
  label: string;
  icon: ReactNode;
};

/**
 * 纯图标操作的统一入口：label 是可访问名称，悬停 / 键盘聚焦时由全局 IconLabelHint 显示同一文字，
 * 页面不再给图标按钮各自挂 Tooltip。
 */
export function IconButton({ label, ...buttonProps }: IconButtonProps) {
  return <Button {...buttonProps} aria-label={label} />;
}
