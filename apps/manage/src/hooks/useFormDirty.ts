import { Form, type FormInstance } from 'antd';
import { useMemo } from 'react';

/** 归一化：undefined/null/"" 视为空，非空字符串保留原始空白，dayjs 等对象按 ISO 时间比较。 */
function normalize(value: unknown): unknown {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) return value.map(normalize);
  if (typeof value === 'object') {
    const record = value as Record<string, unknown> & {
      toISOString?: () => string;
      format?: (pattern: string) => string;
    };
    if (typeof record.format === 'function' && typeof record.toISOString === 'function')
      return record.toISOString();
    return Object.fromEntries(
      Object.keys(record)
        .sort()
        .map((key) => [key, normalize(record[key])])
        .filter(([, item]) => item !== null)
    );
  }
  return value;
}

/** 深比较两份值是否相同（经归一化）。 */
export function isSameValue(left: unknown, right: unknown): boolean {
  return JSON.stringify(normalize(left)) === JSON.stringify(normalize(right));
}

/**
 * 表单是否有未保存修改：把 Ant Form 的全部字段值与基线（已保存/初始值）深比较。
 * 基线由页面在装载数据时给出；表单字段值变化时随 useWatch 重算。
 */
export function useFormDirty(
  form: FormInstance,
  baseline: Record<string, unknown> | undefined
): boolean {
  const values = Form.useWatch([], form) as Record<string, unknown> | undefined;
  return useMemo(() => dirtyKeys(values, baseline).length > 0, [baseline, values]);
}

/** 与基线不同的字段名（供页面判断与排查）。 */
export function dirtyKeys(
  values: Record<string, unknown> | undefined,
  baseline: Record<string, unknown> | undefined
): string[] {
  if (!baseline || !values) return [];
  // 只比较当前已渲染（已注册）的字段：条件渲染的字段没挂出来时用户也改不了它
  return Object.keys(values).filter((key) => !isSameValue(values[key], baseline[key]));
}
