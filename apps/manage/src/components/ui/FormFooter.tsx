import {
  CloseOutlined,
  DownloadOutlined,
  PlusOutlined,
  SaveOutlined,
  SearchOutlined,
} from '@ant-design/icons';
import { Button, type FormInstance } from 'antd';
import type { MouseEvent, ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

import { ResponsiveActions } from './ResponsiveTableToolbar';
import type { FormSubmitAction, FormSubmitter } from './useFormSubmit';

const SUBMIT_ICONS: Record<FormSubmitAction, ReactNode> = {
  save: <SaveOutlined aria-hidden />,
  create: <PlusOutlined aria-hidden />,
  query: <SearchOutlined aria-hidden />,
  export: <DownloadOutlined aria-hidden />,
};

/** 提交按钮文案：只有这几种动作，静态写出（i18n 门禁要求键可静态追踪）。 */
function submitLabel(action: FormSubmitAction, t: (key: string) => string): string {
  if (action === 'create') return t('common.actions.create');
  if (action === 'query') return t('common.actions.query');
  if (action === 'export') return t('common.actions.export');
  return t('common.actions.save');
}

/** 弹窗/抽屉表单页脚：编辑态干净时不渲染（退出由容器头部 × 承担），脏时取消/保存；一次性工具动作（查询/导出）保留取消配对。 */
export function FormFooter({
  form,
  submitter,
  submitting,
  dirty,
  onCancel,
}: {
  form: FormInstance;
  submitter?: FormSubmitter;
  submitting: boolean;
  dirty: boolean;
  onCancel: (event: MouseEvent<HTMLButtonElement>) => void;
}) {
  const { t } = useTranslation();
  if (submitter === false) return null;
  const action = submitter?.action ?? 'save';
  const editing = action === 'save' || action === 'create';
  const changed = !editing || dirty;
  if (!changed) return null;
  return (
    <ResponsiveActions>
      {submitter?.resetButtonProps === false ? null : (
        <Button
          icon={<CloseOutlined aria-hidden />}
          onClick={onCancel}
          {...submitter?.resetButtonProps}
          disabled={
            submitting ||
            Boolean(submitter?.resetButtonProps && submitter.resetButtonProps.disabled)
          }
        >
          {t('common.actions.cancel')}
        </Button>
      )}
      <Button
        type="primary"
        icon={editing ? <SaveOutlined aria-hidden /> : SUBMIT_ICONS[action]}
        loading={submitting}
        onClick={() => form.submit()}
        {...submitter?.submitButtonProps}
        disabled={submitting || submitter?.submitButtonProps?.disabled}
        aria-label={submitLabel(editing ? 'save' : action, t)}
      >
        {submitLabel(editing ? 'save' : action, t)}
      </Button>
    </ResponsiveActions>
  );
}
