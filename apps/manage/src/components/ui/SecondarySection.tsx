import { Collapse } from 'antd';
import type { ReactNode } from 'react';

import './SecondarySection.css';

export type SecondarySectionProps = {
  /** 折叠条标题（区域名，如“授权规则”）。 */
  title: string;
  /** 折叠时显示在标题旁的一句摘要（里面有什么），展开后仍保留。 */
  summary?: ReactNode;
  /** 唯一标识，供受控展开状态与测试定位。 */
  id?: string;
  children: ReactNode;
};

/**
 * 次要信息区（低频但必须保留、不能删也不该喧宾夺主的内容）：
 * 页面/页签末尾的一条折叠栏，默认折叠，只露标题与一句摘要；展开时才挂载并加载内容，收起即卸载。
 * 用 Ant Collapse 的 ghost 变体（无壳、无底色），与卡片区块拉开层级；不另建页签，页签只用于分析对象/一级视图。
 */
export function SecondarySection({ title, summary, id, children }: SecondarySectionProps) {
  return (
    <Collapse
      ghost
      destroyOnHidden
      className="ds-secondary-section"
      data-layout="secondary-section"
      items={[
        {
          key: id ?? 'secondary',
          label: (
            <span className="ds-secondary-section__label">
              <span className="ds-secondary-section__title">{title}</span>
              {summary ? <span className="ds-secondary-section__summary">{summary}</span> : null}
            </span>
          ),
          children,
        },
      ]}
    />
  );
}
