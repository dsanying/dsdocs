import { useEffect, useEffectEvent } from 'react';
import type { FormInstance } from 'antd';

/** 随表单正文挂载回填初始值，覆盖 StrictMode 重演期间 clearOnDestroy 清空的 store。 */
export function FormInitialization({
  form,
  initialValues,
}: {
  form: FormInstance;
  initialValues?: Record<string, unknown>;
}) {
  const initialize = useEffectEvent(() => {
    if (initialValues) form.setFieldsValue(initialValues);
  });
  useEffect(() => {
    initialize();
  }, [form]);
  return null;
}
