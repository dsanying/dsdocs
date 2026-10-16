import { Modal, Select, type SelectProps } from 'antd';
import { useMemo, useState, type ClipboardEvent } from 'react';
import { useTranslation } from 'react-i18next';

import { notifyInfo, notifyWarning } from '@/utils/feedback';

import { applyPastedValues } from './selectValues';
import { selectionTagRender } from './selectTagRender';

import './MultiSelect.css';

export type MultiSelectProps = Omit<
  SelectProps<string[]>,
  'mode' | 'maxTagCount' | 'maxTagTextLength' | 'open' | 'onOpenChange'
> & {
  /**
   * 弹窗标题与控件的可访问名称。放在 Form.Item 里时可省略：Form.Item 已把 label 关联到控件
   * （`<label for>`），弹窗标题直接取该字段名，不必再写一遍。
   */
  label?: string;
  /** 允许输入候选之外的值（Ant 的 tags 模式）。 */
  freeInput?: boolean;
  /** 幽灵值弹层的远端近似检索：以已选值为关键词取候选（覆盖未加载页里的大小写变体等）。 */
  suggestProbe?: (value: string) => Promise<readonly { value?: unknown; label?: unknown }[]>;
  /**
   * 接管粘贴未命中项的提示：默认弹"标红待修正"警告；候选由远端按值核验时改为收集待决值，
   * 由核验落定后按实际未决集提示——本地候选尚未覆盖的值可能随后被折叠核验自动修正，
   * 立即警告会把随后被修正的值也报成"待修正"。
   */
  onPasteUnknown?: (values: string[]) => void;
};

/** Form.Item 关联到控件的 `<label for>` 文本：弹窗标题与字段名同源。 */
const readAssociatedLabel = (controlId: string | undefined): string | undefined => {
  if (!controlId || typeof document === 'undefined') return undefined;
  const text = document
    .querySelector<HTMLLabelElement>(`label[for="${CSS.escape(controlId)}"]`)
    ?.textContent?.trim();
  return text || undefined;
};

/**
 * 多选控件的唯一入口：
 * - 行内是正常多选：单击打开候选下拉直接搜索勾选，已选只是一行展示（过长在控件内横向滚动），
 *   allowClear 与单个标签的 × 移除照常可用；
 * - 双击控件打开批量编辑弹窗：已选换行铺开随内容增高到上限后在区内滚动，支持粘贴整段列表切分；
 *   弹窗只是辅助输入区，改动即时同步，没有确定/取消按钮（关闭即完成），已选计数放在标题行；
 * - 行内与弹窗共用同一份 value/onChange，改动即时生效；
 * - 候选制下不在候选中的已选值标红为幽灵值，可点标签按近似候选一键替换。
 */
export function MultiSelect({
  label,
  freeInput = false,
  suggestProbe,
  onPasteUnknown,
  value,
  onChange,
  disabled,
  classNames,
  ...props
}: MultiSelectProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [inlineOpen, setInlineOpen] = useState(false);
  // 弹窗缩放动画结束前不展开候选：Ant 按输入框此刻（被缩放）的宽度定下拉宽，动画中展开会得到过窄的下拉且不再纠正；
  // 动画中的展开请求记下，动画结束后再展开
  const [settled, setSettled] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [associatedLabel, setAssociatedLabel] = useState<string>();
  const title = label ?? associatedLabel;
  const selected = Array.isArray(value) ? value : [];
  // 候选制下未核验的种子值（远程候选从未确认过的已选项）不算"已知"：照常标红，也不混进下拉候选清单
  const candidateOptions = useMemo(
    () =>
      (props.options ?? []).filter((option) => !(option as { unverified?: boolean }).unverified),
    [props.options]
  );
  const knownValues = useMemo(
    () => new Set(candidateOptions.map((option) => String(option.value))),
    [candidateOptions]
  );
  // 粘贴的是一份列表（多于一个分隔符项）时直接切分落值，而不是变成一整条输入；
  // freeInput 全量收下，候选制先整串匹配（候选值本身可能含空格/逗号）再逐项，未命中项收进已选区标红
  const handlePaste = (event: ClipboardEvent<HTMLElement>) => {
    if (disabled || !onChange) return;
    const handled = applyPastedValues(event.clipboardData.getData('text/plain'), {
      values: selected,
      options: candidateOptions,
      freeInput,
      onChange,
      onUnknown: (ignored) => {
        if (onPasteUnknown) {
          onPasteUnknown(ignored);
          return;
        }
        notifyWarning(
          t('common.feedback.pasteIgnoredValues', { count: ignored.length }),
          ignored.join(', ')
        );
      },
      // 命中唯一大小写变体或名称的项已自动写入规范值：单独信息提示，不与待修正警告混报
      onCorrected: (fixes) =>
        notifyInfo(
          t('common.feedback.valuesAutoCorrected', { count: fixes.length }),
          fixes.map((fix) => `${fix.from} → ${fix.to}`).join(', ')
        ),
    });
    if (handled) event.preventDefault();
  };
  const openEditor = () => {
    if (disabled) return;
    if (!label) setAssociatedLabel(readAssociatedLabel(props.id));
    setInlineOpen(false);
    setOpen(true);
  };
  // 自定义 tagRender 下 rc-select 会把已选标签整块的 mousedown 当成“切换下拉”意图：
  // 单个移除（×）与红色幽灵值的“近似替换”气泡有自己的行内交互，捕获阶段拦下不触发下拉开合
  const suppressItemMouseDown = (event: React.MouseEvent<HTMLElement>) => {
    if (
      (event.target as HTMLElement).closest(
        '.ant-select-selection-item-remove, .ds-select-tag__content--fixable'
      )
    )
      event.stopPropagation();
  };
  // 幽灵值（不在候选中的已选值）可点标签原地修正：弹近似候选，选中即替换为候选真实值
  const fix =
    !freeInput && onChange && (knownValues.size > 0 || suggestProbe)
      ? {
          options: candidateOptions,
          probe: suggestProbe,
          title: t('common.feedback.similarCandidates'),
          onReplace: (from: string, to: string) => {
            const replaced = selected.map((item) => (item === from ? to : item));
            onChange([...new Set(replaced)]);
          },
        }
      : undefined;
  const shared: SelectProps<string[]> = {
    ...props,
    options: candidateOptions,
    mode: freeInput ? 'tags' : 'multiple',
    value: selected,
    onChange,
    disabled,
    tagRender: (tag) => selectionTagRender(tag, knownValues, props.loading, fix),
  };
  return (
    <>
      <div
        className="ds-multi-select__inline-scope"
        onPaste={handlePaste}
        onMouseDownCapture={suppressItemMouseDown}
        onDoubleClick={openEditor}
      >
        <Select<string[]>
          {...shared}
          aria-label={label}
          open={inlineOpen}
          onOpenChange={(next) => {
            if (!disabled) setInlineOpen(next);
          }}
          className={['ds-multi-select__inline', props.className].filter(Boolean).join(' ')}
          classNames={{ ...classNames, content: 'ds-select-content' }}
        />
      </div>
      <Modal
        open={open}
        title={
          <span className="ds-multi-select__title">
            <span>{title}</span>
            <span className="ds-multi-select__count">
              {t('common.table.selected', { count: selected.length })}
            </span>
          </span>
        }
        destroyOnHidden
        // 辅助编辑弹窗固定宽度（Ant 自己按视口钳制最大宽度）
        width="var(--ds-layout-dialog-width)"
        onCancel={() => setOpen(false)}
        afterOpenChange={(next) => {
          setSettled(next);
          if (!next) setPickerOpen(false);
        }}
        footer={null}
      >
        <div
          className="ds-multi-select__paste-scope"
          onPaste={handlePaste}
          onMouseDownCapture={suppressItemMouseDown}
        >
          <Select<string[]>
            {...shared}
            showSearch={props.showSearch ?? true}
            className="ds-multi-select__full"
            // 行内按内容量出的宽度不带进弹窗，弹窗里铺满；候选下拉与输入框同宽，不再按最长候选伸出弹窗
            style={{ ...props.style, width: '100%' }}
            popupMatchSelectWidth
            open={settled && pickerOpen}
            onOpenChange={setPickerOpen}
            // 弹窗里有空间：标签换行铺开，一眼看全
            classNames={{ ...classNames, content: 'ds-multi-select__content--wrap' }}
            aria-label={title}
          />
        </div>
      </Modal>
    </>
  );
}
