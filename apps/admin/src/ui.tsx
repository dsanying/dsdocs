import { useEffect, useState, type ReactNode } from 'react';
import {
  Alert,
  Button,
  Empty,
  Space,
  Spin,
  Table,
  Tooltip,
  type ButtonProps,
  type TableProps,
} from 'antd';
import { ReloadOutlined } from '@ant-design/icons';
import { api, errorMessage } from './api';
import { useText } from './i18n';
export function useResource<T>(route: string | null) {
  const [generation, refresh] = useState(0),
    [state, set] = useState<{ route: string | null; data?: T; error?: unknown; loading: boolean }>({
      route: null,
      loading: true,
    });
  useEffect(() => {
    if (route === null) return;
    const controller = new AbortController();
    let alive = true;
    set((previous) => ({
      route,
      data: previous.route === route ? previous.data : undefined,
      loading: true,
    }));
    void api<T>(route, 'GET', undefined, controller.signal)
      .then((data) => {
        if (alive) set({ route, data, loading: false });
      })
      .catch((error) => {
        if (alive) set((previous) => ({ ...previous, error, loading: false }));
      });
    return () => {
      alive = false;
      controller.abort();
    };
  }, [route, generation]);
  return {
    data: state.route === route ? state.data : undefined,
    error: state.route === route ? state.error : undefined,
    loading: route !== null && (state.route !== route || state.loading),
    refresh: () => refresh((value) => value + 1),
  };
}
export function Page({
  title,
  actions,
  children,
}: {
  title: string;
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="page">
      <header className="page-header">
        <h1>{title}</h1>
        <div className="page-actions">{actions}</div>
      </header>
      <div className="page-content">{children}</div>
    </section>
  );
}
export function Action({ label, ...props }: ButtonProps & { label: string }) {
  return (
    <Tooltip title={label} styles={{ root: { pointerEvents: 'none' } }}>
      <Button {...props} aria-label={label}>
        <span className="action-label">{label}</span>
      </Button>
    </Tooltip>
  );
}
export function Feedback({
  error,
  loading,
  onRetry,
}: {
  error?: unknown;
  loading?: boolean;
  onRetry?: () => void;
}) {
  const { t } = useText();
  if (error)
    return (
      <Alert
        type="error"
        showIcon
        title={t('readFailed')}
        description={errorMessage(error)}
        action={
          onRetry ? (
            <Button icon={<ReloadOutlined aria-hidden />} onClick={onRetry}>
              {t('retry')}
            </Button>
          ) : undefined
        }
      />
    );
  return loading ? <Spin aria-label={t('loading')} /> : null;
}
export function Value({ children }: { children: ReactNode }) {
  return (
    <span
      className="value-scroll"
      tabIndex={typeof children === 'string' && children.length > 30 ? 0 : undefined}
    >
      {children ?? '—'}
    </span>
  );
}
export function DataTable<T extends object>(props: TableProps<T>) {
  const { t } = useText();
  return (
    <div className="data-panel">
      <Table<T>
        rowKey="id"
        size="middle"
        locale={{ emptyText: <Empty description={t('empty')} /> }}
        scroll={{ x: 'max-content' }}
        {...props}
      />
    </div>
  );
}
export const pagination = (
  current: number,
  pageSize: number,
  total: number,
  onChange: (page: number, size: number) => void
) => ({
  current,
  pageSize,
  total,
  onChange,
  showSizeChanger: true,
  pageSizeOptions: [10, 20, 50, 100],
});
export function Actions({ children }: { children: ReactNode }) {
  return <Space size="small">{children}</Space>;
}
