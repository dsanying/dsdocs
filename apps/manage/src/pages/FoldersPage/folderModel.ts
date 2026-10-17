import type { Folder } from '@/services';
/** 清空选择必须携带 null；省略字段在 PATCH 中表示保留旧值。 */
export function folderChanges(values: Record<string, unknown>, editing: Partial<Folder> | null) {
  return {
    ...values,
    parent: values.parent ?? null,
    ...(editing?.id ? { version: editing.version } : {}),
  };
}
