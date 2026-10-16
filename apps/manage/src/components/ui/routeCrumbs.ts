import { createContext } from 'react';

/** 布局按当前地址算出的导航链：面包屑与页面默认标题的来源。 */
export interface RouteCrumb {
  /** 已代入当前地址动态段的实际地址。 */
  path: string;
  title: string;
  /** 有自己的页面即可点击；只有菜单分组（本身没有页面）不可点。 */
  linkable: boolean;
  /** 指向某个具体对象的页面（路径带动态段，如详情）：标题可由页面替换为对象名。 */
  object: boolean;
}

export const RouteCrumbsContext = createContext<RouteCrumb[]>([]);
