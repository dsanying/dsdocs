import { Segmented, type SegmentedProps } from 'antd';

import './ViewSwitch.css';

function joinClassNames(...values: Array<string | undefined>) {
  return values.filter(Boolean).join(' ');
}

/** 短互斥视图的唯一入口；默认按内容收口，明确需要均分时才使用 block。 */
export function ViewSwitch<ValueType>({
  className,
  classNames,
  ...props
}: SegmentedProps<ValueType>) {
  return (
    <div
      className={['ds-view-switch', props.block ? 'ds-view-switch--block' : undefined, className]
        .filter(Boolean)
        .join(' ')}
    >
      <Segmented
        {...props}
        classNames={(info) => {
          const resolved = typeof classNames === 'function' ? classNames(info) : classNames;
          return {
            ...resolved,
            root: joinClassNames('ds-view-switch__control', resolved?.root),
            item: joinClassNames('ds-view-switch__item', resolved?.item),
            label: joinClassNames('ds-view-switch__label', resolved?.label),
          };
        }}
      />
    </div>
  );
}
