import { Popconfirm as AntPopconfirm, type PopconfirmProps as AntPopconfirmProps } from 'antd';
import { useState } from 'react';
import { confirmButtonProps } from './confirmButtons';

import './Popconfirm.css';

export type PopconfirmProps = AntPopconfirmProps & {
  /**
   * 打开前的异步准备（先查删除影响、先取详情再展示摘要等）：
   * 触发时先执行，返回 false 则不弹出；准备期间重复点击不会弹出第二个气泡。
   */
  prepare?: () => Promise<boolean>;
  /** 宽内容（发布前摘要等字段网格）：气泡容器放宽到对话框宽度，普通确认不用；与 classNames 互斥。 */
  wide?: boolean;
};

/**
 * 二次确认的唯一入口：所有二次确认都锚在触发按钮上的气泡里，不再使用 Modal.confirm 等居中弹窗
 * （静态 Modal 拿不到主题上下文，会出现不随主题的白底弹窗）。
 * 确定/取消按钮与页面其它动作一样带图标，窄屏时随全局规则一起收成仅图标。
 * Ant 的 ConfigProvider 不支持给 Popconfirm 注入按钮属性，只能在这里包装。
 */
export function Popconfirm({
  okButtonProps,
  cancelButtonProps,
  prepare,
  wide = false,
  open: openProp,
  onOpenChange,
  classNames,
  ...props
}: PopconfirmProps) {
  const [open, setOpen] = useState(false);
  const [preparing, setPreparing] = useState(false);

  const handleOpenChange: AntPopconfirmProps['onOpenChange'] = (next) => {
    if (!prepare) {
      onOpenChange?.(next);
      return;
    }
    if (!next) {
      setOpen(false);
      onOpenChange?.(false);
      return;
    }
    if (preparing) return;
    setPreparing(true);
    void prepare()
      .then((ready) => {
        if (!ready) return;
        setOpen(true);
        onOpenChange?.(true);
      })
      .finally(() => setPreparing(false));
  };

  return (
    <AntPopconfirm
      {...props}
      open={prepare ? open : openProp}
      onOpenChange={handleOpenChange}
      classNames={wide ? { container: 'ds-popconfirm--wide' } : classNames}
      okButtonProps={{ ...confirmButtonProps.okButtonProps, ...okButtonProps }}
      cancelButtonProps={{ ...confirmButtonProps.cancelButtonProps, ...cancelButtonProps }}
    />
  );
}
