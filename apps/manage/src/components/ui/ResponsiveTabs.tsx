import { Tabs, type TabsProps } from 'antd';

import './ResponsiveTabs.css';

function joinClassNames(...values: Array<string | undefined>) {
  return values.filter(Boolean).join(' ');
}

export type ResponsiveTabsProps = Omit<TabsProps, 'tabPosition'> & {
  equalItems?: boolean;
  fill?: boolean;
  variant?: 'default' | 'navigation-only';
};

/** 业务页签唯一入口，保留 Ant Design 的溢出导航与键盘语义。 */
export function ResponsiveTabs({
  className,
  equalItems = false,
  fill = false,
  variant = 'default',
  ...props
}: ResponsiveTabsProps) {
  const { classNames, items, styles, tabPlacement, type, ...tabsProps } = props;
  const placement = tabPlacement ?? 'top';
  const horizontal = placement === 'top' || placement === 'bottom';
  const resolvedVariant =
    items?.length && items.every((item) => item.children == null) ? 'navigation-only' : variant;

  return (
    <Tabs
      {...tabsProps}
      items={items}
      tabPlacement={tabPlacement}
      type={type}
      data-kind="responsive-tabs"
      data-variant={resolvedVariant}
      className={[
        'ds-responsive-tabs',
        horizontal ? 'ds-responsive-tabs--horizontal' : undefined,
        equalItems ? 'ds-responsive-tabs--equal' : undefined,
        fill ? 'ds-responsive-tabs--fill' : undefined,
        resolvedVariant === 'navigation-only' ? 'ds-responsive-tabs--navigation-only' : undefined,
        className,
      ]
        .filter(Boolean)
        .join(' ')}
      classNames={(info) => {
        const resolved = typeof classNames === 'function' ? classNames(info) : classNames;
        return {
          ...resolved,
          header: joinClassNames('ds-responsive-tabs__header', resolved?.header),
          item: joinClassNames('ds-responsive-tabs__item', resolved?.item),
          indicator: joinClassNames('ds-responsive-tabs__indicator', resolved?.indicator),
          body: joinClassNames('ds-responsive-tabs__body', resolved?.body),
          content: joinClassNames('ds-responsive-tabs__content', resolved?.content),
        };
      }}
      styles={(info) => {
        const resolved = typeof styles === 'function' ? styles(info) : styles;
        if (!fill && resolvedVariant !== 'navigation-only') return resolved ?? {};
        return {
          ...resolved,
          root: fill ? { height: '100%', minHeight: 0, ...resolved?.root } : resolved?.root,
          content: {
            ...resolved?.content,
            ...(resolvedVariant === 'navigation-only' ? { display: 'none' } : {}),
          },
        };
      }}
    />
  );
}
