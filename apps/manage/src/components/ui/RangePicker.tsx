import { DatePicker } from 'antd';
import type { DatePickerProps, RangePickerProps } from 'antd/es/date-picker';
import type { Dayjs } from 'dayjs';
import { useTranslation } from 'react-i18next';

import { DATE_FORMAT, parseServerTime, rangeOfRecentDays } from '@/utils/dateTime';

import './RangePicker.css';

/*
 * 时间范围/日期选择的唯一入口：原生 DatePicker 面板在窄屏会弹出视口外
 * （双月面板约 560px、带时间的单月面板更宽，320px 下必然被裁），原生只限外层
 * 宽度不够——内层面板容器会裁剪溢出，必须裹成滚动容器再在视口内平移。
 * 这里统一弹层边界（popup 限宽 + panelRender 滚动包裹 + popupAlign 视口内平移）、
 * 展示格式与近 7/30/90 天快捷预设，业务层不得再直用 DatePicker/RangePicker。
 */
const popupAlign = { overflow: { adjustX: 1, adjustY: 1, shiftX: true } };

const renderPanel = (panel: React.ReactNode) => (
  <div className="ds-range-picker__panel-scroll">{panel}</div>
);

/** classNames 在 Ant 6 可为对象或函数；先解析成对象再向 popup.root 合并限宽类（各组件语义槽类型不同，在两个入口处分别内联）。 */
const popupRootClassName = (resolved: { popup?: { root?: string } | string } | undefined) => {
  const popupRoot = typeof resolved?.popup === 'object' ? resolved.popup.root : resolved?.popup;
  return ['ds-range-picker__popup', popupRoot].filter(Boolean).join(' ');
};
const popupSlot = (resolved: { popup?: { root?: string } | string } | undefined) => ({
  ...(typeof resolved?.popup === 'object' ? resolved.popup : undefined),
  root: popupRootClassName(resolved),
});

const quickPreset = (days: number): [Dayjs, Dayjs] => {
  const range = rangeOfRecentDays(days);
  return [parseServerTime(range.startTime), parseServerTime(range.endTime)];
};

export function RangePicker({
  allowClear = true,
  format = DATE_FORMAT,
  presets,
  classNames,
  ...props
}: RangePickerProps) {
  const { t } = useTranslation();
  const quickPresets = presets ?? [
    { label: t('common.rangePresets.7'), value: quickPreset(7) },
    { label: t('common.rangePresets.30'), value: quickPreset(30) },
    { label: t('common.rangePresets.90'), value: quickPreset(90) },
  ];
  return (
    <DatePicker.RangePicker
      {...props}
      allowClear={allowClear}
      format={format}
      presets={quickPresets}
      popupAlign={popupAlign}
      panelRender={renderPanel}
      classNames={(info) => {
        const resolved = typeof classNames === 'function' ? classNames(info) : classNames;
        return { ...resolved, popup: popupSlot(resolved) };
      }}
    />
  );
}

export function FieldDatePicker({
  allowClear = true,
  format = DATE_FORMAT,
  classNames,
  ...props
}: DatePickerProps) {
  return (
    <DatePicker
      {...props}
      allowClear={allowClear}
      format={format}
      popupAlign={popupAlign}
      panelRender={renderPanel}
      classNames={(info) => {
        const resolved = typeof classNames === 'function' ? classNames(info) : classNames;
        return { ...resolved, popup: popupSlot(resolved) };
      }}
    />
  );
}
