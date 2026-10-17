import { useCallback, useEffect, useRef, type DependencyList, type RefObject } from 'react';
import { useTranslation } from 'react-i18next';

import { notifyWarning } from '@/utils/feedback';

/**
 * 远端核验控件的粘贴未命中提示：本地候选只是全集的一页，未命中不等于不存在，
 * 因此粘贴时先挂起，等 useRemoteOptions 的核验（精确+折叠）落定后只对仍未决、且仍在已选里的值警告。
 * selectedRef 由调用方持有并在修正时同步推进，避免读到滞后快照；
 * scope 变化（字段/实体切换）即核验作用域切换，挂起值随之作废。
 */
export function usePasteVerificationNotice(
  selectedRef: RefObject<readonly string[]>,
  scope: DependencyList = []
) {
  const { t } = useTranslation();
  const pending = useRef(new Set<string>());
  useEffect(() => {
    pending.current.clear();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- scope 是调用方声明的核验作用域
  }, scope);
  const onPasteUnknown = useCallback((values: string[]) => {
    for (const value of values) pending.current.add(value);
  }, []);
  const onVerifySettled = useCallback(
    (settled: readonly string[], unresolved: readonly string[]) => {
      const pasted = new Set(settled.filter((value) => pending.current.delete(value)));
      const remaining = unresolved.filter(
        (value) => pasted.has(value) && selectedRef.current.includes(value)
      );
      if (remaining.length) {
        notifyWarning(
          t('common.feedback.pasteIgnoredValues', { count: remaining.length }),
          remaining.join(', ')
        );
      }
    },
    [selectedRef, t]
  );
  return { onPasteUnknown, onVerifySettled };
}
