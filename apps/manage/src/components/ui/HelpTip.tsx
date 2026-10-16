import { QuestionCircleOutlined } from '@ant-design/icons';

import { Tooltip } from './Tooltip';

import './HelpTip.css';

export type HelpTipProps = {
  /** 说明文字：悬停、聚焦或轻触问号时展示，同时作为读屏的可访问名称。 */
  title: string;
};

/**
 * 标题、搜索框等非表单位置的说明入口：紧跟在被说明对象旁的问号，悬停/聚焦/轻触展示说明。
 * 与 Form.Item tooltip（字段标签旁的问号）同一外观；说明只能是纯文本，结构化内容用 Popover/Drawer。
 */
export function HelpTip({ title }: HelpTipProps) {
  return (
    // 默认只翻转不平移：问号贴近视口边缘（如窄屏搜索框尾部）时说明会伸出页面，这里允许水平平移留在视口内
    <Tooltip
      title={title}
      trigger={['hover', 'focus']}
      classNames={{ root: 'ds-help-tip__popup' }}
      align={{ overflow: { adjustX: true, adjustY: true, shiftX: true } }}
    >
      <span className="ds-help-tip" role="img" aria-label={title} tabIndex={0}>
        <QuestionCircleOutlined />
      </span>
    </Tooltip>
  );
}
