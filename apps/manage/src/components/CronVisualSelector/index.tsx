import { Input } from 'antd';
import { FormGrid, MultiSelect } from '@/components/ui';
import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import './CronVisualSelector.css';

interface CronVisualSelectorProps {
  value?: string;
  onChange?: (value: string) => void;
}

type CronParts = {
  minute: string | undefined;
  hour: string | undefined;
  dayOfMonth: string | undefined;
  month: string | undefined;
  dayOfWeek: string | undefined;
};

const EMPTY_CRON_PARTS: CronParts = {
  minute: undefined,
  hour: undefined,
  dayOfMonth: undefined,
  month: undefined,
  dayOfWeek: undefined,
};

const parseCronParts = (value?: string): CronParts | undefined => {
  if (!value) return undefined;
  const parts = value.trim().split(/\s+/);
  if (parts.length !== 5) return undefined;
  return {
    minute: parts[0],
    hour: parts[1],
    dayOfMonth: parts[2],
    month: parts[3],
    dayOfWeek: parts[4],
  };
};

const CronVisualSelector: React.FC<CronVisualSelectorProps> = ({ value, onChange }) => {
  const { t } = useTranslation();
  const [cronState, setCronState] = useState<{
    lastEmittedValue?: string;
    parts: CronParts;
    value?: string;
  }>(() => ({
    lastEmittedValue: undefined,
    parts: parseCronParts(value) ?? EMPTY_CRON_PARTS,
    value,
  }));

  let cronParts = cronState.parts;

  if (value !== cronState.value) {
    if (value !== cronState.lastEmittedValue) {
      cronParts = parseCronParts(value) ?? EMPTY_CRON_PARTS;
    }

    setCronState({
      lastEmittedValue: cronState.lastEmittedValue,
      parts: cronParts,
      value,
    });
  }

  // 分钟选项 (0-59)
  const minuteOptions = [
    {
      label: t('components.cronVisualSelector.minute.every'),
      value: '*',
    },
    ...Array.from({ length: 60 }, (_, i) => ({
      label: i.toString(),
      value: i.toString(),
    })),
  ];

  // 小时选项 (0-23)
  const hourOptions = [
    {
      label: t('components.cronVisualSelector.hour.every'),
      value: '*',
    },
    ...Array.from({ length: 24 }, (_, i) => ({
      label: i.toString(),
      value: i.toString(),
    })),
  ];

  // 日期选项 (1-31)
  const dayOfMonthOptions = [
    {
      label: t('common.vocab.everyDay'),
      value: '*',
    },
    ...Array.from({ length: 31 }, (_, i) => ({
      label: (i + 1).toString(),
      value: (i + 1).toString(),
    })),
  ];

  // 月份选项 (1-12)
  const monthOptions = [
    {
      label: t('common.vocab.everyMonth'),
      value: '*',
    },
    ...Array.from({ length: 12 }, (_, i) => ({
      label: (i + 1).toString(),
      value: (i + 1).toString(),
    })),
  ];

  // 星期选项 (0-6, 0=周日, 1=周一, ..., 6=周六)
  const dayOfWeekOptions = [
    {
      label: t('common.vocab.everyDay'),
      value: '*',
    },
    {
      label: t('common.calendar.weekdays.sun'),
      value: '0',
    },
    {
      label: t('common.calendar.weekdays.mon'),
      value: '1',
    },
    {
      label: t('common.calendar.weekdays.tue'),
      value: '2',
    },
    {
      label: t('common.calendar.weekdays.wed'),
      value: '3',
    },
    {
      label: t('common.calendar.weekdays.thu'),
      value: '4',
    },
    {
      label: t('common.calendar.weekdays.fri'),
      value: '5',
    },
    {
      label: t('common.calendar.weekdays.sat'),
      value: '6',
    },
  ];

  // 更新cron表达式
  const updateCronExpression = (newParts: CronParts): string => {
    // 只有当所有字段都有值时，才生成cron表达式
    const hasAllValues = Object.values(newParts).every(
      (value) => value !== undefined && value !== ''
    );

    if (hasAllValues) {
      const cronExpression = `${newParts.minute} ${newParts.hour} ${newParts.dayOfMonth} ${newParts.month} ${newParts.dayOfWeek}`;
      onChange?.(cronExpression);
      return cronExpression;
    } else {
      // 如果有字段未选择，传递空字符串
      onChange?.('');
      return '';
    }
  };

  // 处理单个字段变化
  const handlePartChange = (field: keyof CronParts, newValue: string | string[] | undefined) => {
    // 处理多选值
    let finalValue: string | undefined;

    if (Array.isArray(newValue)) {
      // 处理多选值
      if (newValue.length === 0) {
        // 清空选择
        finalValue = undefined;
      } else {
        // 获取当前值（用于比较）
        const currentValue = cronParts[field];
        const currentValues = currentValue ? currentValue.split(',') : [];

        // 判断用户的操作意图
        const isAddingAsterisk = !currentValues.includes('*') && newValue.includes('*');
        const isAddingOtherValue = newValue.some(
          (val) => val !== '*' && !currentValues.includes(val)
        );
        const isRemovingAsterisk = currentValues.includes('*') && !newValue.includes('*');

        if (isAddingAsterisk) {
          // 用户新增了"*"，清除所有其他选项
          finalValue = '*';
        } else if (isAddingOtherValue) {
          // 用户新增了其他选项，清除"*"
          finalValue = newValue.filter((val) => val !== '*').join(',');
        } else if (isRemovingAsterisk) {
          // 用户移除了"*"，保留其他选项
          finalValue = newValue.join(',');
        } else {
          // 其他情况（如移除选项、重新排序等），直接转换
          finalValue = newValue.join(',');
        }
      }
    } else {
      finalValue = newValue;
    }

    const newParts = { ...cronParts, [field]: finalValue };
    const cronValue = updateCronExpression(newParts);
    setCronState({
      lastEmittedValue: cronValue,
      parts: newParts,
      value: cronValue,
    });
  };

  const minuteLabel = t('common.vocab.min');
  const hourLabel = t('common.vocab.hour');
  const dayOfMonthLabel = t('common.vocab.day');
  const monthLabel = t('common.vocab.month');
  const dayOfWeekLabel = t('common.vocab.week');

  return (
    <div className="ds-cron-visual-selector">
      {/* 可视化选择器 */}
      <FormGrid columns={5} field="short" rowGap="control" className="ds-cron-visual-selector__row">
        {/* 分钟 */}
        <div className="ds-cron-visual-selector__field">
          <span className="ds-cron-visual-selector__label">{minuteLabel}</span>
          <MultiSelect
            size="small"
            className="ds-cron-visual-selector__select"
            label={minuteLabel}
            value={cronParts.minute ? cronParts.minute.split(',') : []}
            onChange={(val) => handlePartChange('minute', val)}
            options={minuteOptions}
            filterOption={(input, option) =>
              String(option?.label ?? '')
                .toLowerCase()
                .includes(input.toLowerCase())
            }
            allowClear
          />
        </div>

        {/* 小时 */}
        <div className="ds-cron-visual-selector__field">
          <span className="ds-cron-visual-selector__label">{hourLabel}</span>
          <MultiSelect
            size="small"
            className="ds-cron-visual-selector__select"
            label={hourLabel}
            value={cronParts.hour ? cronParts.hour.split(',') : []}
            onChange={(val) => handlePartChange('hour', val)}
            options={hourOptions}
            filterOption={(input, option) =>
              String(option?.label ?? '')
                .toLowerCase()
                .includes(input.toLowerCase())
            }
            allowClear
          />
        </div>

        {/* 日期 */}
        <div className="ds-cron-visual-selector__field">
          <span className="ds-cron-visual-selector__label">{dayOfMonthLabel}</span>
          <MultiSelect
            size="small"
            className="ds-cron-visual-selector__select"
            label={dayOfMonthLabel}
            value={cronParts.dayOfMonth ? cronParts.dayOfMonth.split(',') : []}
            onChange={(val) => handlePartChange('dayOfMonth', val)}
            options={dayOfMonthOptions}
            filterOption={(input, option) =>
              String(option?.label ?? '')
                .toLowerCase()
                .includes(input.toLowerCase())
            }
            allowClear
          />
        </div>

        {/* 月份 */}
        <div className="ds-cron-visual-selector__field">
          <span className="ds-cron-visual-selector__label">{monthLabel}</span>
          <MultiSelect
            size="small"
            className="ds-cron-visual-selector__select"
            label={monthLabel}
            value={cronParts.month ? cronParts.month.split(',') : []}
            onChange={(val) => handlePartChange('month', val)}
            options={monthOptions}
            filterOption={(input, option) =>
              String(option?.label ?? '')
                .toLowerCase()
                .includes(input.toLowerCase())
            }
            allowClear
          />
        </div>

        {/* 星期 */}
        <div className="ds-cron-visual-selector__field">
          <span className="ds-cron-visual-selector__label">{dayOfWeekLabel}</span>
          <MultiSelect
            size="small"
            className="ds-cron-visual-selector__select"
            label={dayOfWeekLabel}
            value={cronParts.dayOfWeek ? cronParts.dayOfWeek.split(',') : []}
            onChange={(val) => handlePartChange('dayOfWeek', val)}
            options={dayOfWeekOptions}
            filterOption={(input, option) =>
              String(option?.label ?? '')
                .toLowerCase()
                .includes(input.toLowerCase())
            }
            allowClear
          />
        </div>
      </FormGrid>

      {/* Cron 表达式显示区域 */}
      {value && (
        <div className="ds-cron-visual-selector__expression">
          <Input
            allowClear={false}
            value={value}
            readOnly
            className="ds-cron-visual-selector__expression-input"
          />
        </div>
      )}
    </div>
  );
};

export default CronVisualSelector;
