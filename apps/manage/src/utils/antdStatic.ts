/**
 * Antd v6 静态 notification 兼容层。
 *
 * antd v6 静态调用拿不到 ConfigProvider 上下文；本模块经 App.tsx 的
 * <AntdStaticBridge /> 转发 contextual instance。操作反馈统一走
 * @/utils/feedback 的 notify*（右上角通知），本模块只保留 notification；
 * 二次确认一律用 components/ui 的 Popconfirm（锚在触发按钮上），不再提供 modal.confirm。
 */
import type { NotificationInstance } from 'antd/es/notification/interface';

let notificationInstance: NotificationInstance | null = null;

export function setStaticInstances(api: { notification: NotificationInstance }): void {
  notificationInstance = api.notification;
}

function warnNoBridge(name: string) {
  if (typeof console !== 'undefined') {
    console.warn(`[antdStatic] ${name} called before AntdStaticBridge mounted, ignored`);
  }
}

/**
 * Proxy 实现：所有 message.X(...) 调用都转发给 contextual instance。
 * 用 Proxy 而不是手写每个方法，能 cover 任何未来 antd 加的方法。
 */
function makeProxy<T extends object>(getter: () => T | null, name: string): T {
  return new Proxy({} as T, {
    get(_target, prop) {
      const inst = getter();
      if (!inst) {
        return (..._args: unknown[]) => warnNoBridge(`${name}.${String(prop)}`);
      }
      const value = (inst as any)[prop];
      if (typeof value === 'function') {
        return value.bind(inst);
      }
      return value;
    },
  });
}

export const notification = makeProxy<NotificationInstance>(
  () => notificationInstance,
  'notification'
);
