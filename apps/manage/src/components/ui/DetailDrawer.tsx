import { EyeOutlined } from '@ant-design/icons';
import { Button, Drawer, type DrawerProps } from 'antd';
import { useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

type DrawerSize = NonNullable<DrawerProps['size']>;

// Ant `size` 语义值对应的像素宽（与 antd Drawer.js 的映射一致）：resizable 拖拽与显式 size 互斥，
// 必须把语义尺寸先换算成像素、再由 resizable.onResize 回写受控宽度才能拖得动。
const SEMANTIC_SIZE_PX = { default: 378, large: 736 } as const;

const resolveInitialSize = (size: DrawerSize): number | string => {
  if (typeof size === 'number') return size;
  if (size === 'default' || size === 'large') return SEMANTIC_SIZE_PX[size];
  const num = Number(size);
  return Number.isFinite(num) && size.trim() !== '' ? num : size;
};

export type DetailDrawerProps = {
  title: ReactNode;
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  /** 清理详情或恢复业务状态应在退出动画结束后执行。 */
  afterOpenChange?: DrawerProps['afterOpenChange'];
  /** 只读内容默认用宽抽屉（Ant `large`）；短清单可传 `default`。像素/语义尺寸可拖拽调宽，百分比等非像素尺寸退化为固定宽。 */
  size?: DrawerProps['size'];
  /** 默认开启左缘拖拽调宽（Ant 6 `resizable`，受控接线）；明确传 false 关闭。 */
  resizable?: boolean;
};

/**
 * “查看细则”的唯一承载：右侧只读抽屉（不遮住表格上下文，长 JSON / 清单可整页滚动），无页脚、关闭只靠头部 ×，
 * 关闭即销毁内容。页面自己持有打开状态时用它；触发按钮与抽屉成对时用 `DetailDrawerButton`。
 */
export function DetailDrawer({
  title,
  open,
  onClose,
  children,
  afterOpenChange,
  size = 'large',
  resizable = true,
}: DetailDrawerProps) {
  const [width, setWidth] = useState<number | string>(() => resolveInitialSize(size));
  // size prop 变化时在渲染期间同步重置（比 useEffect 少一轮渲染，避免级联渲染告警）
  const [prevSize, setPrevSize] = useState(size);
  if (prevSize !== size) {
    setPrevSize(size);
    setWidth(resolveInitialSize(size));
  }
  const dragEnabled = resizable && typeof width === 'number';
  return (
    <Drawer
      open={open}
      onClose={onClose}
      title={title}
      size={width}
      afterOpenChange={afterOpenChange}
      destroyOnHidden
      resizable={dragEnabled ? { onResize: setWidth } : undefined}
    >
      {children}
    </Drawer>
  );
}

export type DetailDrawerButtonProps = Omit<DetailDrawerProps, 'open' | 'onClose'>;

/**
 * 内容量大、平时不看的字段（JSON 备注、原始记录、关系清单）在表格/网格里只放一个
 * “图标 + 查看”的文字按钮，点击在共享 DetailDrawer 里展开；不把内容摊在格内，也不用纯图标。
 */
export function DetailDrawerButton({ children, ...drawerProps }: DetailDrawerButtonProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button type="text" size="small" icon={<EyeOutlined />} onClick={() => setOpen(true)}>
        {t('common.actions.view')}
      </Button>
      <DetailDrawer {...drawerProps} open={open} onClose={() => setOpen(false)}>
        {children}
      </DetailDrawer>
    </>
  );
}
