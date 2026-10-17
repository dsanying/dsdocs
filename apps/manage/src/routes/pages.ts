import { createElement, lazy, type FC } from 'react';
/** 同一组件的新建、查看、编辑形态保持同一个实现。 */
export function lazyWithMode<M>(load: () => Promise<{ default: FC<{ mode: M }> }>, mode: M) {
  return lazy(() =>
    load().then((module) => ({ default: () => createElement(module.default, { mode }) }))
  );
}

export const NotFoundPage = lazy(() => import('@/pages/NotFoundPage'));

export const FoldersPage = lazy(() => import('@/pages/FoldersPage'));
export const AccountsPage = lazy(() => import('@/pages/AccountsPage'));
export const AssetsPage = lazy(() => import('@/pages/AssetsPage'));
export const FileSyncPage = lazy(() => import('@/pages/FileSyncPage'));
