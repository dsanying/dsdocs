import type { CSSProperties } from 'react';

import { ScrollRegion } from '@/components/ui';
import { formatUnknownJson } from '@/utils/json';

import './style.css';

export type JsonPreviewProps = {
  value: unknown;
  label: string;
  emptyText?: string;
  maxHeight?: CSSProperties['maxHeight'];
};

/** 只读 JSON 使用原生文本与局部滚动，不加载代码编辑器运行时。 */
export function JsonPreview({ value, label, emptyText, maxHeight = '60dvh' }: JsonPreviewProps) {
  return (
    <ScrollRegion label={label} style={{ maxHeight }}>
      <pre className="ds-json-preview">
        <code>{formatUnknownJson(value, emptyText)}</code>
      </pre>
    </ScrollRegion>
  );
}
