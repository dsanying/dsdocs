import assert from "node:assert/strict";
import test from "node:test";
import { inspectComponentCatalog, publicExports } from "./component-catalog.mjs";
const source = 'export { AppPage, type AppPageProps } from "./AppPage"; export type { RouteCrumb } from "./routeCrumbs";';
const exports = [
  {name:"AppPage",kind:"value",module:"./AppPage",source:"src/components/ui/AppPage.tsx",selection:"普通页面"},
  {name:"AppPageProps",kind:"type",module:"./AppPage",source:"src/components/ui/AppPage.tsx",selection:"页面属性"},
  {name:"RouteCrumb",kind:"type",module:"./routeCrumbs",source:"src/components/ui/routeCrumbs.ts",selection:"导航声明"}
];
test("目录反向比对真实语法树，类型和值导出均登记",()=>assert.deepEqual(inspectComponentCatalog(publicExports(source),{exports}),[]));
test("删除、重命名、改来源、漏用途和重复目录都不能通过",()=>{
  for(const list of [exports.slice(1),[{...exports[0],name:"GenericPage"},...exports.slice(1)],[{...exports[0],module:"./FakePage"},...exports.slice(1)],[{...exports[0],selection:""},...exports.slice(1)],[...exports,exports[0]]]) assert.ok(inspectComponentCatalog(publicExports(source),{exports:list}).length>0);
});
test("保留旧仓库专项组件必须记录其真实封装入口与选型用途", () => {
  const specialized = [{ name: "MarkdownContent", source: "src/shared/components/MarkdownContent.tsx", selection: "保留既有 Markdown 渲染机制，通过公开主题变量适配" }];
  assert.deepEqual(inspectComponentCatalog(publicExports(source), { exports, specialized }), []);
  assert.deepEqual(inspectComponentCatalog(publicExports(source), { exports, specialized: [{ name: "MailEditor", source: "src/features/mail/MailEditor.tsx", selection: "保留领域已有富文本编辑器", adoption: "native-compatible", packages: ["@wangeditor/editor-for-react"] }] }), []);
});
test("专项选型拒绝重复命名、空用途、页面伪组件和越界源码", () => {
  const entry = { name: "MarkdownContent", source: "src/shared/components/MarkdownContent.tsx", selection: "保留既有 Markdown" };
  for (const specialized of [[entry, entry], [{ ...entry, selection: "" }], [{ ...entry, source: "src/pages/Fake.tsx" }], [{ ...entry, source: "src/shared/components/../Fake.tsx" }]])
    assert.ok(inspectComponentCatalog(publicExports(source), { exports, specialized }).length);
});
