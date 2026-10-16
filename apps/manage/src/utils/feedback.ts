/**
 * 操作反馈的统一入口：全部使用右上角通知，按内容生成 key 去重；
 * 同一操作结果只在右上角通知一次，不再插入页面、表格或抽屉 Alert。
 *
 * 关闭策略：成功与信息提示自动倒计时关闭（3 秒 + 进度条）；失败与警告常驻（duration 0），
 * 由用户主动关闭——错误通知不许悄悄消失。
 *
 * 通知只属于“用户发起的写操作”这一种场景（FRONTEND-FEEDBACK）：
 * - 写操作完成 → notifyActionSuccess(action)
 * - 写操作失败（后端拒绝 / 网络失败 / 业务返回不成功）→ notifyActionFailed(action, reason)
 * - 写操作被前置条件拦下或只完成了一部分 → notifyWarning(message, description)
 * 读取、加载、刷新、切换页签等不产生通知：读取失败由 QueryErrorAlert/QueryFeedback 常驻内联展示。
 * 文案由动作词表 `common.actions.*` 与模板 `common.feedback.*` 统一拼出，页面不自造“xx成功/失败”。
 */
import i18n, { tFragment } from '@/i18n';
import { notification } from './antdStatic';
import { extractRequestErrorMessage, getRequestErrorStatus } from './requestError';

const DEFAULT_DURATION_SECONDS = 3;

type FeedbackType = 'success' | 'error' | 'warning' | 'info';
type FeedbackDescription = string | undefined;

/** 允许弹出结果通知的写操作动作；读取类动作（查询/刷新/加载）不在其中。 */
export const WRITE_ACTIONS = [
  'create',
  'update',
  'save',
  'delete',
  'reset',
  'enable',
  'disable',
  'sync',
  'export',
  'upload',
  'publish',
  'unpublish',
  'clear',
  'clone',
  'copy',
  'send',
  'logout',
] as const;

export type WriteAction = (typeof WRITE_ACTIONS)[number];

const ACTION_LABELS: Record<WriteAction, () => string> = {
  create: () => tFragment('common.actions.create'),
  update: () => tFragment('common.actions.update'),
  save: () => tFragment('common.actions.save'),
  delete: () => tFragment('common.actions.delete'),
  reset: () => tFragment('common.actions.reset'),
  enable: () => tFragment('common.actions.enable'),
  disable: () => tFragment('common.actions.disable'),
  sync: () => tFragment('common.actions.sync'),
  export: () => tFragment('common.actions.export'),
  upload: () => tFragment('common.actions.upload'),
  publish: () => tFragment('common.actions.publish'),
  unpublish: () => tFragment('common.actions.unpublish'),
  clear: () => tFragment('common.actions.clear'),
  clone: () => tFragment('common.actions.clone'),
  copy: () => tFragment('common.actions.copy'),
  send: () => tFragment('common.actions.send'),
  logout: () => tFragment('common.actions.logout'),
};

function feedbackKey(type: FeedbackType, message: string, description?: FeedbackDescription) {
  return `feedback:${type}:${message}:${description ?? ''}`;
}

function openNotification(type: FeedbackType, message: string, description?: FeedbackDescription) {
  notification[type]({
    key: feedbackKey(type, message, description),
    title: message,
    description,
    // 成功与信息提示自动倒计时关闭；失败与警告常驻，需用户主动关闭。
    duration: type === 'success' || type === 'info' ? DEFAULT_DURATION_SECONDS : 0,
    placement: 'topRight',
  });
}

/** 写操作完成：标题固定为“<动作>成功”，补充信息（条数、对象等）放 description。 */
export function notifyActionSuccess(action: WriteAction, description?: FeedbackDescription) {
  openNotification(
    'success',
    i18n.t('common.feedback.actionSucceeded', { action: ACTION_LABELS[action]() }),
    description
  );
}

/** 写操作失败：标题固定为“<动作>失败”，后端/异常给出的原因放 description。 */
export function notifyActionFailed(action: WriteAction, reason?: unknown) {
  openNotification(
    'error',
    i18n.t('common.feedback.actionFailed', { action: ACTION_LABELS[action]() }),
    failureReason(reason)
  );
}

/** 写操作被拦下或部分完成（前置校验不通过、批量部分失败等）。 */
export function notifyWarning(message: string, description?: FeedbackDescription) {
  openNotification('warning', message, description);
}

/** 系统自动处理的提示（如已选值被核验修正为规范值）：信息级、自动关闭，无需用户处理。 */
export function notifyInfo(message: string, description?: FeedbackDescription) {
  openNotification('info', message, description);
}

/** 从异常或后端返回中提取可展示的失败原因；空值不展示 description。 */
export function failureReason(reason: unknown): string | undefined {
  if (reason == null) return undefined;
  if (typeof reason === 'string') return reason.trim() || undefined;
  // 写操作同样使用 HTTP 信任边界：兼容 RequestError 与未经过请求封装的 Axios 错误。
  const status = getRequestErrorStatus(reason);
  if (reason instanceof Error || status !== undefined) {
    if (status === undefined && reason instanceof Error && !reason.message.trim()) return undefined;
    const fallback = i18n.t('common.request.failed');
    return extractRequestErrorMessage(reason, fallback);
  }
  return undefined;
}
