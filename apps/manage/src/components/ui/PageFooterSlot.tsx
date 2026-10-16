import { createContext, useContext, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

import './PageFooterSlot.css';

const PageFooterSlotContext = createContext<HTMLElement | null>(null);

/**
 * 页面底部吸附槽位：由布局在内容区之后渲染，宽度等于整个内容区、贴住视口底部，
 * 页面级常驻条（如 SaveBar）通过 Portal 挂进来，从而不受 AppPage 内边距影响、四周无缝隙。
 */
export function PageFooterSlotProvider({
  children,
}: {
  /** 布局收到槽位节点后把它放到内容区之后的位置。 */
  children: (slot: ReactNode) => ReactNode;
}) {
  const [slot, setSlot] = useState<HTMLElement | null>(null);
  return (
    <PageFooterSlotContext.Provider value={slot}>
      {children(
        <div ref={setSlot} className="ds-page-footer-slot" data-layout="page-footer-slot" />
      )}
    </PageFooterSlotContext.Provider>
  );
}

/** 把节点挂到布局底部槽位；没有布局槽位（独立渲染）时原地渲染。 */
export function PageFooterPortal({ children }: { children: ReactNode }) {
  const slot = useContext(PageFooterSlotContext);
  return slot ? createPortal(children, slot) : <>{children}</>;
}
