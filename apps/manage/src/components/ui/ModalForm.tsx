import { Form, Modal, type FormProps, type ModalProps } from 'antd';
import type { ReactNode } from 'react';

import { useFormDirty } from '@/hooks/useFormDirty';

import { FormInitialization } from './FormInitialization';
import { FormFooter } from './FormFooter';
import { useFormSubmit, type FormSubmitter } from './useFormSubmit';

export type ModalFormProps<T = Record<string, unknown>> = Omit<
  FormProps<T>,
  'title' | 'onFinish'
> & {
  /** 异步装载或非表单草稿由调用方显式提供脏状态。 */
  dirty?: boolean;
  title?: ReactNode;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  width?: ModalProps['width'];
  /** 弹窗本身的其他属性；`open`/`title`/`footer` 由共享层接管。 */
  modalProps?: Omit<
    ModalProps,
    'open' | 'title' | 'footer' | 'width' | 'confirmLoading' | 'destroyOnHidden'
  >;
  submitter?: FormSubmitter;
  /** 返回 true 表示完成并关闭弹窗；返回 false/undefined 保持打开（页面也可自行关闭）。 */
  onFinish?: (values: T) => Promise<boolean | void> | boolean | void;
  children?: ReactNode;
};

/**
 * 一次性工具动作的弹窗表单（Ant Modal + Form）：只用于不改动对象的查询、导出（submitter.action 为 query / export），
 * 对象的新建与编辑一律用 DrawerForm。统一按钮、提交中状态、`onFinish` 返回 true 自动关闭、关闭即销毁表单。
 */
export function ModalForm<T = Record<string, unknown>>({
  title,
  open,
  onOpenChange,
  dirty,
  width,
  modalProps,
  submitter,
  onFinish,
  children,
  form: externalForm,
  layout = 'vertical',
  ...formProps
}: ModalFormProps<T>) {
  const [form] = Form.useForm<T>(externalForm);
  const formDirty = useFormDirty(form, formProps.initialValues ?? {});
  const close = () => onOpenChange?.(false);
  const { submitting, submit } = useFormSubmit<T>(onFinish, close);
  // 干净编辑态页脚为空：退出由弹窗头部 × 承担（查询/导出等非编辑动作保留取消配对）
  const footerAction = submitter ? (submitter.action ?? 'save') : 'save';
  const showFooter =
    submitter !== false &&
    (!(footerAction === 'save' || footerAction === 'create') || Boolean(dirty ?? formDirty));
  return (
    <Modal
      {...modalProps}
      closable={!submitting}
      keyboard={!submitting}
      destroyOnHidden
      open={open}
      title={title}
      width={width}
      onCancel={(event) => {
        if (submitting) return;
        modalProps?.onCancel?.(event);
        close();
      }}
      footer={
        showFooter ? (
          <FormFooter
            dirty={dirty ?? formDirty}
            form={form}
            submitter={submitter}
            submitting={submitting}
            onCancel={(event) => {
              if (submitting) return;
              modalProps?.onCancel?.(event);
              close();
            }}
          />
        ) : null
      }
    >
      <Form<T> {...formProps} clearOnDestroy form={form} layout={layout} onFinish={submit}>
        <FormInitialization form={form} initialValues={formProps.initialValues} />
        {children}
      </Form>
    </Modal>
  );
}
