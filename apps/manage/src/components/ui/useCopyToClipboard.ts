import { useCallback, useEffect, useRef, useState } from 'react';
import { notifyActionFailed } from '@/utils/feedback';

const COPIED_RESET_MS = 1500;

/**
 * 剪贴板复制的唯一入口：成功后在短时间内暴露 `copied` 供图标切换为已复制态，
 * 失败统一右上角通知。业务代码不得直接访问 navigator.clipboard。
 */
export function useCopyToClipboard() {
  const [copied, setCopied] = useState(false);
  const resetTimer = useRef<number | undefined>(undefined);

  useEffect(() => () => window.clearTimeout(resetTimer.current), []);

  const copy = useCallback(async (text: string): Promise<boolean> => {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      notifyActionFailed('copy');
      return false;
    }
    setCopied(true);
    window.clearTimeout(resetTimer.current);
    resetTimer.current = window.setTimeout(() => setCopied(false), COPIED_RESET_MS);
    return true;
  }, []);

  return { copy, copied };
}
