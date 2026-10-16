import type { HTMLAttributes, ReactNode } from 'react';

import './ScrollRegion.css';

export type ScrollRegionProps = Omit<HTMLAttributes<HTMLDivElement>, 'aria-label' | 'children'> & {
  label: string;
  axis?: 'x' | 'y' | 'both';
  children: ReactNode;
};

/** 代码、日志及其他必须保留关系的内容的统一局部滚动边界。 */
export function ScrollRegion({
  label,
  axis = 'both',
  className,
  children,
  ...props
}: ScrollRegionProps) {
  return (
    <div
      {...props}
      aria-label={label}
      className={['ds-scroll-region', `ds-scroll-region--${axis}`, className]
        .filter(Boolean)
        .join(' ')}
      data-scroll-region={axis}
      role="region"
      tabIndex={0}
    >
      {children}
    </div>
  );
}
