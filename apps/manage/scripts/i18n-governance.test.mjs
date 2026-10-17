import assert from "node:assert/strict";
import test from "node:test";

import {
  analyzeI18n,
  findCopyCandidates,
  removeCatalogKeys,
} from "./i18n-governance.mjs";

const emptyRegistry = { version: 2, callsites: [] };
test("中文权限效果必须本地化，含嵌套引用", () => {
  const en = { common: { vocab: { deny: "deny" } }, count: "$t(common.vocab.deny) {countLabel}" };
  const zh = { common: { vocab: { deny: "拒绝" } }, count: "$t(common.vocab.deny) {countLabel}" };
  const text = 't("count", {countLabel: 6})';
  assert.deepEqual(analyze({ zh, en, text }).errors, []);
  for (const value of ["deny {countLabel}", "ALLOW {countLabel}"]) {
    assert.ok(analyze({ zh: { ...zh, count: value }, en, text }).errors.some(error => error.msg.includes("权限效果必须随中文界面本地化")));
  }
  const broken = structuredClone(zh);
  broken.common.vocab.deny = "deny";
  assert.ok(analyze({ zh: broken, en, text }).errors.some(error => error.msg.includes('"count" 的权限效果必须')));
});
const analyze = ({ zh, en = zh, text = "", sources, registry = emptyRegistry }) =>
  analyzeI18n({
    catalogs: { "zh-CN": zh, "en-US": en },
    registry,
    sources: sources ?? [{
      file: "src/example.tsx",
      text: /from\s+["']react-i18next["']/.test(text)
        ? text
        : `import {useTranslation} from "react-i18next"; const {t}=useTranslation(); ${text}`,
    }],
  });

test("识别 t/useTranslation/Trans 别名与有限静态 key", () => {
  const result = analyze({
    zh: { a: "甲", b: "乙", c: "丙", d: "丁" },
    text: `
      import { useTranslation as useI18n, Trans as Translate } from "react-i18next";
      const { t: i18nT } = useI18n();
      const translate = i18nT;
      translate("a");
      <Translate i18nKey="b" />;
      i18n.t("c");
      i18nT(flag ? "d" : "c");
    `,
  });
  assert.deepEqual(result.errors, []);
  assert.deepEqual([...result.used].sort(), ["a", "b", "c", "d"]);
});

test("只把真实翻译来源识别为 t，普通同名函数不参与门禁", () => {
  const result = analyze({
    zh: { used: "已用" },
    sources: [
      {
        file: "src/real.tsx",
        text: 'import {useTranslation} from "react-i18next"; const {t: translate}=useTranslation(); translate("used");',
      },
      {
        file: "src/util.ts",
        text: 'function map(t) { return t(1); } const local = () => { const t = (value) => value; return t("plain"); };',
      },
    ],
  });
  assert.deepEqual(result.errors, []);
});

test("真实翻译绑定不可被内层同名可调用值遮蔽", () => {
  const result = analyze({
    zh: { used: "已用" },
    sources: [{
      file: "src/example.tsx",
      text: `
        import {useTranslation} from "react-i18next";
        function Component() {
          const {t} = useTranslation();
          t("used");
          function nested(t) { return t("not-a-translation-key"); }
          return nested((value) => value);
        }
      `,
    }],
  });
  assert.ok(result.errors.some((error) => error.msg.includes("不得在内层作用域")));
  assert.equal(result.errors.some((error) => error.msg.includes("not-a-translation-key") && error.msg.includes("缺少")), false);
});

test("显式翻译函数 props 契约仍被识别", () => {
  const result = analyze({
    zh: { used: "已用" },
    sources: [{
      file: "src/component.tsx",
      text: `
        type Translate = (id: string, fallback: string) => string;
        interface Props { t: Translate; }
        const Component: React.FC<Props> = ({t}) => <span>{t("used")}</span>;
      `,
    }],
  });
  assert.deepEqual(result.errors, []);
});

test("本地翻译包装器转发不伪装成未登记动态 key", () => {
  const result = analyze({
    zh: { a: "甲" },
    text: `
      import { useTranslation } from "react-i18next";
      const { t: i18nT } = useTranslation();
      const t = (id, values) => i18nT(id, values);
      t("a");
    `,
  });
  assert.deepEqual(result.errors, []);
});

test("动态 key 必须精确登记，登记项必须存在且仍对应真实入口", () => {
  const sourceWithRegistryValue = `import {useTranslation} from "react-i18next";
function Component() {
  const {t}=useTranslation();
  const render=(route)=>t(route.locale);
  return render({locale:"menu"});
}`;
  const sources = [{ file: "src/example.tsx", text: sourceWithRegistryValue }];
  assert.ok(analyze({ zh: { menu: "菜单" }, sources }).errors.some((error) => error.msg.includes("动态 i18n key 未登记")));

  const registry = {
    version: 2,
    callsites: [{
      file: "src/example.tsx",
      expression: "route.locale",
      anchors: [{ kind: "CallExpression", line: 4, column: 25 }],
      dataFlow: { kind: "argument-to-parameter", callable: "render", parameterIndex: 0, path: ["locale"], keySource: 0 },
      keys: ["menu"],
      keySources: [{
        file: "src/example.tsx",
        anchor: { kind: "FunctionDeclaration", line: 2, column: 1, name: "Component" },
        selector: { kind: "call-property", callee: "render", argumentIndex: 0, name: "locale" },
        expectedMatches: 1,
      }],
      reason: "路由菜单",
    }],
  };
  assert.deepEqual(analyze({ zh: { menu: "菜单" }, sources, registry }).errors, []);
  assert.ok(analyze({ zh: { menu: "菜单" }, text: 't("menu")', registry }).errors.some((error) => error.msg.includes("调用数量变化")));
  assert.ok(analyze({ zh: { menu: "菜单" }, sources, registry: { ...registry, callsites: [{ ...registry.callsites[0], keys: ["missing"] }] } }).errors.some((error) => error.msg.includes("不存在的键")));
  assert.ok(analyze({ zh: { menu: "菜单", stale: "废弃" }, sources, registry: { ...registry, callsites: [{ ...registry.callsites[0], keys: ["menu", "stale"] }] } }).errors.some((error) => error.msg.includes("没有对应数据源字面量")));

  const moved = sourceWithRegistryValue.replace("t(route.locale)", "\n    t(route.locale)");
  assert.ok(analyze({ zh: { menu: "菜单" }, sources: [{ file: "src/example.tsx", text: moved }], registry }).errors.some((error) => error.msg.includes("锚点已移动")));
  const repeated = sourceWithRegistryValue.replace("=>t(route.locale)", "=>{t(route.locale); return t(route.locale)}");
  assert.ok(analyze({ zh: { menu: "菜单" }, sources: [{ file: "src/example.tsx", text: repeated }], registry }).errors.some((error) => error.msg.includes("调用数量变化")));
  const dead = sourceWithRegistryValue.replace("=>t(route.locale)", "=>{while (false) { t(route.locale); } return \"\"}");
  assert.ok(analyze({ zh: { menu: "菜单" }, sources: [{ file: "src/example.tsx", text: dead }], registry }).errors.some((error) => error.msg.includes("死代码")));

  const disguisedSource = sourceWithRegistryValue.replace('{locale:"menu"}', '{fake:{locale:"menu"}}');
  assert.ok(analyze({ zh: { menu: "菜单" }, sources: [{ file: "src/example.tsx", text: disguisedSource }], registry }).errors.some((error) => error.msg.includes("数据源匹配数量变化")));

  const sameRootFake = sourceWithRegistryValue.replace(
    'return render({locale:"menu"});',
    'const fake={locale:"menu"};\n  return render({other:"menu"});',
  );
  const fakePropertyRegistry = {
    ...registry,
    callsites: [{
      ...registry.callsites[0],
      keySources: [{
        ...registry.callsites[0].keySources[0],
        selector: { kind: "property", name: "locale" },
      }],
    }],
  };
  assert.ok(analyze({
    zh: { menu: "菜单" },
    sources: [{ file: "src/example.tsx", text: sameRootFake }],
    registry: fakePropertyRegistry,
  }).errors.some((error) => error.msg.includes("无法证明到调用表达式的数据流")));
});

test("可静态判假的循环与分支中的动态 key 属于死代码", () => {
  const result = analyze({
    zh: { menu: "菜单" },
    sources: [{
      file: "src/example.tsx",
      text: `import {useTranslation} from "react-i18next";
const {t}=useTranslation();
while (0) { t(route.key); }
for (; !true;) { t(route.key); }
if (false as const) { t(route.key); }
while ((false satisfies boolean)!) { t(route.key); }
if (undefined) { t(route.key); }
while (void sideEffect()) { t(route.key); }
if (0n) { t(route.key); }
if (NaN) { t(route.key); }
if (2 - 2) { t(route.key); }
if (1n - 1n) { t(route.key); }
{ const undefined=true; if (undefined) { t(route.key); } }
do { t(route.key); } while (false);`,
    }],
  });
  assert.equal(result.errors.filter((error) => error.msg.includes("死代码")).length, 10);
});

test("组件 callback 数据流绑定到登记数据源的真实 import，局部同名遮蔽失败", () => {
  const routeSource = 'export const menuRoutes={routes:[{locale:"menu"}]};';
  const layoutSource = `import {useTranslation} from "react-i18next";
import {menuRoutes} from "@/routes"; import {NavShell} from "nav-shell";
const Layout=()=>{
  const {t}=useTranslation();
  return <NavShell route={menuRoutes} formatMessage={(message)=>t(message.id)} />;
};`;
  const registry = {
    version: 2,
    callsites: [{
      file: "src/layout.tsx",
      expression: "message.id",
      anchors: [{ kind: "CallExpression", line: 5, column: 65 }],
      dataFlow: {
        kind: "jsx-prop-callback",
        componentModule: "nav-shell",
        componentExport: "NavShell",
        callbackProp: "formatMessage",
        parameterIndex: 0,
        path: ["id"],
        sourceProp: "route",
        sourceModule: "@/routes",
        sourceBinding: "menuRoutes",
        keySource: 0,
      },
      keys: ["menu"],
      keySources: [{
        file: "src/routes/index.tsx",
        anchor: { kind: "VariableDeclaration", line: 1, column: 14, name: "menuRoutes" },
        selector: { kind: "property", name: "locale" },
        expectedMatches: 1,
      }],
      reason: "菜单配置驱动组件翻译 callback",
    }],
  };
  const sources = [
    { file: "src/routes/index.tsx", text: routeSource },
    { file: "src/layout.tsx", text: layoutSource },
  ];
  assert.deepEqual(analyze({ zh: { menu: "菜单" }, sources, registry }).errors, []);

  const shadowed = layoutSource.replace("const Layout=()=>", "const Layout=(menuRoutes)=>");
  assert.ok(analyze({
    zh: { menu: "菜单" },
    sources: [sources[0], { file: "src/layout.tsx", text: shadowed }],
    registry,
  }).errors.some((error) => error.msg.includes("无法证明到调用表达式的数据流")));

  const componentShadowed = layoutSource.replace("const Layout=()=>", "const Layout=(NavShell)=>");
  assert.ok(analyze({
    zh: { menu: "菜单" },
    sources: [sources[0], { file: "src/layout.tsx", text: componentShadowed }],
    registry,
  }).errors.some((error) => error.msg.includes("无法证明到调用表达式的数据流")));
});

test("中英文键、值类型和插值变量必须一致", () => {
  const result = analyze({
    zh: { copy: "复制 {name}", status: "启用", onlyZh: "仅中文" },
    en: { copy: "Copy {user}", status: 1, onlyEn: "English only" },
    text: 't("copy"); t("status"); t("onlyZh"); t("onlyEn")',
  });
  assert.ok(result.errors.some((error) => error.msg.includes("插值变量")));
  assert.ok(result.errors.some((error) => error.msg.includes("值类型")));
  assert.ok(result.errors.some((error) => error.msg.includes("en-US 缺键")));
  assert.ok(result.errors.some((error) => error.msg.includes("zh-CN 缺键")));
});

test("字面 key、默认值与未使用键全部是硬错误", () => {
  const result = analyze({ zh: { used: "正确", stale: "废弃" }, text: 't("used", "错误"); t("missing")' });
  assert.ok(result.errors.some((error) => error.msg.includes("不得携带默认文案")));
  assert.ok(result.errors.some((error) => error.msg.includes('缺少 zh-CN 键 "missing"')));
  assert.ok(result.errors.some((error) => error.msg.includes('未使用键 "stale"')));
});

test("单个静态 key 必须显式提供目录要求的插值变量", () => {
  const catalog = { greeting: "你好 {name}，共 {count} 条" };
  assert.deepEqual(analyze({ zh: catalog, text: 't("greeting", {name, count: total})' }).errors, []);
  const missing = analyze({ zh: catalog, text: 't("greeting", {name})' });
  assert.ok(missing.errors.some((error) => error.msg.includes("缺少插值变量：count")));
  assert.deepEqual(analyze({ zh: catalog, text: 't("greeting", {name, count})' }).errors, []);
});

test("有限条件 key 的每个分支都必须满足各自插值契约", () => {
  const catalog = { byName: "你好 {name}", byCount: "共 {count} 条" };
  const missing = analyze({ zh: catalog, text: 't(byUser ? "byName" : "byCount", {name})' });
  assert.ok(missing.errors.some((error) => error.msg.includes('"byCount" 缺少插值变量：count')));
  assert.equal(missing.errors.some((error) => error.msg.includes('"byName" 缺少插值变量')), false);
  assert.deepEqual(analyze({ zh: catalog, text: 't(byUser ? "byName" : "byCount", {name, count})' }).errors, []);
});

test("Trans 从 values 和插值子节点收集变量", () => {
  const catalog = { greeting: "你好 {name}，共 {count} 条" };
  const missing = analyze({
    zh: catalog,
    text: 'import {Trans} from "react-i18next"; <Trans i18nKey="greeting" values={{name}} />',
  });
  assert.ok(missing.errors.some((error) => error.msg.includes("缺少插值变量：count")));
  const componentProperty = analyze({
    zh: catalog,
    text: 'import {Trans} from "react-i18next"; <Trans i18nKey="greeting" values={{name}}><Widget config={{count}} /></Trans>',
  });
  assert.ok(componentProperty.errors.some((error) => error.msg.includes("缺少插值变量：count")));
  assert.deepEqual(analyze({
    zh: catalog,
    text: 'import {Trans as Translate} from "react-i18next"; <Translate i18nKey="greeting" values={{name}}><strong>{{count}}</strong></Translate>',
  }).errors, []);
});

test("所有命名空间及可识别动作属性中的纯动作必须复用 common.actions", () => {
  const result = analyze({
    zh: {
      common: { actions: { edit: "编辑" } },
      pages: { users: { edit: "编辑", modify: "编辑" }, import: { summary: { edit: "编辑" } } },
      components: { editor: { edit: "编辑" } },
    },
    en: {
      common: { actions: { edit: "Edit" } },
      pages: { users: { edit: "Edit", modify: "Modify" }, import: { summary: { edit: "Edit" } } },
      components: { editor: { edit: "Edit" } },
    },
    text: `
      <Button>{t("pages.users.edit")}</Button>;
      <Button>{t("common.actions.edit")}</Button>;
      <Button>{t("pages.users.modify")}</Button>;
      <span>{t("pages.import.summary.edit")}</span>;
      import {Button as PrimaryButton} from "antd";
      <PrimaryButton>{t("components.editor.edit")}</PrimaryButton>;
    `,
  });
  assert.equal(result.errors.filter((error) => error.msg.includes("通用动作文案")).length, 2);
  assert.ok(result.errors.some((error) => error.msg.includes('必须改用 "common.actions.edit"')));
});

test("表单标签不带单位，字段说明不写实现细节也不复述标签", () => {
  const result = analyze({
    zh: { pages: { form: {
      countdown: "倒计时（秒）", width: "宽度", widthHint: "CSS 如 480px。modal：留空 520px",
      channelHint: "选择上游渠道", goodHint: "留空为 520 px，最大 640 px", keyHint: "api_key 必填",
    } } },
    en: { pages: { form: {
      countdown: "Countdown (seconds)", width: "Width", widthHint: "CSS such as 480px", channelHint: "Select upstream",
      goodHint: "Defaults to 520 px", keyHint: "Api key required",
    } } },
    text: `
      import { Form } from "antd";
      <Form.Item label={t("pages.form.countdown")} />;
      <Form.Item label={t("pages.form.width")} tooltip={mode ? t("pages.form.widthHint") : t("pages.form.goodHint")} />;
      <Form.Item tooltip={t("pages.form.channelHint")} />;
      <HelpTip title={t("pages.form.keyHint")} />;
      <span>{t("pages.form.channelHint")}</span>;
    `,
  });
  assert.equal(result.errors.filter((error) => error.msg.includes("不带单位")).length, 1);
  assert.equal(result.errors.filter((error) => error.msg.includes("实现细节")).length, 2);
  assert.equal(result.errors.filter((error) => error.msg.includes("复述标签")).length, 1);
});

test("动作按钮文案禁止动作+对象拼接，裸动作与对象模板不误判", () => {
  const result = analyze({
    zh: {
      common: { actions: { refresh: "刷新", add: "添加" }, actionObjectTemplates: { add: "添加{object}" }, objects: { condition: "条件" } },
      pages: { pool: { refreshUsers: "刷新关联用户", refreshTip: "刷新后同步生效" } },
    },
    en: {
      common: { actions: { refresh: "Refresh", add: "Add" }, actionObjectTemplates: { add: "Add {object}" }, objects: { condition: "Condition" } },
      pages: { pool: { refreshUsers: "Refresh associated users", refreshTip: "Takes effect after refresh" } },
    },
    text: `
      <Button>{t("pages.pool.refreshUsers")}</Button>;
      <Button>{t("common.actions.refresh")}</Button>;
      <Button>{t("common.actionObjectTemplates.add", {object: t("common.objects.condition")})}</Button>;
      <span>{t("pages.pool.refreshTip")}</span>;
    `,
  });
  const hits = result.errors.filter((error) => error.msg.includes("裸动作"));
  assert.equal(hits.length, 1);
  assert.ok(hits[0].msg.includes('"pages.pool.refreshUsers"'));
});

test("Button 的别名、namespace 与 self-closing children prop 都是动作上下文", () => {
  const result = analyze({
    zh: { common: { actions: { edit: "编辑" } }, components: { alias: "编辑", namespace: "编辑", card: "编辑" } },
    en: { common: { actions: { edit: "Edit" } }, components: { alias: "Edit", namespace: "Edit", card: "Edit" } },
    text: `
      import {Button as Action} from "antd";
      import * as Ant from "antd";
      <Action children={t("components.alias")} />;
      <Ant.Button children={t("components.namespace")} />;
      <CardButton children={t("components.card")} />;
    `,
  });
  assert.equal(result.errors.filter((error) => error.msg.includes("通用动作文案")).length, 2);
});

test("动作 props spread 按运行时顺序展开，namespace 解构保留真实 binding", () => {
  const result = analyze({
    zh: {
      common: { actions: { edit: "编辑" } },
      components: { spread: "编辑", literal: "编辑", overridden: "编辑", destructured: "编辑", getter: "编辑", accessorOverridden: "编辑", propertyAlias: "编辑", deepAlias: "编辑", mutableAlias: "编辑" },
    },
    en: {
      common: { actions: { edit: "Edit" } },
      components: { spread: "Edit", literal: "Edit", overridden: "Edit", destructured: "Edit", getter: "Edit", accessorOverridden: "Edit", propertyAlias: "Edit", deepAlias: "Edit", mutableAlias: "Edit" },
    },
    text: `
      import * as Ant from "antd";
      const {Button: Action}=Ant;
      const props={children:t("components.spread")};
      <Action {...props} />;
      <Action {...unknownProps} children={t("components.literal")} />;
      <Action children={t("components.overridden")} {...unknownProps} />;
      <Action children={t("components.destructured")} />;
      const accessor={get children(){return t("components.getter")}};
      <Action {...accessor} />;
      const overwrittenAccessor={children:t("components.accessorOverridden"),set children(value){consume(value)}};
      <Action {...overwrittenAccessor} />;
      const UI=Ant;
      const PropertyAction=UI.Button;
      const {Button:DeepAction}=UI;
      let MutableAction=UI.Button;
      <PropertyAction children={t("components.propertyAlias")} />;
      <DeepAction children={t("components.deepAlias")} />;
      <MutableAction children={t("components.mutableAlias")} />;
    `,
  });
  assert.equal(result.errors.filter((error) => error.msg.includes("通用动作文案")).length, 6);
});

test("菜单 item 的静态 handler spread 建立动作语义，未知覆盖不误判", () => {
  const result = analyze({
    zh: { common: { actions: { edit: "编辑" } }, components: { menu: "编辑", overwritten: "编辑", getter: "编辑", setter: "编辑" } },
    en: { common: { actions: { edit: "Edit" } }, components: { menu: "Edit", overwritten: "Edit", getter: "Edit", setter: "Edit" } },
    text: `
      const handler={onClick:run};
      const actionable={...handler,label:t("components.menu")};
      const uncertain={label:t("components.overwritten"),...unknownHandler};
      const getterHandler={get onClick(){return run}};
      const getterAction={...getterHandler,label:t("components.getter")};
      const setterHandler={set onClick(value){consume(value)}};
      const setterOnly={...setterHandler,label:t("components.setter")};
    `,
  });
  assert.equal(result.errors.filter((error) => error.msg.includes("通用动作文案")).length, 2);
});

test("动作 label/text props 与可执行菜单项属于动作上下文", () => {
  const catalogs = {
    zh: { common: { actions: { retry: "重试" } }, components: { query: { retry: "重试" }, menu: { retry: "重试" } } },
    en: { common: { actions: { retry: "Retry" } }, components: { query: { retry: "Retry" }, menu: { retry: "Retry" } } },
  };
  const result = analyze({
    ...catalogs,
    text: `
      <QueryFeedback retryLabel={t("components.query.retry")} />;
      const item={label:t("components.menu.retry"),onClick:retry};
      <Form.Item label={t("common.actions.retry")} />;
    `,
  });
  assert.equal(result.errors.filter((error) => error.msg.includes("通用动作文案")).length, 2);
});

test("动作与对象必须通过可调序的翻译模板组合", () => {
  const catalogs = {
    zh: {
      common: {
        actions: { edit: "编辑" },
        actionObjectTemplates: { edit: "$t(common.actions.edit){object}" },
        objects: { record: "记录" },
      },
      components: { record: { edit: "$t(common.actions.edit)$t(common.objects.record)", destructive: "删除$t(common.objects.record)后无法恢复" } },
    },
    en: {
      common: {
        actions: { edit: "edit" },
        actionObjectTemplates: { edit: "$t(common.actions.edit) {object}" },
        objects: { record: "record" },
      },
      components: { record: { edit: "$t(common.actions.edit) $t(common.objects.record)", destructive: "deleting the $t(common.objects.record) cannot be undone" } },
    },
  };
  const result = analyze({
    ...catalogs,
    text: `
      t("common.actions.edit") + t("common.objects.record");
      \`\${t("common.actions.edit")} \${t("common.objects.record")}\`;
      t("common.actionObjectTemplates.edit", {
        object: t("common.objects.record"),
      });
      <Button>{t("components.record.edit")}</Button>;
      <Button>{t("components.record.destructive")}</Button>;
      <span>{tFragment("common.objects.record")}</span>;
      import { tFragment } from "@/i18n";
    `,
  });
  assert.equal(result.errors.filter((error) => error.msg.startsWith("动作与对象不得")).length, 2);
  assert.equal(result.errors.filter((error) => error.msg.includes("动作对象文案")).length, 1);
  // 插值参数里的翻译调用必须是 tFragment；tFragment 不得直接展示
  assert.equal(result.errors.filter((error) => error.msg.includes("必须用 tFragment")).length, 1);
  assert.equal(result.errors.filter((error) => error.msg.includes("不得直接展示")).length, 1);

  const valid = analyze({
    ...catalogs,
    text: `
      import { tFragment } from "@/i18n";
      t("common.actions.edit");
      t("common.actionObjectTemplates.edit", {
        object: tFragment("common.objects.record"),
      });
      <Button>{t("components.record.destructive")}</Button>;
      t("components.record.edit");
    `,
  });
  assert.deepEqual(valid.errors, []);
});

test("动作对象模板必须含 object 插值并对应裸动作", () => {
  const result = analyze({
    zh: { common: { actions: { edit: "编辑" }, actionObjectTemplates: { edit: "编辑对象", archive: "归档{object}" } } },
    text: 't("common.actions.edit"); t("common.actionObjectTemplates.edit"); t("common.actionObjectTemplates.archive", {object:"记录"})',
  });
  assert.ok(result.errors.some((error) => error.msg.includes("必须包含 {object}")));
  assert.ok(result.errors.some((error) => error.msg.includes("缺少对应 common.actions.archive")));
});

test("重复和近似文案只在同业务命名空间生成候选，不参与门禁", () => {
  const candidates = findCopyCandidates({
    pages: { users: { create: "创建用户账号", add: "创建用户账号", newOne: "创建一个用户账号" } },
    common: { create: "创建用户账号" },
  });
  assert.ok(candidates.some((item) => item.kind === "exact" && item.left.includes("pages.users")));
  assert.equal(candidates.some((item) => item.left.startsWith("common.") || item.right.startsWith("common.")), false);
});

test("清理键同步移除空父节点且不影响相邻键", () => {
  assert.deepEqual(removeCatalogKeys({ a: { stale: "x" }, b: { keep: "y" } }, ["a.stale"]), { b: { keep: "y" } });
});

test("可见 JSX、受控属性与真实 Ant message 中文文案必须国际化", () => {
  const result = analyze({
    zh: { copy: "已翻译" },
    sources: [{
      file: "src/example.tsx",
      text: `
        import * as Ant from "antd";
        import { message as staticMessage } from "@/utils/antdStatic";
        import { notifyWarning, notifyActionFailed as notifyFail } from "@/utils/feedback";
        import { useTranslation } from "react-i18next";
        const descriptions = { account: "登录名", email: "邮箱地址" };
        const tooltipProps = { tooltip: "静态展开说明" };
        const businessData = { name: "业务数据不应误报" };
        const localMessage = { success() {} };
        function Example({ field }) {
          const { t } = useTranslation();
          const [messageApi] = Ant.message.useMessage();
          const { message: appMessage } = Ant.App.useApp();
          const { error: showError } = messageApi;
          messageApi.success("保存成功");
          appMessage.warning("操作有风险");
          showError("别名调用失败");
          Ant.message.error({ content: "请求失败" });
          staticMessage.info("没有结果");
          notifyWarning("统一通知警告");
          notifyFail("save", "统一通知失败原因");
          notifyFail("save");
          localMessage.success("局部日志不是 Ant message");
          return <>
            {/* 中文注释不属于可见文案 */}
            <span>直接可见中文</span>
            <span>{"表达式中文"}</span>
            <Ant.Form.Item tooltip={descriptions[field]}>{t("copy")}</Ant.Form.Item>
            <Ant.Form.Item {...tooltipProps}>{t("copy")}</Ant.Form.Item>
            <Ant.Form.Item tooltip={t("copy")}>{t("copy")}</Ant.Form.Item>
          </>;
        }
      `,
    }],
  });
  const messages = result.errors.map((error) => error.msg);
  assert.equal(messages.filter((message) => message.includes("可见 JSX")).length, 2);
  assert.equal(messages.filter((message) => message.includes("可见属性 tooltip")).length, 2);
  assert.equal(messages.filter((message) => message.includes("Ant message 反馈")).length, 7);
  assert.equal(messages.some((message) => message.includes("业务数据不应误报")), false);
  assert.equal(messages.some((message) => message.includes("局部日志")), false);
});

test("坐标轴类目与清单类目里的文案常量不得写死，必须来自 i18n 或数据", () => {
  const axis = analyze({ zh: { a: "甲" }, text: 'const weekDays = ["Mon.", "Tue."]; const option = { yAxis: { type: "category", data: weekDays } }; t("a");' });
  assert.ok(axis.errors.some((e) => e.msg.includes("坐标轴类目里的文案常量")));
  const inline = analyze({ zh: { a: "甲" }, text: 'const el = <BarList categories={["Alpha", "Beta"]} />; t("a");' });
  assert.ok(inline.errors.some((e) => e.msg.includes("清单类目里的文案常量")));
  const fromData = analyze({ zh: { a: "甲" }, text: 'const option = { yAxis: { data: rows.map((r) => r.name) } }; const hours = Array.from({ length: 24 }, (_, h) => `${h}:00`); const o2 = { xAxis: { data: hours } }; t("a");' });
  assert.deepEqual(fromData.errors.filter((e) => e.msg.includes("文案常量")), []);
  const localized = analyze({ zh: { w: { mon: "周一" } }, text: 'const weekDays = [t("w.mon")]; const option = { yAxis: { data: weekDays } };' });
  assert.deepEqual(localized.errors.filter((e) => e.msg.includes("文案常量")), []);
});

test("完全相同的文案只能有一个键：页面键必须复用 common/菜单键或彼此合并", () => {
  const dup = analyze({ zh: { common: { terms: { id: "ID" } }, pages: { a: { id: "ID" } } }, en: { common: { terms: { id: "ID" } }, pages: { a: { id: "ID" } } }, text: 't("common.terms.id"); t("pages.a.id");' });
  assert.ok(dup.errors.some((e) => e.msg.includes('"pages.a.id" 与 "common.terms.id" 在 zh-CN 里文案相同')));
  const ok = analyze({ zh: { a: "甲", b: "乙" }, en: { a: "A", b: "B" }, text: 't("a"); t("b");' });
  assert.deepEqual(ok.errors.filter((e) => e.msg.includes("文案相同")), []);
  // 任一语言相同即违规：同一概念合并，不同概念译文必须区分（英文大小写不敏感）
  const differentEn = analyze({ zh: { a: "状态", b: "状态" }, en: { a: "Status", b: "State" }, text: 't("a"); t("b");' });
  assert.ok(differentEn.errors.some((e) => e.msg.includes("在 zh-CN 里文案相同")));
  const caseOnly = analyze({ zh: { a: "甲", b: "乙" }, en: { a: "Close", b: "close" }, text: 't("a"); t("b");' });
  assert.ok(caseOnly.errors.some((e) => e.msg.includes("在 en-US 里文案相同")));
});

test("可见文案不得写死英文：品牌名、术语、单位词一样要走 i18n 词表；配置值不误报", () => {
  const brand = analyze({ zh: { a: "甲" }, text: 'const el = <span className="brand-title">MyApp</span>; t("a");' });
  assert.ok(brand.errors.some((e) => e.msg.includes("可见 JSX 文本")));
  const label = analyze({ zh: { a: "甲" }, text: 'const el = <Form.Item label="标识符" />; t("a");' });
  assert.ok(label.errors.some((e) => e.msg.includes("可见属性 label")));
  const config = analyze({ zh: { a: "甲" }, text: 'const el = <Button size="small" variant="outlined" className="message-item assistant">{active === "user" && t("a")}</Button>; const opts = [{ value: "range", label: t("a") }];' });
  assert.deepEqual(config.errors.filter((e) => e.msg.includes("可见")), []);
});

test("字典拼接：值里写死了其它键的文案必须改为 $t() 引用，引用只能指向 common，引用不存在或循环报错", () => {
  const hardcoded = analyze({ zh: { common: { vocab: { item: "条目" } }, pages: { a: { title: "自动条目" } } }, en: { common: { vocab: { item: "item" } }, pages: { a: { title: "auto item" } } }, text: 't("common.vocab.item"); t("pages.a.title");' });
  assert.ok(hardcoded.errors.some((e) => e.msg.includes('写死了 "条目"') && e.msg.includes("$t(common.vocab.item)")));
  assert.ok(hardcoded.errors.some((e) => e.msg.includes('写死了 "item"')));
  const composed = analyze({ zh: { common: { vocab: { item: "条目" } }, pages: { a: { title: "自动$t(common.vocab.item)" } } }, en: { common: { vocab: { item: "item" } }, pages: { a: { title: "auto $t(common.vocab.item)" } } }, text: 't("pages.a.title");' });
  assert.deepEqual(composed.errors, []);
  // 英文整词匹配：pools 不含 pool；中文按子串
  const plural = analyze({ zh: { a: "甲", b: "乙" }, en: { a: "pool", b: "pools" }, text: 't("a"); t("b");' });
  assert.deepEqual(plural.errors.filter((e) => e.msg.includes("写死")), []);
  const outside = analyze({ zh: { pages: { a: { x: "条目", y: "自动$t(pages.a.x)" } } }, en: { pages: { a: { x: "item", y: "auto $t(pages.a.x)" } } }, text: 't("pages.a.x"); t("pages.a.y");' });
  assert.ok(outside.errors.some((e) => e.msg.includes("必须位于 common 命名空间")));
  const missing = analyze({ zh: { a: "$t(nope)" }, en: { a: "$t(nope)" }, text: 't("a");' });
  assert.ok(missing.errors.some((e) => e.msg.includes('引用了不存在的键 "nope"')));
  const cycle = analyze({ zh: { common: { a: "$t(common.b)", b: "$t(common.a)" } }, en: { common: { a: "$t(common.b)", b: "$t(common.a)" } }, text: 't("common.a"); t("common.b");' });
  assert.ok(cycle.errors.some((e) => e.msg.includes("循环")));
  // 引用计入使用；插值变量沿引用展开
  const viaRef = analyze({ zh: { common: { vocab: { n: "{count} 条" } }, a: "共 $t(common.vocab.n)" }, en: { common: { vocab: { n: "{count} items" } }, a: "total $t(common.vocab.n)" }, text: 't("a", { count })' });
  assert.deepEqual(viaRef.errors, []);
  assert.ok(analyze({ zh: { common: { vocab: { n: "{count} 条" } }, a: "共 $t(common.vocab.n)" }, en: { common: { vocab: { n: "{count} items" } }, a: "total $t(common.vocab.n)" }, text: 't("a")' }).errors.some((e) => e.msg.includes("缺少插值变量：count")));
});

test("条件分支中的翻译片段只能流入翻译插值，不能借条件直接展示", () => {
  const zh = { common: { atom: "甲" }, sentence: "前{value}后" };
  const valid = analyze({ zh, text: `import {tFragment} from '@/i18n'; t('sentence', {value: flag ? tFragment('common.atom') : ''});` });
  assert.deepEqual(valid.errors, []);
  const plain = analyze({ zh, text: `import {tFragment} from '@/i18n'; t('sentence', {value: flag ? t('common.atom') : ''});` });
  assert.ok(plain.errors.some(error => error.msg.includes('必须用 tFragment')));
  const visible = analyze({ zh, text: `import {tFragment} from '@/i18n'; t('sentence',{value:''}); <span>{flag ? tFragment('common.atom') : ''}</span>;` });
  assert.ok(visible.errors.some(error => error.msg.includes('不得直接展示')));
});


test("缩写原子的拼接门禁与composer同义：自然连接词可保留，技术缩写仍需复用", () => {
  const input = { zh:{ common:{ vocab:{ and:"且" } }, pages:{ natural:"设备和耗材", technical:"操作符" } }, en:{ common:{ vocab:{ and:"AND" } }, pages:{ natural:"devices and supplies", technical:"AND operator" } }, text:'t("pages.natural"); t("pages.technical");' };
  const result = analyze(input);
  assert.equal(result.errors.filter(e => e.msg.includes('"pages.natural" 的文案里写死了')).length, 0);
  assert.equal(result.errors.filter(e => e.msg.includes('"pages.technical" 的文案里写死了')).length, 1);
  input.en.pages.technical = "$t(common.vocab.and) operator";
  assert.deepEqual(analyze(input).errors, []);
});

test("内联对象翻译契约识别导入与解构别名，不误报已使用键", () => {
  for (const declaration of [
    'function render({t: translate}: {t: Translator}) { return translate("used"); }',
    'const Component: React.FC<{t: Translator}> = ({t: translate}) => translate("used");',
  ]) {
    const result = analyze({
      zh: { used: "已用", stale: "闲置" },
      sources: [{file: "src/inline.tsx", text: `import type {TFunction as Translator} from "i18next"; ${declaration}`}],
    });
    assert.equal(result.errors.some((error) => error.msg.includes('未使用键 "used"')), false);
    assert.ok(result.errors.some((error) => error.msg.includes('未使用键 "stale"')));
  }
});

test("内联对象翻译契约拒绝缺失键并保留作用域遮蔽检查", () => {
  const result = analyze({
    zh: { used: "已用" },
    sources: [{file: "src/inline.tsx", text: `
      import type {TFunction} from "i18next";
      function render({t}: {t: TFunction}) {
        t("used"); t("missing");
        function nested(t) { return t("ordinary-value"); }
        return nested((value) => value);
      }
    `}],
  });
  assert.ok(result.errors.some((error) => error.msg.includes("missing") && error.msg.includes("缺少")));
  assert.ok(result.errors.some((error) => error.msg.includes("不得在内层作用域")));
  assert.equal(result.errors.some((error) => error.msg.includes("ordinary-value") && error.msg.includes("缺少")), false);
});

test("内联对象中的普通同名函数和未导入的 TFunction 不冒充翻译契约", () => {
  const result = analyze({
    zh: {},
    sources: [{file: "src/ordinary.ts", text: `
      type TFunction = (value: number) => number;
      function render({t}: {t: TFunction}) { return t("ordinary-value"); }
      function other({t}: {t: (value: number) => number}) { return t("other-value"); }
    `}],
  });
  assert.deepEqual(result.errors, []);
});

test("中文语言字段名称本地化，嵌套引用与切换短词条分离", () => {
  const zh = { common: { language: { enUS: "英文", zhCN: "简体中文", short: { enUS: "EN" } } }, label: "标题（$t(common.language.enUS)）" };
  const en = { common: { language: { enUS: "English", zhCN: "simplified Chinese", short: { enUS: "EN" } } }, label: "title ($t(common.language.enUS))" };
  const text = 't("label"); t("common.language.zhCN"); t("common.language.short.enUS")';
  assert.deepEqual(analyze({ zh, en, text }).errors, []);
  for (const value of ["English", "EN"]) {
    const broken = structuredClone(zh);
    broken.common.language.enUS = value;
    assert.ok(analyze({ zh: broken, en, text }).errors.some(error => error.msg.includes("语言名称必须随中文界面本地化")));
  }
});
