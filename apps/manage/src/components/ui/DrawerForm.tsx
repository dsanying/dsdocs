import { Drawer, Form, type DrawerProps } from 'antd';

import { designTokens } from '@/design/tokens';

import { useFormDirty } from '@/hooks/useFormDirty';

import { FormInitialization } from './FormInitialization';
import { FormFooter } from './FormFooter';
import type { ModalFormProps } from './ModalForm';
import { useFormSubmit, type FormSubmitter } from './useFormSubmit';

import './DrawerForm.css';

export type DrawerFormProps<T = Record<string, unknown>> = Omit<
  ModalFormProps<T>,
  'modalProps' | 'width'
> & {
  /** 抽屉本身的其他属性；宽度统一为 designTokens.layout.drawerWidth，`size`/`open`/`title`/`footer` 由共享层接管。 */
  drawerProps?: Omit<
    DrawerProps,
    'children' | 'footer' | 'height' | 'open' | 'title' | 'width' | 'size' | 'destroyOnHidden'
  >;
  submitter?: FormSubmitter;
};

/**
 * 对象新建 / 编辑的唯一容器（Ant Drawer + Form）：配置条目无论字段多少都在同一宽度的右侧抽屉里编辑，
 * 列表上下文保持可见；表单正文由 Drawer body 独立滚动，提交与取消固定在 footer。
 * 不改动对象的一次性工具动作（查询、导出）才用 ModalForm。
 */
export function DrawerForm<T = Record<string, unknown>>({
  title,
  open,
  onOpenChange,
  dirty,
  drawerProps,
  submitter,
  onFinish,
  children,
  form: externalForm,
  layout = 'vertical',
  ...formProps
}: DrawerFormProps<T>) {
  const [form] = Form.useForm<T>(externalForm);
  const formDirty = useFormDirty(form, formProps.initialValues ?? {});
  const close = () => onOpenChange?.(false);
  const { submitting, submit } = useFormSubmit<T>(onFinish, close);
  // 干净编辑态页脚为空：退出由抽屉头部 × 承担，不留空页脚条
  const footerAction = submitter ? (submitter.action ?? 'save') : 'save';
  const showFooter =
    submitter !== false &&
    (!(footerAction === 'save' || footerAction === 'create') || Boolean(dirty ?? formDirty));
  const onClose: DrawerProps['onClose'] = (event) => {
    if (submitting) return;
    drawerProps?.onClose?.(event);
    close();
  };
  return (
    <Drawer
      {...drawerProps}
      size={designTokens.layout.drawerWidth}
      closable={!submitting}
      keyboard={!submitting}
      destroyOnHidden
      open={open}
      title={title}
      onClose={onClose}
      footer={
        showFooter ? (
          <div className="ds-drawer-form-footer">
            <FormFooter
              dirty={dirty ?? formDirty}
              form={form}
              submitter={submitter}
              submitting={submitting}
              onCancel={onClose}
            />
          </div>
        ) : null
      }
    >
      <Form<T> {...formProps} clearOnDestroy form={form} layout={layout} onFinish={submit}>
        <FormInitialization form={form} initialValues={formProps.initialValues} />
        {children}
      </Form>
    </Drawer>
  );
}
