import type { ButtonProps } from 'antd';
import { useRef, useState } from 'react';

/** 提交按钮的动作：文案与图标由共享层按动作统一给出（默认“保存”）。 */
export type FormSubmitAction = 'save' | 'create' | 'query' | 'export';

/** 弹窗/抽屉表单页脚的可选覆盖：只允许改按钮状态（loading、disabled）与动作种类，文案与图标由共享层统一。 */
export type FormSubmitter =
  | false
  | {
      action?: FormSubmitAction;
      submitButtonProps?: Pick<ButtonProps, 'loading' | 'disabled'>;
      /** 传 false 隐藏取消按钮。 */
      resetButtonProps?: false | Pick<ButtonProps, 'disabled'>;
    };

/** 提交中的状态与 `onFinish` 返回 true 即关闭的语义：Modal 与 Drawer 表单共用。 */
export function useFormSubmit<T>(
  onFinish: ((values: T) => Promise<boolean | void> | boolean | void) | undefined,
  close: () => void
) {
  const [submitting, setSubmitting] = useState(false);
  const pending = useRef(false);
  const submit = async (values: T) => {
    if (pending.current) return;
    pending.current = true;
    setSubmitting(true);
    try {
      const done = await onFinish?.(values);
      if (done === true) close();
    } finally {
      pending.current = false;
      setSubmitting(false);
    }
  };
  return { submitting, submit };
}
