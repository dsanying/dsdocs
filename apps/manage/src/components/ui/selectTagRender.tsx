import { Popover, type SelectProps } from 'antd';

import type { PasteOption } from './selectValues';
import { UnknownTagSuggestions } from './UnknownTagSuggestions';

type TagRenderProps = Parameters<NonNullable<SelectProps<string[]>['tagRender']>>[0];

export type UnknownTagFix = {
  /** 幽灵值可选的近似候选：按与已选文本的近似度排序。 */
  options: readonly PasteOption[];
  /** 打开弹层时以幽灵值为关键词向远端再取一轮候选（大小写变体等可能不在已加载页里）。 */
  probe?: (value: string) => Promise<readonly PasteOption[]>;
  /** 用候选真实值替换幽灵值。 */
  onReplace: (from: string, to: string) => void;
  /** 弹层标题（“近似候选”）。 */
  title: string;
};

/**
 * 已选标签与 Ant 默认结构同构，值不在候选集中时附加标红类（粘贴误入或候选后来被删）。
 * 提供 fix 上下文时红标签可点：按近似度列出候选，点击即替换为候选真实值；不再匹配的红标自动消失。
 * `allowEmptyKnown`：候选由远端核验时"已加载且为空"也要标红——空集即无命中，不等于尚未加载。
 */
export function selectionTagRender(
  tag: TagRenderProps,
  knownValues: ReadonlySet<string>,
  loading?: boolean,
  fix?: UnknownTagFix,
  allowEmptyKnown = false
) {
  const unknown =
    !loading &&
    !tag.isMaxTag &&
    !knownValues.has(String(tag.value)) &&
    (knownValues.size > 0 || allowEmptyKnown);
  const fixable = unknown && fix && (fix.options.length > 0 || fix.probe != null);
  const content = (
    <span
      className={`ant-select-selection-item-content${fixable ? ' ds-select-tag__content--fixable' : ''}`}
    >
      {tag.label}
    </span>
  );
  return (
    <span
      className={[
        'ant-select-selection-item',
        tag.disabled ? 'ant-select-selection-item-disabled' : undefined,
        unknown ? 'ds-select-tag--unknown' : undefined,
      ]
        .filter(Boolean)
        .join(' ')}
    >
      {fixable ? (
        <Popover
          trigger="click"
          placement="bottomLeft"
          title={fix.title}
          content={
            <UnknownTagSuggestions
              value={String(tag.value)}
              options={fix.options}
              probe={fix.probe}
              onReplace={(to) => fix.onReplace(String(tag.value), to)}
            />
          }
        >
          {content}
        </Popover>
      ) : (
        content
      )}
      {tag.closable ? (
        <span
          className="ant-select-selection-item-remove"
          role="button"
          aria-hidden="true"
          onMouseDown={(event) => event.preventDefault()}
          onClick={tag.onClose}
        >
          ×
        </span>
      ) : null}
    </span>
  );
}
