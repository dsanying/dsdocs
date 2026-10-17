import assert from "node:assert/strict";
import test from "node:test";

import { hasVisibleChildren, matchMenuChain, nestHiddenRoutes, selectedMenuKey } from "../src/routes/menuMatch.ts";

const tree = [
  {
    path: "/resource",
    children: [
      { path: "/resource/user-list" },
      { path: "/resource/user-list/:id", hideInMenu: true },
      { path: "/resource/item-list" },
      { path: "/resource/item-list/detail/:name", hideInMenu: true },
      { path: "/resource/item-list/detail/:name/edit", hideInMenu: true },
    ],
  },
];

test("静态菜单与真实路由同源，不被长参数名或通配段抢占", () => {
  const routes = [{ path: "/:sessionId" }, { path: "/*" }, { path: "/overview" }, { path: "/usage" }, { path: "/modules/:moduleId" }];
  for (const path of ["/overview", "/usage", "/modules/inspect"]) {
    const expected = path.startsWith("/modules/") ? "/modules/:moduleId" : path;
    assert.equal(matchMenuChain(routes, path).at(-1)?.path, expected);
  }
  assert.equal(matchMenuChain(routes, "/123456").at(-1)?.path, "/:sessionId");
  assert.equal(matchMenuChain(routes, "/unknown/deep").at(-1)?.path, "/*");
});

test("matchMenuChain 返回根到叶的链，动态段按路由规则匹配", () => {
  assert.deepEqual(matchMenuChain(tree, "/resource/user-list").map((node) => node.path), ["/resource", "/resource/user-list"]);
  assert.deepEqual(matchMenuChain(tree, "/resource/user-list/42").map((node) => node.path), ["/resource", "/resource/user-list/:id"]);
  assert.deepEqual(matchMenuChain(tree, "/resource/item-list/detail/p1/edit").map((node) => node.path), ["/resource", "/resource/item-list/detail/:name/edit"]);
  assert.deepEqual(matchMenuChain(tree, "/nowhere"), []);
});

test("selectedMenuKey 跳过不进菜单的叶节点", () => {
  assert.equal(selectedMenuKey(matchMenuChain(tree, "/resource/user-list/42")), "/resource");
  assert.equal(selectedMenuKey(matchMenuChain(tree, "/resource/user-list")), "/resource/user-list");
});

test("隐藏子页挂到路径前缀最长的兄弟下：面包屑是完整层级，侧边栏高亮所属列表", () => {
  const nested = nestHiddenRoutes(tree);
  assert.deepEqual(matchMenuChain(nested, "/resource/user-list/42").map((node) => node.path), ["/resource", "/resource/user-list", "/resource/user-list/:id"]);
  assert.deepEqual(matchMenuChain(nested, "/resource/item-list/detail/p1/edit").map((node) => node.path),
    ["/resource", "/resource/item-list", "/resource/item-list/detail/:name", "/resource/item-list/detail/:name/edit"]);
  assert.deepEqual(matchMenuChain(nested, "/resource/user-list").map((node) => node.path), ["/resource", "/resource/user-list"]);
  assert.equal(selectedMenuKey(matchMenuChain(nested, "/resource/user-list/42")), "/resource/user-list");
  // 书写顺序保持，只挂了隐藏子页的列表项仍是叶子
  assert.deepEqual(nested[0].children.map((node) => node.path), ["/resource/user-list", "/resource/item-list"]);
  assert.equal(hasVisibleChildren(nested[0].children[0]), false);
  assert.equal(hasVisibleChildren(nested[0]), true);
});
