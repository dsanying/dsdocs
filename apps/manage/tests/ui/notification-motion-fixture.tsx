import { CloseOutlined, NotificationOutlined } from '@ant-design/icons';
import { App, Button } from 'antd';

/** 真实 Ant 通知进入与退出：保留动画，窄屏也不沿水平方向越出裁切边界。 */
export function NotificationMotionFixture() {
  const { notification } = App.useApp();
  return (
    <main>
      <h1>通知动画边界</h1>
      <Button
        icon={<NotificationOutlined />}
        onClick={() =>
          notification.success({ key: 'motion', title: 'Export succeeded', duration: 0 })
        }
      >
        显示通知
      </Button>
      <Button icon={<CloseOutlined />} onClick={() => notification.destroy('motion')}>
        关闭通知
      </Button>
    </main>
  );
}
