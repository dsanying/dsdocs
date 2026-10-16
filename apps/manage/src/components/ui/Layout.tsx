import type { HTMLAttributes, ReactNode } from 'react';

import './Layout.css';

type StackProps = HTMLAttributes<HTMLDivElement>;

/**
 * 间隔只有四档角色，且只由容器的 gap 表达（业务层禁止 margin）：
 * page 24（页面区块之间）/ block 16（区块内部）/ control 8（同组控件、图标与文字）/ tight 4（紧贴的附属信息）。
 */
export type StackGap = 'page' | 'block' | 'control' | 'tight';

export type FlexStackProps = StackProps & {
  gap?: StackGap;
  direction?: 'column' | 'row';
  /** 行方向时是否允许换行。 */
  wrap?: boolean;
  align?: 'start' | 'center' | 'end' | 'stretch' | 'baseline';
  justify?: 'start' | 'center' | 'end' | 'between';
};

/** 通用间隔容器：纵向/横向、四档角色间距，替代各处手写 margin。 */
export function Stack({
  className,
  gap = 'block',
  direction = 'column',
  wrap = false,
  align,
  justify,
  ...props
}: FlexStackProps) {
  return (
    <div
      {...props}
      className={[
        'ds-layout-stack',
        `ds-layout-stack--${gap}`,
        direction === 'row' ? 'ds-layout-stack--row' : undefined,
        wrap ? 'ds-layout-stack--wrap' : undefined,
        align ? `ds-layout-stack--align-${align}` : undefined,
        justify ? `ds-layout-stack--justify-${justify}` : undefined,
        className,
      ]
        .filter(Boolean)
        .join(' ')}
      data-layout={`stack-${gap}`}
    />
  );
}

/** 完整页面区块之间的统一纵向节奏。 */
export function PageStack({ className, ...props }: StackProps) {
  return (
    <div
      {...props}
      className={['ds-layout-stack', 'ds-layout-stack--page', className].filter(Boolean).join(' ')}
      data-layout="page-stack"
    />
  );
}

/** 单一区块内部的统一纵向节奏。 */
export function ContentStack({ className, ...props }: StackProps) {
  return (
    <div
      {...props}
      className={['ds-layout-stack', 'ds-layout-stack--block', className].filter(Boolean).join(' ')}
      data-layout="content-stack"
    />
  );
}

export type SectionHeaderProps = Omit<HTMLAttributes<HTMLElement>, 'title'> & {
  title: ReactNode;
  extra?: ReactNode;
  headingLevel?: 2 | 3 | 4 | 5 | 6;
};

/** 标题与当前区块操作的唯一同行布局。 */
export function SectionHeader({
  title,
  extra,
  headingLevel = 2,
  className,
  ...props
}: SectionHeaderProps) {
  const Heading = `h${headingLevel}` as const;
  return (
    <header
      {...props}
      className={['ds-section-header', className].filter(Boolean).join(' ')}
      data-layout="section-header"
    >
      <Heading className="ds-section-header__title">{title}</Heading>
      {extra ? <div className="ds-section-header__extra">{extra}</div> : null}
    </header>
  );
}
