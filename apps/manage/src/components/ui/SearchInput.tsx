import { SearchOutlined } from '@ant-design/icons';
import { Input, type InputProps } from 'antd';

import { HelpTip } from './HelpTip';

import './SearchInput.css';

export type SearchInputProps = Omit<InputProps, 'className' | 'prefix' | 'suffix'> & {
  className?: string;
  /** 匹配规则：输入框内尾部的问号，悬停/聚焦展示，并作为输入框的可访问描述。 */
  hint: string;
};

/** 带匹配规则说明的搜索输入：规则收在输入框尾部的问号里，不占用表单纵向空间。 */
export function SearchInput({ className, hint, type = 'search', ...inputProps }: SearchInputProps) {
  return (
    <div
      className={['ds-search-input', className].filter(Boolean).join(' ')}
      data-kind="search-input"
    >
      <Input
        {...inputProps}
        // 读屏用户聚焦输入框即可听到匹配规则，无需再找到问号
        {...{ 'aria-description': hint }}
        className="ds-search-input__control"
        prefix={<SearchOutlined />}
        suffix={<HelpTip title={hint} />}
        type={type}
      />
    </div>
  );
}
