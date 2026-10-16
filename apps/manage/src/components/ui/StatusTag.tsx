import { Tag, type TagProps } from 'antd';

import './StatusTag.css';

export type StatusTone = 'neutral' | 'info' | 'success' | 'warning' | 'error';

export type StatusTagProps = Omit<TagProps, 'color' | 'bordered'> & {
  /** 只表达真实状态；普通分类和元数据使用 MetadataTag。 */
  tone?: StatusTone;
};

function SemanticTag({
  tone,
  kind,
  className,
  children,
  ...props
}: StatusTagProps & { tone: StatusTone; kind: 'status' | 'metadata' }) {
  return (
    <Tag
      {...props}
      className={['ds-status-tag', `ds-status-tag--${tone}`, className].filter(Boolean).join(' ')}
      data-kind={kind}
      data-tone={tone}
    >
      <span className="ds-status-tag__content">{children}</span>
    </Tag>
  );
}

/** 状态标签的唯一入口；颜色由共享 tone 决定，状态文字由调用方保留。 */
export function StatusTag({ tone = 'neutral', ...props }: StatusTagProps) {
  return <SemanticTag {...props} tone={tone} kind="status" />;
}

/** 不表达状态的分类、来源和标识统一使用中性标签。 */
export function MetadataTag(props: Omit<StatusTagProps, 'tone'>) {
  return <SemanticTag {...props} tone="neutral" kind="metadata" />;
}
