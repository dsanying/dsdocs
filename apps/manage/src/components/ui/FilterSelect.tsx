import { Select, type SelectProps } from 'antd';
import { useMemo, type DependencyList } from 'react';
import { QueryErrorAlert } from './Feedback';
import { designTokens } from '@/design/tokens';
import {
  syncClearedKeyword,
  useRemoteOptions,
  type RemoteOptionsLoader,
} from '@/hooks/useRemoteOptions';
import { measureTextWidth, readBodyFont } from './measureText';

import './FilterSelect.css';

/**
 * 查询条件下拉的三种语义，决定单选/多选与是否可清空，页面不再各自判断：
 * - `enum`：可组合离散维度（状态、类型、服务、标签、用户和模型等，不按候选数量推断）——多选，空数组 = 全部，多个值之间是 OR；
 * - `pair`：只有两个互斥值的维度（启用/禁用、个人/团队、allow/deny）——单选可清空，选两个等于不筛选，多选没有信息增益；
 * - `scope`：决定数据集的作用域（如应用 ID）——单选且不可清空，它不是筛选而是范围。
 */
export type FilterSelectKind = 'enum' | 'pair' | 'scope';

export type FilterSelectOption = { label: string; value: string };

export type FilterSelectProps = Omit<
  SelectProps<string | string[]>,
  | 'allowClear'
  | 'filterOption'
  | 'maxTagCount'
  | 'mode'
  | 'options'
  | 'popupMatchSelectWidth'
  | 'showSearch'
  | 'style'
> & {
  kind: FilterSelectKind;
  options: FilterSelectOption[];
  /**
   * 大候选集（主体、邮箱等以万计）的实时候选：传入即不再依赖静态 `options`，按关键词防抖向后端取前 N 条，
   * 已选值保留为选项；`options` 此时只作为已选值的初始标签来源。
   */
  loadOptions?: RemoteOptionsLoader;
  /** 候选所属实体范围变化时重新读取，并清除上一范围的候选标签。 */
  refreshDeps?: DependencyList;
};

const matchOptionLabel: SelectProps['filterOption'] = (input, option) =>
  String(option?.label ?? '')
    .toLowerCase()
    .includes(input.trim().toLowerCase());

/** 控件内边距 + 清除/下拉图标区；多选再加一个标签的圆角内边距与关闭图标。 */
const CONTROL_CHROME = designTokens.space.md * 2 + designTokens.space.xl;
const TAG_CHROME = designTokens.space.sm * 2 + designTokens.space.lg;
const MIN_WIDTH = designTokens.space.xxxl * 3;
const MAX_WIDTH = designTokens.layout.queryControlWidth;

/**
 * 查询区下拉的唯一入口：由 `kind` 派生单选/多选、可清空与搜索；
 * 宽度按最长选项文字量出、封顶查询控件宽度（个别超长候选不把整行查询区撑宽）；
 * 超长候选、已选标签与已选值都在各自的统一滚动槽位内左右滚动，不省略、不带动控件变宽。
 * 筛选条件的多选是例外：不走 MultiSelect 的“一行 + 弹窗”，直接用 Ant 多选的默认形态——
 * 已选标签换行完整展示、点开即下拉勾选，筛选时改动频繁，少一次弹窗更顺手。
 */
export function FilterSelect({
  kind,
  options,
  loadOptions,
  refreshDeps,
  ...props
}: FilterSelectProps) {
  if (loadOptions)
    return (
      <RemoteFilterSelect
        kind={kind}
        options={options}
        loadOptions={loadOptions}
        refreshDeps={refreshDeps}
        {...props}
      />
    );
  return <StaticFilterSelect kind={kind} options={options} {...props} />;
}

/** 实时候选变体：宽度不随异步候选变化（固定查询控件宽度），下拉只列服务端返回的前 N 条。 */
function RemoteFilterSelect({
  kind,
  options,
  loadOptions,
  refreshDeps,
  ...props
}: FilterSelectProps & { loadOptions: RemoteOptionsLoader }) {
  const selectedValues = Array.isArray(props.value)
    ? props.value
    : props.value
      ? [props.value]
      : [];
  const selected = selectedValues.map((value) => ({
    value,
    label: options.find((option) => option.value === value)?.label ?? value,
  }));
  const remote = useRemoteOptions(loadOptions, selected, refreshDeps);
  const shared = {
    style: { width: designTokens.layout.queryControlWidth, maxWidth: '100%' },
    options: remote.options,
    loading: remote.loading,
    showSearch: true,
    filterOption: false as const,
    onSearch: remote.onSearch,
    popupRender: (menu: React.ReactNode) => (
      <>
        <QueryErrorAlert error={remote.error} onRetry={() => void remote.retry()} />
        {menu}
      </>
    ),
    popupMatchSelectWidth: true as const,
    // Ant 选中候选（默认自动清空时）或失焦后会自行清空搜索框却不回调 onSearch；按输入框的实际状态同步关键词，
    // 避免空输入框下仍展示旧关键词的候选，也不在输入仍保留时作废进行中的请求。
    onSelect: (...args: Parameters<NonNullable<SelectProps<string | string[]>['onSelect']>>) => {
      if (props.autoClearSearchValue !== false) remote.onSearch('');
      props.onSelect?.(...args);
    },
    onBlur: (event: React.FocusEvent<HTMLElement>) => {
      syncClearedKeyword(event.target, remote.onSearch);
      props.onBlur?.(event);
    },
  };
  if (kind === 'enum') {
    const { value: _value, onChange, className, ...rest } = props;
    return (
      <Select<string[]>
        {...(rest as SelectProps<string[]>)}
        {...shared}
        mode="multiple"
        className={['ds-filter-select', className].filter(Boolean).join(' ')}
        classNames={{ content: 'ds-filter-select__content' }}
        value={selectedValues}
        onChange={onChange as SelectProps<string[]>['onChange']}
        allowClear
      />
    );
  }
  return <Select<string | string[]> {...props} {...shared} allowClear={kind !== 'scope'} />;
}

function StaticFilterSelect({ kind, options, ...props }: Omit<FilterSelectProps, 'loadOptions'>) {
  const searchable = kind === 'enum' || options.length > 6;
  const width = useMemo(() => {
    const font = readBodyFont();
    const longest = options.reduce(
      (max, option) => Math.max(max, measureTextWidth(option.label, font)),
      0
    );
    const chrome = CONTROL_CHROME + (kind === 'enum' ? TAG_CHROME : 0);
    return Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, Math.ceil(longest + chrome)));
  }, [options, kind]);
  if (kind === 'enum') {
    const { value, onChange, className, ...rest } = props;
    return (
      <Select<string[]>
        {...(rest as SelectProps<string[]>)}
        mode="multiple"
        className={['ds-filter-select', className].filter(Boolean).join(' ')}
        classNames={{ content: 'ds-filter-select__content' }}
        style={{ width, maxWidth: '100%' }}
        options={options}
        value={Array.isArray(value) ? value : value ? [value] : []}
        onChange={onChange as SelectProps<string[]>['onChange']}
        allowClear
        showSearch
        filterOption={matchOptionLabel}
        popupMatchSelectWidth
      />
    );
  }
  return (
    <Select<string | string[]>
      {...props}
      style={{ width, maxWidth: '100%' }}
      options={options}
      allowClear={kind !== 'scope'}
      showSearch={searchable}
      filterOption={searchable ? matchOptionLabel : undefined}
      popupMatchSelectWidth
    />
  );
}
