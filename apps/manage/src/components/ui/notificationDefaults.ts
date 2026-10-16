import type { AppProps } from 'antd';

/** 全站右上通知采用原地淡入淡出；公开 root 样式保留堆叠缩放，避免水平运动产生裁切溢出。 */
export const notificationDefaults = {
  placement: 'topRight',
  styles: { root: { transform: 'translate3d(0, 0, 0) scale(var(--notification-scale, 1))' } },
} satisfies NonNullable<AppProps['notification']>;
