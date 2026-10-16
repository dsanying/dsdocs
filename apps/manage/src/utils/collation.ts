/**
 * 展示顺序的唯一比较器：同样一组内容在任何地方摆出来顺序都一样。
 * 中文按拼音、数字按数值（"标签 2" 在 "标签 10" 前）、忽略大小写；英文与标识混排时同样稳定。
 */
const textCollator = new Intl.Collator(['zh-Hans-CN', 'en'], {
  numeric: true,
  sensitivity: 'base',
});

/** 按可读文案比较，用于任何“无特殊顺序要求”的列表排序。 */
export function compareText(left: string, right: string): number {
  return textCollator.compare(left, right);
}

/** 返回按文案排好序的新数组（不改原数组）。 */
export function sortByText<T>(items: readonly T[], text: (item: T) => string): T[] {
  return [...items].sort((left, right) => compareText(text(left), text(right)));
}
