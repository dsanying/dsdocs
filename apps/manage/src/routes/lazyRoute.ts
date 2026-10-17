import { Suspense, createElement, type FC, type LazyExoticComponent } from 'react';
import { LazyBoundary } from '@/components/ui';
import { PageFallback } from './PageFallback';

type LazyPage = LazyExoticComponent<FC>;

// 每个路由一份边界实例：边界按调用点序号给 key，导航到别的路由时 React 按 key 重挂，
// 否则同类型同位置的边界会被复用，上个页面的 chunk 失败会一直盖在正常页面上。
let lazyBoundarySeq = 0;

export const lazyRoute = (Component: LazyPage) =>
  createElement(LazyBoundary, {
    key: `lazy-boundary-${lazyBoundarySeq++}`,
    children: createElement(
      Suspense,
      { fallback: createElement(PageFallback) },
      createElement(Component)
    ),
  });
