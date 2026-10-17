import assert from "node:assert/strict";
import test from "node:test";
import { inspectBusinessRoutes, isBusinessRoute } from "./navigation-governance.mjs";
const entry = { path: "/:sessionId", kind: "workflow", definition: "src/routes/index.tsx", contract: "docs/设计/业务路由.md", reason: "已有会话 UUID 深链" };
const context = { exists: (p) => [entry.definition, entry.contract].includes(p), read: (p) => p === entry.definition ? "const routes=[{path:':sessionId',element:page}]" : "会话深链 /:sessionId 保留，服务层验证 UUID 与权限。" };
test("真实非实体深链双向登记，不改 CRUD 约定", () => {
  assert.deepEqual(inspectBusinessRoutes([entry], context), []);
  assert.equal(isBusinessRoute(":sessionId", "/repo/src/routes/index.tsx", [entry]), true);
  assert.equal(isBusinessRoute(":sessionId", "/repo/src/pages/X/index.tsx", [entry]), false);
  assert.equal(isBusinessRoute(":other", "/repo/src/routes/index.tsx", [entry]), false);
});
test("业务路由登记拒绝虚构定义、无契约、重复、未分类与实体路径", () => {
  for (const mutated of [{...entry, kind:"entity"}, {...entry, reason:""}, {...entry, path:"/:other"}, {...entry, definition:"src/no.tsx"}, {...entry, contract:"docs/no.md"}, {...entry,path:"/x/detail/:id"}]) assert.ok(inspectBusinessRoutes([mutated], context).length > 0);
  assert.ok(inspectBusinessRoutes([entry,entry],context).length > 0);
  assert.ok(inspectBusinessRoutes([entry],{...context,read:(p)=>p===entry.contract?"其他路径":context.read(p)}).length > 0);
});
