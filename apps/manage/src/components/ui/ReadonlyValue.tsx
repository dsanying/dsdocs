import { AtomicValue } from './AtomicValue';

export type ReadonlyValueProps = {
  /** 由 Form.Item 注入；字段仍留在表单里，供依赖它的其他字段派生（如按持有人取资源候选）。 */
  value?: string;
};

/**
 * 编辑页里不可修改的字段（对象名、持有人等）：作为表单控件放进带 name 的 Form.Item，只读展示原值。
 * 不用禁用的输入框——禁用控件不能聚焦，长值放不下时既看不全也滚不动；这里走单行值的统一滚动槽位。
 */
export function ReadonlyValue({ value }: ReadonlyValueProps) {
  return <AtomicValue text={value || '-'} />;
}
