import { CloseCircleFilled, ReloadOutlined } from '@ant-design/icons';
import { Alert, Button, Empty as AntEmpty, Spin, type EmptyProps, type SpinProps } from 'antd';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

import { extractRequestErrorMessage } from '@/utils/requestError';

import './Feedback.css';

export type AppEmptyProps = Omit<EmptyProps, 'image'>;

/** 空状态统一保留 Ant Design 原生插图，不接受页面私有图片。 */
export function AppEmpty({ className, ...props }: AppEmptyProps) {
  return <AntEmpty {...props} className={['ds-empty', className].filter(Boolean).join(' ')} />;
}

export type QueryFeedbackProps = {
  error?: unknown;
  /** 缺省为通用文案 `common.requestFailed`；加载失败不为页面单独新增文案。 */
  errorTitle?: string;
  retryLabel?: string;
  /** 缺省时不渲染重试入口（调用方没有可重放的加载动作时）。 */
  onRetry?: () => void;
  retrying?: boolean;
  emptyDescription?: ReactNode;
  className?: string;
};

export type QueryErrorAlertProps = Omit<QueryFeedbackProps, 'emptyDescription'> & {
  /** 无数据时用 block（居中占位），有旧数据时用 banner（上方一行）。 */
  layout?: QueryErrorLayout;
};

export type TableQueryBoundaryProps = QueryFeedbackProps & {
  children: (emptyText: ReactNode) => ReactNode;
  hasData: boolean;
};

export type QueryErrorLayout = 'block' | 'banner';

/**
 * 查询失败的统一反馈，只有一行信息 + 一个重试：
 * - `block`：没有可展示的数据时占据内容区，居中排布（与空态同一版式）；
 * - `banner`：已有内容、刷新失败时贴在内容上方的一行提示，保留旧数据。
 * 标题缺省为 `common.requestFailed`，加载失败不再要求页面提供专属文案；
 * 信息只出现一次：`extractRequestErrorMessage` 已把标题与状态码合成一句，不再另起标题。
 */
export function QueryErrorAlert({
  error,
  errorTitle,
  retryLabel,
  onRetry,
  retrying = false,
  className,
  layout = 'banner',
}: QueryErrorAlertProps) {
  const { t } = useTranslation();
  if (!error) return null;
  const title = errorTitle ?? t('common.requestFailed');
  const detail = extractRequestErrorMessage(error, title);
  // 一句话：状态码类信息已含标题（“请求失败 (502)”）直接用；业务原因则“标题：原因”，不分两行重复
  const errorMessage = detail.startsWith(title)
    ? detail
    : t('common.feedback.errorDetail', { title, detail });
  const retry = onRetry ? (
    <Button icon={<ReloadOutlined aria-hidden />} size="small" loading={retrying} onClick={onRetry}>
      {retryLabel ?? t('common.actions.retry')}
    </Button>
  ) : null;
  if (layout === 'block') {
    return (
      <div className={['ds-query-error', className].filter(Boolean).join(' ')} role="alert">
        <CloseCircleFilled className="ds-query-error__icon" aria-hidden="true" />
        <span className="ds-query-error__message">{errorMessage}</span>
        {retry}
      </div>
    );
  }
  return (
    <Alert
      className={['ds-query-feedback', className].filter(Boolean).join(' ')}
      type="error"
      showIcon
      title={errorMessage}
      action={retry ?? undefined}
    />
  );
}

/** 查询结果的互斥空/错误状态；错误存在时绝不同时渲染成功空态。 */
export function QueryFeedback({
  error,
  errorTitle,
  retryLabel,
  onRetry,
  retrying = false,
  emptyDescription,
  className,
}: QueryFeedbackProps) {
  if (!error) {
    return <AppEmpty className={className} description={emptyDescription} />;
  }

  return (
    <QueryErrorAlert
      {...{ error, errorTitle, retryLabel, onRetry, retrying, className }}
      layout="block"
    />
  );
}

/**
 * 为表格统一处理首次失败与刷新失败：首次失败占据空态，已有结果刷新失败时
 * 保留表格内容并在表格外展示常驻错误，避免 ProTable 不渲染 emptyText 时吞错。
 */
export function TableQueryBoundary({
  children,
  hasData,
  ...feedbackProps
}: TableQueryBoundaryProps) {
  const retainedError = hasData ? <QueryErrorAlert {...feedbackProps} layout="banner" /> : null;
  const emptyText = hasData && feedbackProps.error ? null : <QueryFeedback {...feedbackProps} />;

  return (
    <>
      {retainedError}
      {children(emptyText)}
    </>
  );
}

export type LoadingStateProps = {
  label: string;
  className?: string;
  variant?: 'inline' | 'section' | 'page';
};

/** 无法量化的只读加载状态；刷新已有内容时应由调用方保留原内容。 */
export function LoadingState({ label, className, variant = 'section' }: LoadingStateProps) {
  return (
    <div
      className={['ds-loading-state', `ds-loading-state--${variant}`, className]
        .filter(Boolean)
        .join(' ')}
      role="status"
      aria-live="polite"
      aria-busy="true"
      aria-label={label}
    >
      <Spin description={label} />
    </div>
  );
}

export type LoadingIndicatorProps = Pick<SpinProps, 'size'> & {
  label: string;
  className?: string;
};

/** 控件、选项面板和紧凑消息中的行内加载反馈。 */
export function LoadingIndicator({ label, className, size = 'small' }: LoadingIndicatorProps) {
  return (
    <span
      className={['ds-loading-indicator', className].filter(Boolean).join(' ')}
      role="status"
      aria-live="polite"
      aria-label={label}
    >
      <Spin size={size} />
    </span>
  );
}

export type LoadingOverlayProps = {
  loading: boolean;
  label: string;
  children: ReactNode;
  className?: string;
  /** 占满父级已约束的高度；内容仍由自己的区域承担滚动。 */
  fill?: boolean;
};

/** 刷新或读取时保留已挂载内容的统一遮罩。 */
export function LoadingOverlay({
  loading,
  label,
  children,
  className,
  fill = false,
}: LoadingOverlayProps) {
  return (
    <Spin
      spinning={loading}
      description={label}
      className={['ds-loading-overlay', fill ? 'ds-loading-overlay--fill' : undefined, className]
        .filter(Boolean)
        .join(' ')}
      classNames={
        fill
          ? { root: 'ds-loading-overlay--fill', container: 'ds-loading-overlay__content--fill' }
          : undefined
      }
    >
      {children}
    </Spin>
  );
}
