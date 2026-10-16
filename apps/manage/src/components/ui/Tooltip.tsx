import { Tooltip as AntTooltip, type TooltipProps as AntTooltipProps } from 'antd';

import './Tooltip.css';

function joinClassNames(...values: Array<string | undefined>) {
  return values.filter(Boolean).join(' ');
}

/**
 * 短提示的统一入口。
 *
 * 只用于图标操作、短帮助和其他单行短名称；需要持续阅读的内容应放在
 * 可见正文、Alert 或主动展开的 Popover / Drawer 中。
 */
export function Tooltip({ classNames, ...props }: AntTooltipProps) {
  return (
    <AntTooltip
      {...props}
      classNames={(info) => {
        const resolved = typeof classNames === 'function' ? classNames(info) : classNames;
        return {
          ...resolved,
          root: joinClassNames('ds-tooltip', resolved?.root),
          container: joinClassNames('ds-tooltip__container', resolved?.container),
        };
      }}
    />
  );
}

export type TooltipProps = AntTooltipProps;
