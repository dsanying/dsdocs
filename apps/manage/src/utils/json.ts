/** 只负责 JSON 语法解析；领域结构必须由调用方自己的 validator 校验。 */
export function parseJsonText(text: string): unknown {
  return JSON.parse(text) as unknown;
}

/** 统一使用两空格输出；undefined 与 JSON.stringify 的原生语义一致。 */
export function formatJson(value: unknown): string | undefined {
  return JSON.stringify(value, null, 2);
}

/** 面向只读展示：合法 JSON 字符串会格式化，普通文本保持原样。 */
export function formatUnknownJson(value: unknown, emptyText = '—'): string {
  if (value === null || value === undefined || value === '') return emptyText;

  try {
    const normalized = typeof value === 'string' ? parseJsonText(value) : value;
    return formatJson(normalized) ?? emptyText;
  } catch {
    return typeof value === 'string' ? value : String(value);
  }
}
