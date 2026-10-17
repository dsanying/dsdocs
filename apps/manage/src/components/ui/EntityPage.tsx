import { EditOutlined } from '@ant-design/icons';
import { Button } from 'antd';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useSearchParams } from 'react-router';

import { AppPage } from './AppPage';
import { LoadingOverlay, LoadingState, QueryErrorAlert, QueryFeedback } from './Feedback';
import { InformationFieldGrid, type InformationField } from './InformationFieldGrid';
import { ContentStack } from './Layout';
import { ResponsiveActions } from './ResponsiveTableToolbar';
import { SaveBar, type SaveBarProps } from './SaveBar';
import { SummaryStrip, type SummaryStripItem } from './SummaryStrip';
import './EntityPage.css';

/** 实体页的读取状态：首次加载、读取失败、刷新失败都按同一规则呈现。 */
export type EntityQueryState = {
  /** 已有可展示的对象数据。 */
  ready: boolean;
  loading: boolean;
  error?: unknown;
  /** 加载失败标题缺省为通用文案（QueryErrorAlert），无需页面提供。 */
  errorTitle?: string;
  onRetry: () => void;
  /** 读取完成但对象不存在时的说明。 */
  notFoundDescription?: ReactNode;
};

export type EntityDetailTab = {
  key: string;
  label: string;
  render: () => ReactNode;
};

export type EntityDetailPageProps = {
  /** 对象名：同时是一级标题与面包屑末项（读取前留空，回退到导航树里的页面名）。 */
  title?: string;
  /** 紧跟标题的对象状态（StatusTag）。 */
  status?: ReactNode;
  /** 列表页地址：页头返回按钮回到这里。 */
  backTo: string;
  /** 编辑页地址：给出即在页头最前放“编辑”，编辑入口只在详情页。 */
  editTo?: string;
  /** 编辑之外的对象操作（启用/禁用、重置、发布、删除……），中性在前、危险在后。 */
  actions?: ReactNode;
  /** 关键指标（金额、用量、计数）：页头下的摘要条。 */
  summaryLabel?: string;
  summary?: SummaryStripItem[];
  /** 其余只读属性：页头下的字段网格（覆盖编辑表单里的全部字段 + 只读元数据）。 */
  fields?: InformationField[];
  /** 从属数据（明细、权限、调用记录）：页签，当前页签记在地址的 ?tab= 里，可分享、刷新不丢。 */
  tabs?: EntityDetailTab[];
  query: EntityQueryState;
  /** 没有页签时的正文。 */
  children?: ReactNode;
};

/**
 * 业务实体详情页的唯一版式（列表 → 详情 → 编辑三步中的第二步）：
 * 页头 = 返回 + 对象名 + 状态 + 操作（编辑在最前）；说明区 = 摘要条 + 字段网格；正文 = 页签或单块内容。
 * 首次加载占位、读取失败整块提示、刷新失败保留旧内容并在上方一行提示，页面不再各自拼。
 */
export function EntityDetailPage({
  title,
  status,
  backTo,
  editTo,
  actions,
  summaryLabel,
  summary,
  fields,
  tabs,
  query,
  children,
}: EntityDetailPageProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const tabKeys = tabs?.map((tab) => tab.key) ?? [];
  const requestedTab = searchParams.get('tab') ?? '';
  const activeTab = tabKeys.includes(requestedTab) ? requestedTab : tabKeys[0];

  const header =
    query.ready && (summary?.length || fields?.length) ? (
      <div className="ds-entity-info">
        {summary?.length ? (
          <SummaryStrip label={summaryLabel ?? title ?? ''} items={summary} />
        ) : null}
        {fields?.length ? <InformationFieldGrid compact items={fields} /> : null}
      </div>
    ) : undefined;

  const pageActions =
    query.ready && (editTo || actions) ? (
      <ResponsiveActions>
        {editTo ? (
          <Button icon={<EditOutlined />} onClick={() => navigate(editTo)}>
            {t('common.actions.edit')}
          </Button>
        ) : null}
        {actions}
      </ResponsiveActions>
    ) : undefined;

  const feedback = {
    error: query.error,
    errorTitle: query.errorTitle,
    onRetry: query.onRetry,
    retrying: query.loading,
  };
  const body = !query.ready ? (
    query.loading ? (
      <LoadingState variant="page" label={t('common.loadingPage')} />
    ) : (
      <QueryFeedback {...feedback} emptyDescription={query.notFoundDescription} />
    )
  ) : (
    <ContentStack>
      <QueryErrorAlert {...feedback} layout="banner" />
      <LoadingOverlay loading={query.loading} label={t('common.loadingPage')}>
        {tabs?.length ? tabs.find((tab) => tab.key === activeTab)?.render() : children}
      </LoadingOverlay>
    </ContentStack>
  );

  return (
    <AppPage
      title={title}
      status={query.ready ? status : undefined}
      onBack={() => navigate(backTo)}
      extra={pageActions}
      content={header}
      tabList={
        query.ready && tabs?.length
          ? tabs.map((tab) => ({ key: tab.key, tab: tab.label }))
          : undefined
      }
      tabActiveKey={activeTab}
      onTabChange={(key) => {
        const next = new URLSearchParams(searchParams);
        if (key === tabKeys[0]) next.delete('tab');
        else next.set('tab', key);
        setSearchParams(next, { replace: true });
      }}
    >
      {body}
    </AppPage>
  );
}

export type EntityEditPageProps = {
  /** 只在导航树给不出名字时传（同一路由的新建/编辑两态）。 */
  title?: string;
  /** 编辑态：所编辑对象的名字，面包屑上一级显示它并链回详情（新建不传）。 */
  objectName?: string;
  /** 返回地址：编辑回到详情，新建回到列表。 */
  backTo: string;
  /** 编辑态读取原对象的状态；新建不传。 */
  query?: EntityQueryState;
  /** 页头的辅助操作（复制自已有对象、导入等），编辑动作只由共享保存条提供。 */
  actions?: ReactNode;
  saveBar: SaveBarProps;
  children: ReactNode;
};

/**
 * 业务实体新建/编辑页的唯一版式（三步中的第三步）：页头 = 返回 + 页面名 + 辅助操作；正文 = 表单；
 * 编辑动作 = 共享保存条（仅在脏状态渲染取消/保存，干净状态由页头返回承担退出）。
 */
export function EntityEditPage({
  title,
  objectName,
  backTo,
  query,
  actions,
  saveBar,
  children,
}: EntityEditPageProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const feedback = query
    ? {
        error: query.error,
        errorTitle: query.errorTitle,
        onRetry: query.onRetry,
        retrying: query.loading,
      }
    : undefined;
  return (
    <AppPage
      title={title}
      objectName={objectName}
      onBack={() => {
        if (!saveBar.saving) navigate(backTo);
      }}
      extra={actions}
    >
      {query && feedback && !query.ready ? (
        query.loading ? (
          <LoadingState variant="page" label={t('common.loadingPage')} />
        ) : (
          <QueryFeedback {...feedback} emptyDescription={query.notFoundDescription} />
        )
      ) : (
        <>
          {feedback ? <QueryErrorAlert {...feedback} layout="banner" /> : null}
          {/* 编辑态刷新原对象时保留表单并加遮罩 */}
          <LoadingOverlay loading={Boolean(query?.loading)} label={t('common.loadingPage')}>
            {children}
          </LoadingOverlay>
          <SaveBar {...saveBar} />
        </>
      )}
    </AppPage>
  );
}
