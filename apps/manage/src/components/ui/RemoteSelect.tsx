import type { DependencyList } from 'react';

import { QueryErrorAlert } from './Feedback';
import { AutoComplete, Form, Select, type SelectProps } from 'antd';

import {
  syncClearedKeyword,
  useRemoteOptions,
  type RemoteOption,
  type RemoteOptionsLoader,
} from '@/hooks/useRemoteOptions';

export type RemoteSelectProps = Omit<
  SelectProps<string>,
  'options' | 'mode' | 'showSearch' | 'filterOption' | 'onSearch' | 'loading' | 'value' | 'onChange'
> & {
  /** 按关键词取候选（服务端过滤 + 截断）。 */
  loadOptions: RemoteOptionsLoader;
  /** 候选作用域变化时重新读取，不沿用其它实体范围的结果或标签。 */
  refreshDeps?: DependencyList;
  value?: string;
  onChange?: (value: string | undefined) => void;
  /** 当前值不在候选里时用它显示标签（如从详情带入的已选主体）。 */
  valueLabel?: string;
  /** 允许输入候选之外的值（AutoComplete 形态），用于诊断/查询这类接受任意主体的场景。 */
  freeText?: boolean;
};

/**
 * 表单里的大候选集单选：主体、账号、邮箱这类以万计的枚举不全量加载，
 * 默认占满所属字段的可用宽度，独立使用时也可操作；输入关键词后向后端取前 N 条，已选值始终保留为选项。多选请用 FilterSelect（查询区）或 MultiSelect（表单）。
 */
export function RemoteSelect({
  loadOptions,
  refreshDeps,
  value,
  onChange,
  valueLabel,
  freeText = false,
  ...props
}: RemoteSelectProps) {
  const selected: RemoteOption[] = value ? [{ value, label: valueLabel ?? value }] : [];
  const remote = useRemoteOptions(loadOptions, selected, refreshDeps);
  const control = freeText ? (
    <AutoComplete
      {...(props as object)}
      style={{ width: '100%', maxWidth: '100%', ...props.style }}
      allowClear
      popupMatchSelectWidth
      value={value}
      options={remote.options}
      filterOption={false}
      onSearch={remote.onSearch}
      onChange={(next) => onChange?.(next ? String(next) : undefined)}
    />
  ) : (
    <Select<string>
      {...props}
      style={{ width: '100%', maxWidth: '100%', ...props.style }}
      showSearch
      allowClear
      popupMatchSelectWidth
      value={value}
      options={remote.options}
      loading={remote.loading}
      filterOption={false}
      onSearch={remote.onSearch}
      onSelect={(...args) => {
        if (props.autoClearSearchValue !== false) remote.onSearch('');
        props.onSelect?.(...args);
      }}
      onBlur={(event) => {
        syncClearedKeyword(event.target, remote.onSearch);
        props.onBlur?.(event);
      }}
      onChange={(next) => onChange?.(next ?? undefined)}
    />
  );
  return (
    <Form.Item
      style={{ marginBottom: 0 }}
      validateStatus={remote.error ? 'error' : undefined}
      help={
        remote.error ? (
          <QueryErrorAlert
            error={remote.error}
            retrying={remote.loading}
            onRetry={() => void remote.retry()}
          />
        ) : undefined
      }
    >
      {control}
    </Form.Item>
  );
}
