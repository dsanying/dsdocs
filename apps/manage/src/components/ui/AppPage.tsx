import { ArrowLeftOutlined } from '@ant-design/icons';
import { Breadcrumb, type BreadcrumbProps } from 'antd';
import { Children, isValidElement, useContext, useRef, type ReactNode } from 'react';
import { Link } from 'react-router';
import { useTranslation } from 'react-i18next';

import { LoadingState } from './Feedback';
import { IconButton } from './IconButton';
import { ResponsiveActions } from './ResponsiveTableToolbar';
import { ResponsiveTabs } from './ResponsiveTabs';
import { RouteCrumbsContext } from './routeCrumbs';
import { useFitHeading } from './useFitHeading';

import './AppPage.css';

export interface AppPageTab {
  key: string;
  tab: ReactNode;
}

export interface AppPageProps {
  /**
   * 当前页的名字：同时替换面包屑最后一项与一级标题，两者永远一致。缺省为导航树里该路由的名字（与侧边栏同源）。
   * 只用于导航树给不出的名字——同一路由的新建/编辑两态（“新建标签”）、详情页的对象名（配额池名）；
   * 普通页面不传，改名请改导航树（routes/index.tsx）。
   */
  title?: string;
  /**
   * 当前页所属对象的名字（编辑页用）：替换面包屑里上一级对象页（详情）的标题，
   * 让“配额池列表 / 全职员工类 / 编辑”的中间一项既是对象名又能点回详情。读取前留空，回退到导航树里的页面名。
   */
  objectName?: string;
  /** 页头右侧操作，自动放进 ResponsiveActions。 */
  extra?: ReactNode;
  /** 紧跟标题的对象状态（StatusTag）或标题旁的小型入口（如策略列表的 deny 计数）。 */
  status?: ReactNode;
  /** 标题下方的说明区（详情页摘要）。 */
  content?: ReactNode;
  tabList?: AppPageTab[];
  tabActiveKey?: string;
  onTabChange?: (key: string) => void;
  onBack?: () => void;
  loading?: boolean;
  className?: string;
  children?: ReactNode;
}

function wrapActions(actions: ReactNode) {
  if (actions === undefined || actions === null || actions === false) return null;
  const children = Children.toArray(actions);
  if (
    children.length === 1 &&
    isValidElement(children[0]) &&
    children[0].type === ResponsiveActions
  )
    return children[0];
  return <ResponsiveActions>{actions}</ResponsiveActions>;
}

/**
 * 页面根容器唯一入口：面包屑（来自布局导航链）、一级标题、页头操作、说明区、页签与正文，
 * 页面只提供内容，不再各自拼页头。
 */
export function AppPage({
  className,
  extra,
  title,
  objectName,
  status,
  content,
  tabList,
  tabActiveKey,
  onTabChange,
  onBack,
  loading,
  children,
}: AppPageProps) {
  const { t } = useTranslation();
  const routeCrumbs = useContext(RouteCrumbsContext);
  // 标题与面包屑末项同源：页面给出的名字替换末项，一级标题直接取末项
  const lastIndex = routeCrumbs.length - 1;
  // 上一级对象页：末项之前最近的一个带动态段的节点
  const objectIndex = objectName
    ? routeCrumbs
        .slice(0, -1)
        .map((crumb) => crumb.object)
        .lastIndexOf(true)
    : -1;
  const crumbs = routeCrumbs.map((crumb, index) => {
    if (index === lastIndex && title) return { ...crumb, title };
    if (index === objectIndex && objectName) return { ...crumb, title: objectName };
    return crumb;
  });
  const resolvedTitle = crumbs.at(-1)?.title ?? title;
  const actions = wrapActions(extra);
  const headingRef = useRef<HTMLDivElement>(null);
  const compactActions = useFitHeading(headingRef);
  const breadcrumbItems: BreadcrumbProps['items'] = crumbs.map((crumb, index) => ({
    key: crumb.path,
    title:
      crumb.linkable && index < crumbs.length - 1 ? (
        <Link to={crumb.path}>{crumb.title}</Link>
      ) : (
        crumb.title
      ),
  }));

  return (
    <div className={['ds-app-page', className].filter(Boolean).join(' ')}>
      <header className="ds-app-page__header">
        {breadcrumbItems.length > 0 ? <Breadcrumb items={breadcrumbItems} /> : null}
        <div
          className="ds-app-page__heading"
          ref={headingRef}
          data-compact={compactActions ? 'true' : undefined}
        >
          {onBack ? (
            <IconButton
              type="text"
              icon={<ArrowLeftOutlined />}
              label={t('common.actions.back')}
              onClick={onBack}
            />
          ) : null}
          <div className="ds-app-page__title-group">
            <h1 className="ds-app-page__title">{resolvedTitle}</h1>
            {status ? <span className="ds-app-page__status">{status}</span> : null}
          </div>
          {actions}
        </div>
        {content ? <div className="ds-app-page__content">{content}</div> : null}
        {tabList?.length ? (
          <ResponsiveTabs
            className="ds-app-page__tabs"
            variant="navigation-only"
            activeKey={tabActiveKey}
            onChange={onTabChange}
            items={tabList.map((tab) => ({ key: tab.key, label: tab.tab }))}
          />
        ) : null}
      </header>
      <div className="ds-app-page__body">
        {loading ? <LoadingState variant="page" label={t('common.loadingPage')} /> : children}
      </div>
    </div>
  );
}
