/**
 * 横向滚动槽位的唯一清单：过长单项（名称、标识、值、选项、标签、标题）只有一种处理——单行、不省略、不折行，
 * 放不下在槽位内左右滚动，且只有真放不下时槽位才是滚动容器（overflowScroll 统一测量并标记 data-overflowing）。
 *
 * 新增需要单行滚动的地方只在这里加一条选择器，并把同一条加进 overflowScroll.css 的两组规则；
 * 设计门禁校验两处完全一致，且其他样式文件不得自行声明 data-overflowing 规则。
 * 本文件不引入样式，UI 测试门禁可直接复用。
 */
export const SCROLL_SLOTS = [
  // 表格正文单元格；纵向多行格（名称在上、键在下）按行滚动，标题不随长键移走
  '.ds-table .ant-table-tbody > tr.ant-table-row > td:not(.ds-table__action-cell)',
  '.ds-table .ant-table-tbody > tr.ant-table-row > td > .ds-layout-stack:not(.ds-layout-stack--row) > *',
  '.ds-action-link[data-variant="name"] > .ds-action-link__label',
  // 单行组件
  '.ds-ratio-progress__text',
  '.ds-status-tag__content',
  '.ds-atomic-value',
  '.ds-long-text',
  '.ds-inline-list',
  '.ds-single-line',
  // 标题
  '.ds-app-page__title',
  // 面包屑末项（当前对象名）：超长时单行横滚，不把面包屑折成多行
  '.ds-app-page__header > .ant-breadcrumb li:last-child',
  '.ant-card .ant-card-head-title',
  // 下拉候选项与弹窗里铺开的已选标签
  '.ds-select-option .ant-select-item-option-content',
  '.ant-select-multiple .ds-select-content.ds-multi-select__content--wrap .ds-select-tag-content',
  '.ant-select-multiple .ds-select-content.ds-filter-select__content .ds-select-tag-content',
  // 分段切换：滚层落在无边框无内边距的分段组上，控件外框保持固定框架；单个选项文字同理
  '.ds-view-switch .ant-segmented-group',
  '.ds-view-switch .ant-segmented-item-label.ds-view-switch__label',
] as const;

export const SCROLL_SLOT_SELECTOR = SCROLL_SLOTS.join(', ');
