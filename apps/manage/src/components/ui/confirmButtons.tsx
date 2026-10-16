import { CheckOutlined, CloseOutlined } from '@ant-design/icons';
import type { ButtonProps, ModalProps } from 'antd';

/**
 * 确定/取消按钮的统一外观：与页面动作同为“图标 + 文字”，窄屏随全局规则一起收成仅图标。
 * App 根通过 ConfigProvider.modal 注入给 Modal/Modal.confirm，Popconfirm 由共享包装注入。
 */
export const confirmButtonProps: { okButtonProps: ButtonProps; cancelButtonProps: ButtonProps } = {
  okButtonProps: { icon: <CheckOutlined /> },
  cancelButtonProps: { icon: <CloseOutlined /> },
};

/** 所有受控 Modal 共用短视口布局：标题/页脚可达，仅正文滚动。 */
export const modalDefaults: Pick<
  ModalProps,
  'centered' | 'styles' | 'okButtonProps' | 'cancelButtonProps'
> = {
  ...confirmButtonProps,
  centered: true,
  styles: {
    container: {
      display: 'flex',
      flexDirection: 'column',
      maxHeight: 'calc(100dvh - var(--ds-space-32) - var(--ds-space-32))',
      overflow: 'hidden',
    },
    body: { minHeight: 0, flex: '1 1 auto', overflowY: 'auto' },
    header: { flexShrink: 0 },
    footer: { flexShrink: 0 },
  },
};
