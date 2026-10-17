import { matchRoutes } from 'react-router';

/** 与 `MenuEntry` 同构的最小结构：菜单匹配只依赖 path 与 children。 */
export interface MenuNode<TNode extends MenuNode<TNode>> {
  path: string;
  children?: TNode[];
}

/**
 * 找出当前地址在导航树里的祖先链（根 → 叶）；动态段（`:id`）按 react-router 规则匹配。
 * 由 react-router 统一排序静态段、动态段及通配段，与实际路由选择同源。
 */
export function matchMenuChain<TNode extends MenuNode<TNode>>(
  entries: TNode[],
  pathname: string
): TNode[] {
  const candidates: Array<{ path: string; handle: TNode[] }> = [];
  const collect = (nodes: TNode[], ancestors: TNode[]) => {
    for (const node of nodes) {
      const chain = [...ancestors, node];
      candidates.push({ path: node.path, handle: chain });
      if (node.children) collect(node.children, chain);
    }
  };
  collect(entries, []);
  return matchRoutes(candidates, pathname)?.at(-1)?.route.handle ?? [];
}

/** 当前地址所属的一级/二级菜单 key：叶节点自身没进菜单（hideInMenu）时回退到最近的进菜单祖先。 */
export function selectedMenuKey<TNode extends MenuNode<TNode> & { hideInMenu?: boolean }>(
  chain: TNode[]
): string | undefined {
  return [...chain].reverse().find((node) => !node.hideInMenu)?.path;
}

/**
 * 把同一层里不进菜单的路由（详情、新建、编辑、子页）挂到路径前缀最长的兄弟节点下：
 * 导航树照常平铺书写，面包屑却是完整层级（规则列表 / 规则详情 / 编辑规则），
 * 侧边栏也能高亮所属的列表项。找不到前缀兄弟的保持原位。
 */
export function nestHiddenRoutes<TNode extends MenuNode<TNode> & { hideInMenu?: boolean }>(
  entries: TNode[]
): TNode[] {
  const isPrefix = (parent: string, child: string) => child.startsWith(`${parent}/`);
  const nested = new Map<string, TNode[]>();
  const roots: TNode[] = [];
  // 按路径长度从短到长挂：/a/:id 先挂到 /a，/a/:id/edit 再挂到 /a/:id
  const sorted = [...entries].sort((left, right) => left.path.length - right.path.length);
  for (const entry of sorted) {
    const parent = entry.hideInMenu
      ? [...sorted]
          .filter((candidate) => candidate !== entry && isPrefix(candidate.path, entry.path))
          .sort((a, b) => b.path.length - a.path.length)[0]
      : undefined;
    if (parent) nested.set(parent.path, [...(nested.get(parent.path) ?? []), entry]);
    else roots.push(entry);
  }
  const build = (entry: TNode): TNode => {
    const ownChildren = entry.children ? nestHiddenRoutes(entry.children) : [];
    const hidden = (nested.get(entry.path) ?? []).map(build);
    const children = [...ownChildren, ...hidden];
    return children.length > 0 ? { ...entry, children } : entry;
  };
  // 保持书写顺序
  return entries.filter((entry) => roots.includes(entry)).map(build);
}

/** 节点在菜单里是否还有可见的子项（只挂了隐藏子页的列表项仍是可点击的叶子）。 */
export function hasVisibleChildren(node: { children?: { hideInMenu?: boolean }[] }): boolean {
  return Boolean(node.children?.some((child) => !child.hideInMenu));
}
