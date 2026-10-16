import type { HTMLAttributes, ReactNode } from 'react';
import { ScrollRegion } from './ScrollRegion';
import './ViewportFrame.css';

/** 应用壳占据视口；子区负责滚动，不把长内容传播到页面根。 */
export function ViewportFrame({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div {...props} className={['ds-viewport-frame', className].filter(Boolean).join(' ')} />;
}
export type SidebarFrameProps = HTMLAttributes<HTMLDivElement> & {
  header: ReactNode;
  footer: ReactNode;
  label: string;
};
/** 上区固定，中区按需滚动，下区始终锚定侧栏底部。 */
export function SidebarFrame({
  header,
  footer,
  label,
  children,
  className,
  ...props
}: SidebarFrameProps) {
  return (
    <div {...props} className={['ds-sidebar-frame', className].filter(Boolean).join(' ')}>
      <div className="ds-sidebar-frame__header">{header}</div>
      <ScrollRegion label={label} axis="y" className="ds-sidebar-frame__body">
        {children}
      </ScrollRegion>
      <div className="ds-sidebar-frame__footer">{footer}</div>
    </div>
  );
}
