import { Component, type ReactNode } from 'react';

import { QueryErrorAlert } from './Feedback';

type LazyBoundaryState = {
  error: unknown;
};

/**
 * 懒加载内容的统一边界：Suspense 包不住异步失败（chunk 404/网络断开/部署后旧清单引用新包），
 * 没有边界时错误冒泡到根、整页白屏。统一在 lazyRoute 与重组件懒加载点的外层使用，
 * 失败只占用该内容区域，按查询错误契约展示并给出刷新入口。
 * React.lazy 拒绝的 chunk 请求会被缓存，原地重试必然再次失败，
 * 唯一的恢复路径是重新加载页面拿到新的资源清单，所以重试即刷新。
 */
class LazyBoundaryInner extends Component<{ children: ReactNode }, LazyBoundaryState> {
  state: LazyBoundaryState = { error: undefined };

  static getDerivedStateFromError(error: unknown): LazyBoundaryState {
    return { error };
  }

  render() {
    if (this.state.error !== undefined) {
      return (
        <QueryErrorAlert
          layout="block"
          error={this.state.error}
          onRetry={() => window.location.reload()}
        />
      );
    }
    return this.props.children;
  }
}

export function LazyBoundary({ children }: { children: ReactNode }) {
  return <LazyBoundaryInner>{children}</LazyBoundaryInner>;
}
