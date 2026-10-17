import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { sizeTokenScaleIssue, inspectAntThemeMapping, inspectTypographyScale, inspectCss, inspectEntityListForms, inspectScrollSlots, inspectCssVariableContract, inspectDependencies, inspectStyleDependencies, inspectSource,
  inspectDataPageArchitecture,
} from "./design-governance.mjs";

/** 领域绑定的夹具取自项目配置，换项目时单测随引擎一起生效。 */
const project = JSON.parse(readFileSync(new URL("./design-system.project.json", import.meta.url), "utf8"));
const servicesModule = project.servicesModule;
const [statisticExemption = "src/pages/NoSuchPage/None.tsx"] = project.statisticExemptions;
// 信息架构夹具：项目未登记总览/分析页时用合成配置运行同一门禁。
const archConfig = project.infoArch?.applicability === "none" || !project.infoArch?.overviewPage
  ? { overviewPage: "src/pages/Overview/", analysisPage: "src/pages/Analysis/", overviewMetrics: ["total", "requests"] }
  : project.infoArch;
const overviewPage = archConfig.overviewPage;
const analysisPage = archConfig.analysisPage;
const [primaryMetric, secondaryMetric = primaryMetric] = archConfig.overviewMetrics;
const derivedMetric = `${primaryMetric}PerUnit`;
// 大候选接口夹具同样允许项目尚未登记。
const largeCandidateApi = project.largeCandidateApis?.names?.[0] ?? "listLargeCandidates";
const largeCandidateApis = { module: project.largeCandidateApis?.module ?? "@/services/api", names: [largeCandidateApi] };

const inspect = (text, filename = "/src/pages/Example.tsx") => inspectSource(text, filename);
test("按钮图标与文字必须同一表面", () => {
  const issues = (child) => inspect(`import { Button } from "antd"; <Button icon={<EyeOutlined />}>${child}</Button>`)
    .filter(issue => issue.message.includes("按钮图标与文字必须在同一表面"));
  assert.equal(issues('<span style={{background: "red", borderRadius: 8}}>拒绝 6</span>').length, 1);
  assert.equal(issues('<StatusTag tone="error">拒绝 6</StatusTag>').length, 1);
  assert.deepEqual(issues('{t("count", {count: 6})}'), []);
  assert.deepEqual(issues('<span>{count}</span>'), []);
});
const tokenContractCss = (light, dark = "") => `:root {
  color-scheme: light;
${light}
}
:root[data-theme="dark"] {
  color-scheme: dark;
${dark}
}
`;
const validTokenEntry = 'import "./design/tokens.css"; import {createRoot} from "react-dom/client"; createRoot(root).render(app);';
const inspectVariableContract = (options) => inspectCssVariableContract({
  ...options,
  consumers: [...options.consumers, { filename: "src/main.tsx", source: validTokenEntry }],
});

test("token 源必须包含亮暗双主题块且暗色只覆盖亮色键", () => {
  const light = "  --ds-color-text: #111;";
  const dark = "  --ds-color-text: #eee;";
  const tokenSource = { filename: "src/design/tokens.css", source: tokenContractCss(light, dark) };
  const consumers = [
    { filename: "src/main.tsx", source: validTokenEntry },
    { filename: "src/a.css", source: ".a{color:var(--ds-color-text)}" },
  ];
  assert.deepEqual(inspectCssVariableContract({ tokenSource, consumers }), []);
  const rogueDark = { filename: "src/design/tokens.css", source: tokenContractCss(light, "  --ds-color-canvas: #000;") };
  assert.ok(inspectCssVariableContract({ tokenSource: rogueDark, consumers }).some((issue) => issue.message.includes("不在亮色发布清单中")));
  const duplicatedLight = { filename: "src/design/tokens.css", source: tokenContractCss(light + "\n  --ds-color-text: #222;") };
  assert.ok(inspectCssVariableContract({ tokenSource: duplicatedLight, consumers }).some((issue) => issue.message.includes("重复发布")));
  const noDarkBlock = { filename: "src/design/tokens.css", source: ":root { color-scheme: light;\n" + light + "\n}" };
  assert.ok(inspectCssVariableContract({ tokenSource: noDarkBlock, consumers }).some((issue) => issue.message.includes("暗色覆盖块")));
  const noLightScheme = { filename: "src/design/tokens.css", source: tokenContractCss(light, dark).replace("color-scheme: light;", "") };
  assert.ok(inspectCssVariableContract({ tokenSource: noLightScheme, consumers }).some((issue) => issue.message.includes("color-scheme: light")));
});

test("main.tsx 必须真实导入 tokens.css 才能满足启动契约", () => {
  const tokenSource = { filename: "src/design/tokens.css", source: tokenContractCss("  --ds-color-text: #111;") };
  const ok = inspectCssVariableContract({
    tokenSource,
    consumers: [
      { filename: "src/main.tsx", source: validTokenEntry },
      { filename: "src/a.css", source: ".a{color:var(--ds-color-text)}" },
    ],
  });
  assert.deepEqual(ok, []);
  for (const mainSource of [
    'import {createRoot} from "react-dom/client"; createRoot(root).render(app)',
    'import "../design/other.css"; import {createRoot} from "react-dom/client"; createRoot(root).render(app)',
  ]) {
    const issues = inspectCssVariableContract({
      tokenSource,
      consumers: [{ filename: "src/main.tsx", source: mainSource }, { filename: "src/a.css", source: ".a{color:var(--ds-color-text)}" }],
    });
    assert.ok(issues.some((issue) => issue.message.includes("tokens.css")), mainSource);
  }
});

test("TS 样式拒绝裸颜色、尺寸和字体族，但不把 token 索引及业务数值当尺寸", () => {
  for (const text of ["const s={color:'#fff'}", "const s={color:'rebeccapurple'}", "const s={color:'cyan'}", "const s={color:'magenta'}", "const s={color:'CanvasText'}", "const s={background:'ButtonFace'}", "const s={color:'lab(50% 0 0)'}", "const s={color:'device-cmyk(0 1 0 0)'}", "const s={backgroundColor:'rgb(0 0 0)'}", "const s={border:'1px solid #fff'}", "const s={borderInlineStart:'1px solid rgb(0 0 0)'}", "const s={borderImage:'linear-gradient(#fff, #000) 1'}", "const s={maskBorder:'linear-gradient(cyan, magenta) 1'}", "const s={'WebkitMaskImage':'linear-gradient(Canvas, CanvasText)'}", "const s={columnRule:'1px solid #fff'}", "const s={textDecoration:'underline #fff'}", "const s={filter:'drop-shadow(0 1px #fff)'}", "const s={boxShadow:'0 1px 2px rgba(0,0,0,.2)'}", "const s={background:'linear-gradient(#fff, transparent)'}", "const s={fontSize:compact ? 12 : 15}", "const s={padding:'12px 0'}", "const s={fontFamily:'monospace'}", "import {designTokens} from '@/design/tokens'; const mono=designTokens.font.mono; const s={fontFamily:mono}", "import {designTokens} from '@/design/tokens'; const s={fontFamily:compact ? designTokens.font.mono : designTokens.font.family}"]) assert.notEqual(inspect(text).length, 0, text);
  for (const text of ["const palette={primary:'#fff'}", "const chartColors={seriesA:'rgb(1 2 3)'}", "const theme={status:{ok:'#0f0'}}", "const swatches={one:'#fff',two:'#000'}"]) assert.notEqual(inspect(text).length, 0, text);
  assert.deepEqual(inspect("import {designTokens as tokens} from '@/design/tokens'; const s={color:token.colorText,padding:space[16],width:400,margin:0,fontSize:font.body,fontFamily:tokens.font.mono}; const count=12;"), []);
  assert.deepEqual(inspect("const s={fontFamily:token.font.family}", "/src/config/theme.ts"), []);
  assert.notEqual(inspect("const s={fontFamily:'monospace'}", "/src/components/ui/Example.tsx").length, 0);
  assert.deepEqual(inspect("const payload={value:'#fff',size:12}"), []);
  assert.deepEqual(inspect("const payload={primary:'#fff'}"), []);
  assert.deepEqual(inspect("const s={border:`1px solid ${designTokens.color.border}`,boxShadow:designTokens.shadow.raised,background:designTokens.color.surface}"), []);
  assert.deepEqual(inspect("const s={color:'currentColor',background:'transparent',borderColor:'transparent'}"), []);
  assert.deepEqual(inspect("const s={color:designTokens.color.text,background:designTokens.color.canvas}"), []);
});

test("样式常量按词法作用域有限求值，静态成员不能绕过 token", () => {
  for (const text of [
    "const color='#fff'; const style={color}",
    "const raw='#fff'; const palette={primary:raw}; const style={color:palette.primary}",
    "const palette=['#fff']; const style={backgroundColor:palette[0]}",
    "const spacing=13; import {Space} from 'antd'; <Space size={spacing}/>",
    "const spacing=[13]; import {Space} from 'antd'; <Space size={spacing[0]}/>",
    "const layout={compact:13}; import {Space} from 'antd'; <Space size={layout.compact}/>",
    "const key='compact'; const layout={[key]:13}; import {Space} from 'antd'; <Space size={layout[key]}/>",
    "const index=0; const spacing=[13]; import {Space} from 'antd'; <Space size={spacing[index]}/>",
    "const values={raw:13}; const {raw:spacing}=values; import {Space} from 'antd'; <Space size={spacing}/>",
    "const values=[0,13]; const [,spacing]=values; import {Space} from 'antd'; <Space size={spacing}/>",
    "const values={nested:{raw:'#fff'}}; const {nested:{raw:color}}=values; const style={color}",
    "const spacing='13px'; const style={gap:spacing}",
    "const config={...runtime,value:13}; const style={gap:config.value}",
    "const config={value:13,other:0}; config.other=runtime; const style={gap:config.value}",
    "const config={value:designTokens.space.md}; config.value=13; const style={gap:config.value}",
  ]) assert.notEqual(inspect(text).length, 0, text);
  for (const text of [
    "const count=13; const payload={count}",
    "const color=getRuntimeColor(); const style={color}",
    "let spacing=13; import {Space} from 'antd'; <Space size={spacing}/>",
    "const spacing=getRuntimeSpacing(); import {Space} from 'antd'; <Space size={spacing}/>",
    "const spacing=spacing; import {Space} from 'antd'; <Space size={spacing}/>",
    "const spacing=13; import {Space} from 'antd'; function View(spacing){return <Space size={spacing}/>}",
    "import {designTokens} from '@/design/tokens'; const spacing=designTokens.space.md; import {Space} from 'antd'; <Space size={spacing}/>",
    "import {designTokens} from '@/design/tokens'; const values={safe:designTokens.color.text,example:'#fff'}; const {safe:color}=values; const style={color}",
    "import {designTokens} from '@/design/tokens'; const values=[designTokens.space.md,13]; const [spacing]=values; import {Space} from 'antd'; <Space size={spacing}/>",
    "const values={unsafe:13}; values.unsafe=runtime; import {Space} from 'antd'; <Space size={values.unsafe}/>",
    "const values=[13]; values[0]=runtime; import {Space} from 'antd'; <Space size={values[0]}/>",
    "const values={safe:designTokens.space.md,...runtime,unsafe:13}; import {Space} from 'antd'; <Space size={values.safe}/>",
    "const config={value:13,...runtime}; const style={gap:config.value}",
    "const config={value:designTokens.space.md}; const style={gap:config.value}; config.value=13",
    "const config={value:designTokens.space.md,other:0}; config.other=13; const style={gap:config.value}",
    "const config={value:designTokens.space.md}; function neverCalled(){config.value=13} const style={gap:config.value}",
    "const config={value:designTokens.space.md}; if(flag){config.value=13}else{const style={gap:config.value}}",
  ]) assert.deepEqual(inspect(text), [], text);
  assert.deepEqual(inspect("const config={value:designTokens.space.md}; const style={gap:config.value}; config.value=13"), []);
  assert.notEqual(inspect("if(flag){const config={value:designTokens.space.md}; config.value=13; const style={gap:config.value}}").length, 0);
});

test("共享组件入口不能被导入别名绕过", () => {
  assert.notEqual(inspect('import { Tooltip as Tip } from "antd"').length, 0);
  assert.notEqual(inspect('import { Tag as Label, Badge } from "antd"').length, 0);
  assert.notEqual(inspect('import * as Ant from "antd"; const { Tooltip: Tip } = Ant').length, 0);
  assert.notEqual(inspect('import * as Ant from "antd"; const { Tag } = Ant').length, 0);
  assert.notEqual(inspect('import * as Ant from "antd"; const Tip = Ant.Tooltip').length, 0);
  assert.notEqual(inspect('export { Tooltip as Tip } from "antd"').length, 0);
  assert.notEqual(inspect('export {Typography} from "antd"').length, 0);
  assert.notEqual(inspect('export {QueryFeedback} from "@/components/ui"').length, 0);
  assert.notEqual(inspect('export * from "@/components/ui/index"').length, 0);
  assert.notEqual(inspect('export {QueryFeedback} from "../components/ui"', "/src/pages/bridge.ts").length, 0);
  assert.notEqual(inspect('import { PageContainer } from "@/components/ui"; <PageContainer />').length, 0);
  assert.notEqual(inspect('import { PageContainer as Page } from "@/components/ui"; <Page />').length, 0);
  assert.notEqual(inspect('export * from "antd"').length, 0);
  assert.notEqual(inspect('export { Button as Action } from "antd"', "/src/components/ui/Action.tsx").length, 0);
  assert.notEqual(inspect('import { Button as Raw } from "antd"; const Alias=Raw; export {Alias}', "/src/components/ui/Action.tsx").length, 0);
  assert.notEqual(inspect('import * as Ant from "antd"; const UI=Ant; export const Tip=UI.Tooltip', "/src/components/ui/Tip.tsx").length, 0);
  assert.notEqual(inspect('export { Descriptions } from "antd"', "/src/components/ui/Descriptions.tsx").length, 0);
  assert.notEqual(inspect('export { List } from "antd"', "/src/components/ui/index.ts").length, 0);
  assert.deepEqual(inspect('import { AppPage } from "@/components/ui"; <AppPage />'), []);
  assert.notEqual(inspect('import { AppPage } from "@/components/ui/index"; <AppPage />').length, 0);
  assert.notEqual(inspect('import { AppPage } from "../components/ui"; <AppPage />', "/src/pages/Example.tsx").length, 0);
  assert.deepEqual(inspect('import { Tooltip } from "@/components/ui"'), []);
  assert.deepEqual(inspect('import { Tooltip } from "antd"', "/src/components/ui/Tooltip.tsx"), []);
  assert.deepEqual(inspect('export { Descriptions } from "antd"', "/src/components/ui/index.ts"), []);
  assert.deepEqual(inspect('import * as Ant from "antd"; const { Button } = Ant'), []);
  assert.deepEqual(inspect('const Button=(props)=><button {...props}/>; const Table=(props)=><div/>; const Tooltip=(props)=><span/>; <><Button icon={<PlusOutlined />} title="本地"/><Table/><Tooltip/></>'), []);
  assert.deepEqual(inspect('import * as Ant from "antd"; function View(Ant){return <Ant.Button type="link">本地</Ant.Button>}'), []);
  assert.deepEqual(inspect('import { Button as Raw } from "antd"; const Wrapped=(props)=><Raw {...props}/>; export {Wrapped}', "/src/components/ui/Action.tsx"), []);
  assert.notEqual(inspect('import {ViewSwitch as Switch} from "@/components/ui"; <Switch {...props}/>').length, 0);
  assert.notEqual(inspect('import * as UI from "@/components/ui"; <UI.ViewSwitch {...props}/>').length, 0);
  assert.deepEqual(inspect('const ViewSwitch=(props)=><div {...props}/>; <ViewSwitch {...props}/>'), []);
  assert.notEqual(inspect('import {Button as Action} from "antd"; export default Action').length, 0);
  assert.notEqual(inspect('import * as UI from "@/components/ui"; export {UI}').length, 0);
  assert.notEqual(inspect('import {ViewSwitch} from "@/components/ui"; export const Bridge=ViewSwitch').length, 0);
});

test("Ant 组件身份跟随不可变别名，局部同名与遮蔽不误报", () => {
  assert.notEqual(inspect('import {Button as Raw} from "antd"; import {CopyOutlined} from "@ant-design/icons"; const A=Raw; const B=A as typeof A; <B icon={<CopyOutlined/>}/>').length, 0);
  assert.notEqual(inspect('import * as Ant from "antd"; const UI=Ant; const {Button:Action}=UI; <Action type="link">详情</Action>').length, 0);
  assert.notEqual(inspect('import {Table as Grid} from "antd"; const Stable=Grid; <Stable columns={columns}/>').length, 0);
  assert.deepEqual(inspect('const Button=(props)=><button/>; <Button icon={<PlusOutlined />} type="link">本地动作</Button>'), []);
  assert.deepEqual(inspect('const Table=(props)=><section/>; <Table columns={columns}/>'), []);
  assert.deepEqual(inspect('import {Button as Raw} from "antd"; let Action=Raw; <Action type="link">动态组件</Action>'), []);
});

test("Ant Design 6 已弃用 List，别名、命名空间和共享层也不得绕过", () => {
  assert.notEqual(inspect('import {List as Items} from "antd"; <Items/>').length, 0);
  assert.notEqual(inspect('import * as Ant from "antd"; <Ant.List/>').length, 0);
  assert.notEqual(inspect('import * as Ant from "antd"; const UI=Ant; const {List:Items}=UI; <Items/>').length, 0);
  assert.notEqual(inspect('import {List as Raw} from "antd"; const Items=Raw; <Items/>', "/src/components/ui/Items.tsx").length, 0);
  assert.deepEqual(inspect('const List=(props)=><ul/>; <List/>'), []);
});

test("小数位上限三位：禁止直接 toFixed/toLocaleString、precision>3 与 {c} 模板", () => {
  const digitIssues = (source, filename) => inspect(source, filename).filter((issue) => /小数位|formatDecimal/.test(issue.message));
  assert.notEqual(digitIssues('const text = value.toFixed(4);').length, 0);
  assert.notEqual(digitIssues('const text = count.toLocaleString();').length, 0);
  assert.notEqual(digitIssues('const option = { tooltip: { formatter: "{b}: ￥{c}" } };').length, 0);
  assert.notEqual(digitIssues('import {Statistic} from "antd"; <Statistic value={1} precision={4} />', `/${statisticExemption}`).length, 0);
  assert.deepEqual(digitIssues('import { formatDecimal } from "@/utils/number"; const text = formatDecimal(value, 2); const option = { tooltip: { formatter: (p) => `${p.name}: ${formatDecimal(p.value)}` } };'), []);
  assert.deepEqual(digitIssues('export function formatDecimal(v, d) { return Number(v).toFixed(d); }', "/src/utils/number.ts"), []);
});

test("操作组顺序：中性在前、危险在后、删除最后", () => {
  const orderIssues = (source) => inspect(source).filter((issue) => issue.message.includes("操作组顺序"));
  assert.notEqual(orderIssues('import {Button, Popconfirm} from "antd"; <Space><Popconfirm title="x"><Button color="danger" variant="outlined" icon={<DeleteOutlined />}>删除</Button></Popconfirm><Button icon={<EditOutlined />}>编辑</Button></Space>').length, 0);
  assert.notEqual(orderIssues('import {Button} from "antd"; const items = [<Button key="a" color="danger" variant="outlined" icon={<ClearOutlined />}>重置</Button>, <Button key="b" icon={<EditOutlined />}>编辑</Button>];').length, 0);
  assert.deepEqual(orderIssues('import {Button, Popconfirm} from "antd"; <Space><Button icon={<EditOutlined />}>编辑</Button><Button color="danger" variant="outlined" icon={<StopOutlined />}>禁用</Button><Popconfirm title="x"><Button color="danger" variant="outlined" icon={<DeleteOutlined />}>删除</Button></Popconfirm></Space>'), []);
});

test("筛选下拉不得添加“全部”哨兵选项，空值即全部", () => {
  const allIssues = (source) => inspect(source).filter((issue) => issue.message.includes("哨兵"));
  assert.notEqual(allIssues('const options = [{ value: "all", label: t("x.all", { defaultValue: "全部" }) }, { value: "true", label: "启用" }];').length, 0);
  assert.notEqual(allIssues('const options = [{ value: "", label: "不限" }];').length, 0);
  assert.deepEqual(allIssues('const options = [{ value: "true", label: "启用" }, { value: "false", label: "禁用" }];'), []);
  assert.deepEqual(allIssues('const options = [{ value: "all", label: "全部时间" }];').length === 0 ? [] : [1], []);
});

test("scrim 遮罩色不得用作文字或边框颜色", () => {
  const scrimIssues = (source) => inspect(source).filter((issue) => issue.message.includes("scrim"));
  assert.notEqual(scrimIssues('<span style={{ color: "var(--ds-color-scrim-strong)" }}>未配置</span>').length, 0);
  assert.notEqual(scrimIssues('const tile = { textColor: "var(--ds-color-scrim)" };').length, 0);
  assert.deepEqual(scrimIssues('<div style={{ background: "var(--ds-color-scrim)", color: "var(--ds-color-text-secondary)" }} />'), []);
  assert.notEqual(inspectCss(".x { color: var(--ds-color-scrim); }", { filename: "/src/pages/X/style.css" }).filter((issue) => issue.message.includes("scrim")).length, 0);
  assert.deepEqual(inspectCss(".x { background: var(--ds-color-scrim); }", { filename: "/src/pages/X/style.css" }).filter((issue) => issue.message.includes("scrim")), []);
});

test("站内链接统一 ActionLink，业务层禁止裸 react-router Link", () => {
  const linkIssues = (source, filename) => inspect(source, filename).filter((issue) => issue.message.includes("ActionLink"));
  assert.notEqual(linkIssues('import { Link } from "react-router"; <Link to="/x">详情</Link>').length, 0);
  assert.deepEqual(linkIssues('import { ActionLink } from "@/components/ui"; import { EyeOutlined } from "@ant-design/icons"; <ActionLink to="/x" icon={<EyeOutlined />}>详情</ActionLink>'), []);
  assert.deepEqual(linkIssues('import { Link } from "react-router"; <Link to="/">Console</Link>', "/src/layouts/BasicLayout.tsx"), []);
});

test("批量操作不得循环调用单条接口", () => {
  const loopIssues = (source) => inspect(source).filter((issue) => issue.message.includes("循环调用单条接口"));
  assert.notEqual(loopIssues(`import { updateRecord } from "${servicesModule}/records"; await Promise.allSettled(rows.map((row) => updateRecord({ id: row.name, disabled: true })));`).length, 0);
  assert.notEqual(loopIssues(`import { deleteConfigI18N } from "${servicesModule}/i18N"; await Promise.all(keys.map(async (key) => { await deleteConfigI18N({ key, app_id }); }));`).length, 0);
  assert.deepEqual(loopIssues(`import { postAdminBatchResetRecords } from "${servicesModule}/admin"; await postAdminBatchResetRecords({ ids: rows.map((row) => row.name) });`), []);
  assert.deepEqual(loopIssues(`import { getA, getB } from "${servicesModule}/admin"; const [a, b] = await Promise.all([getA(), getB()]);`), []);
  assert.deepEqual(loopIssues('import { getPermissionTagDetail } from "./service"; const details = await Promise.all(tags.map((tag) => getPermissionTagDetail(tag.id)));'), []);
});

test("表格不提供多选：业务层不得开启 rowSelection", () => {
  const rowIssues = (source) => inspect(source).filter((issue) => issue.message.includes("rowSelection"));
  assert.notEqual(rowIssues('import {Table} from "antd"; <Table rowKey="id" rowSelection={{ selectedRowKeys: keys }} pagination={false} scroll={responsiveTableScroll} />').length, 0);
  assert.notEqual(rowIssues('import {DataTable} from "@/components/ui"; <DataTable controller={table} columns={columns} rowKey="id" errorTitle="x" rowSelection={{ selectedRowKeys: keys }} />').length, 0);
  assert.deepEqual(rowIssues('import {DataTable} from "@/components/ui"; <DataTable controller={table} columns={columns} rowKey="id" errorTitle="x" />'), []);
});

test("业务层禁止 Ant Statistic，关键数据统一 SummaryStrip", () => {
  const statIssues = (source, filename) => inspect(source, filename).filter((issue) => issue.message.includes("SummaryStrip"));
  assert.notEqual(statIssues('import {Statistic} from "antd"; <Statistic title="余额" value={1} />').length, 0);
  assert.deepEqual(statIssues('import {Statistic} from "antd"; <Statistic title="余额" value={1} />', `/${statisticExemption}`), project.statisticExemptions.length ? [] : statIssues('import {Statistic} from "antd"; <Statistic title="余额" value={1} />'));
  assert.deepEqual(statIssues('import {SummaryStrip} from "@/components/ui"; <SummaryStrip label="x" items={items} />'), []);
});

test("时间范围/日期选择只有共享 RangePicker/FieldDatePicker 一个入口", () => {
  const pickerIssues = (source, filename) => inspect(source, filename).filter((issue) => issue.message.includes("RangePicker/FieldDatePicker"));
  for (const source of [
    'import {DatePicker} from "antd"; <DatePicker.RangePicker allowClear />',
    'import {DatePicker} from "antd"; const {RangePicker}=DatePicker; <RangePicker allowClear />',
    'import * as Ant from "antd"; <Ant.DatePicker.RangePicker allowClear />',
    'import {DatePicker} from "antd"; <DatePicker allowClear showTime />',
    'import {DatePicker as Calendar} from "antd"; <Calendar allowClear />',
  ]) assert.ok(pickerIssues(source).length, source);
  assert.deepEqual(pickerIssues('import {RangePicker, FieldDatePicker} from "@/components/ui"; <div><RangePicker allowClear /><FieldDatePicker allowClear={false} /></div>'), []);
  assert.deepEqual(pickerIssues('import {DatePicker} from "antd"; <DatePicker.RangePicker allowClear />', "/src/components/ui/RangePicker.tsx"), []);
});

test("flush 信息网格只能贴边填满零内边距卡片的唯一正文", () => {
  const flushIssues = (source) => inspect(source).filter((issue) => issue.message.includes("flush"));
  assert.deepEqual(flushIssues('import {Card} from "antd"; import {InformationFieldGrid} from "@/components/ui"; <Card title="详细信息" styles={{ body: { padding: 0 } }}><InformationFieldGrid flush items={items} /></Card>'), []);
  assert.notEqual(flushIssues('import {Card} from "antd"; import {InformationFieldGrid} from "@/components/ui"; <Card title="详细信息"><InformationFieldGrid flush items={items} /></Card>').length, 0);
  assert.notEqual(flushIssues('import {Card} from "antd"; import {InformationFieldGrid} from "@/components/ui"; <Card title="x" styles={{ body: { padding: 0 } }}><p>说明</p><InformationFieldGrid flush items={items} /></Card>').length, 0);
  assert.notEqual(flushIssues('import {InformationFieldGrid} from "@/components/ui"; <div><InformationFieldGrid flush items={items} /></div>').length, 0);
  assert.deepEqual(flushIssues('import {InformationFieldGrid} from "@/components/ui"; <div><InformationFieldGrid compact items={items} /></div>'), []);
});

test("切割面板必须圆角裁切且分隔线与外框同线宽", () => {
  // 不放占位入口：navigate("/") 冒充未实现功能即拒绝，404 页回首页除外
  const placeholderIssues = (code, file) => inspectSource(code, file).filter((issue) => issue.message.includes("不存在功能"));
  assert.equal(placeholderIssues('const go = () => navigate("/");', "/src/components/Avatar/index.tsx").length, 1);
  assert.deepEqual(placeholderIssues('const go = () => navigate("/");', "/src/pages/404Page/index.tsx"), []);
  // 列表不放自增 ID；详情页必须有字段之外的信息
  const idIssues = (code) => inspectSource(code, "/src/pages/Demo/columns.tsx").filter((issue) => issue.message.includes("自增 ID"));
  assert.equal(idIssues('const c = [{ title: t("common.vocab.id"), dataIndex: "id" }];').length, 1);
  assert.deepEqual(idIssues('const c = [{ title: t("common.vocab.name"), dataIndex: "name" }];'), []);
  const detailIssues = (code) => inspectSource(code, "/src/pages/Demo/index.tsx").filter((issue) => issue.message.includes("字段以外"));
  assert.equal(detailIssues("const p = <EntityDetailPage title={a} backTo={b} query={q} fields={f} />;").length, 1);
  assert.deepEqual(detailIssues("const p = <EntityDetailPage title={a} backTo={b} query={q} fields={f} tabs={tabs} />;"), []);
  assert.deepEqual(detailIssues("const p = <EntityDetailPage title={a} backTo={b} query={q} fields={f}><Table /></EntityDetailPage>;"), []);
  // 新建 / 编辑统一抽屉：ModalForm 只允许 query / export 工具
  const modalIssues = (code) => inspectSource(code, "/src/pages/Demo/index.tsx").filter((issue) => issue.message.includes("ModalForm 只用于"));
  assert.equal(modalIssues("const x = <ModalForm title={a} onFinish={save}>{fields}</ModalForm>;").length, 1);
  assert.deepEqual(modalIssues('const x = <ModalForm title={a} submitter={{ action: "export" }}>{fields}</ModalForm>;'), []);
  // 只读字段用 ReadonlyValue，不用 disabled 的 Input
  const readonlyIssues = (code) => inspectSource(code, "/src/pages/Demo/index.tsx").filter((issue) => issue.message.includes("ReadonlyValue"));
  assert.equal(readonlyIssues("const x = <Input disabled />;").length, 1);
  assert.deepEqual(readonlyIssues("const x = <ReadonlyValue />;"), []);
  // 时间列合一：两个 columnWidth.time 列即拒绝
  const timeIssues = (code) => inspectSource(code, "/src/pages/Demo/columns.tsx").filter((issue) => issue.message.includes("时间列"));
  assert.equal(timeIssues("const c = [{ title: a, width: columnWidth.time }, { title: b, width: columnWidth.time }];").length, 1);
  assert.deepEqual(timeIssues("const c = [{ title: a, width: columnWidth.time }, { title: b, width: columnWidth.name }];"), []);
  // 业务实体行内：有详情入口时其余按钮必须是危险操作
  const rowIssues = (code) => inspectSource(code, "/src/pages/Demo/columns.tsx").filter((issue) => issue.message.includes("行内除"));
  const row = (button) => `const c = [{ title: a, render: () => <><ActionLink icon={<EyeOutlined />} to="/x/detail/1">{t("common.vocab.detail")}</ActionLink>${button}</> }];`;
  assert.equal(rowIssues(row('<Button icon={<SearchOutlined />} type="text">{t("common.actions.query")}</Button>')).length, 1);
  assert.deepEqual(rowIssues(row('<Button icon={<DeleteOutlined />} variant="text" color="danger">{t("common.actions.delete")}</Button>')), []);
  // 业务实体列表目录不得有弹窗 / 抽屉表单
  const listFiles = (form) => [
    { filename: "src/pages/DemoListPage/columns.tsx", source: 'const c = <ActionLink icon={<EyeOutlined />} to={detailPath(id)}>x</ActionLink>;' },
    { filename: "src/pages/DemoListPage/index.tsx", source: 'import { buildColumns } from "./columns";\n' + form },
    // 同目录另一个页签（配置条目）的抽屉在自己的文件里，不受业务实体列表影响
    { filename: "src/pages/DemoListPage/DefinitionDrawer.tsx", source: "const d = <DrawerForm title={x} />;" },
  ];
  assert.equal(inspectEntityListForms(listFiles("const f = <ModalForm title={x} />;")).length, 1);
  assert.deepEqual(inspectEntityListForms(listFiles("const f = <DataTable />;")), []);
  // 批量写：数组里展开的多个 .map(单条写接口) 同样拒绝
  const batchIssues = (code) => inspectSource(code, "/src/pages/Demo/Selector.tsx").filter((issue) => issue.message.includes("批量写操作"));
  const batchImports = 'import { createBinding, deleteBinding, getBindingList } from "@/services/openPlatformService/bindings";\n';
  assert.equal(batchIssues(batchImports + "await Promise.all([...a.map((m) => createBinding(m)), ...b.map((x) => deleteBinding(x))]);").length, 1);
  assert.equal(batchIssues(batchImports + "await Promise.all(a.map((m) => createBinding(m)));").length, 1);
  assert.deepEqual(batchIssues(batchImports + "await Promise.all([...a.map((m) => getBindingList(m))]);"), []);
  // 页面入口只组合：index.tsx 里定义表格列即拒绝，columns.tsx 不受限
  const columnsIssues = (filename) => inspectSource("const columns: TableColumnsType<Row> = [];", filename).filter((issue) => issue.message.includes("columns.tsx"));
  assert.equal(columnsIssues("/src/pages/Demo/index.tsx").length, 1);
  assert.deepEqual(columnsIssues("/src/pages/Demo/columns.tsx"), []);
  // 状态标签写状态不写动作
  const statusIssues = (code) => inspectSource(code, "/src/pages/Demo/columns.tsx").filter((issue) => issue.message.includes("状态标签"));
  assert.equal(statusIssues('const x = <StatusTag tone="success">{t("common.actions.enable")}</StatusTag>;').length, 1);
  assert.deepEqual(statusIssues('const x = <StatusTag tone="success">{t("common.vocab.enabled")}</StatusTag>;'), []);
  // 横向滚动槽位单一来源：清单与样式逐条一致，组件样式不得自写 data-overflowing 规则
  const slotsSource = { filename: "overflowSlots.ts", source: 'export const SCROLL_SLOTS = [\n  ".a",\n  ".b > td",\n] as const;' };
  const slotCss = (base, marked) => ({ filename: "overflowScroll.css", source: `${base} { overflow-x: hidden; }\n${marked} { overflow-x: auto; }` });
  const detailSelector = ".ds-information-grid__field > dd";
  assert.equal(inspectScrollSlots({ slotsSource: { filename: "overflowSlots.ts", source: `export const SCROLL_SLOTS = [${JSON.stringify(detailSelector)}] as const;` }, cssSource: slotCss(detailSelector, `${detailSelector}[data-overflowing="true"]`) }).filter(issue => issue.rule === "FRONTEND-LAYOUT").length, 1);
  assert.deepEqual(inspectScrollSlots({ slotsSource, cssSource: slotCss(".a,\n.b > td", '.a[data-overflowing="true"], .b > td[data-overflowing="true"]') }), []);
  const attributeSlots = { filename: "overflowSlots.ts", source: `export const SCROLL_SLOTS = ['.x[data-variant="name"]', ".b > td"] as const;` };
  assert.deepEqual(inspectScrollSlots({ slotsSource: attributeSlots, cssSource: slotCss('.x[data-variant="name"], .b > td', '.x[data-variant="name"][data-overflowing="true"], .b > td[data-overflowing="true"]') }), []);
  assert.equal(inspectScrollSlots({ slotsSource: attributeSlots, cssSource: slotCss('.x[data-variant="name"], .b > td', '.b > td[data-overflowing="true"]') }).length, 1);
  assert.equal(inspectScrollSlots({ slotsSource, cssSource: slotCss(".a", '.a[data-overflowing="true"], .b > td[data-overflowing="true"]') }).length, 1);
  assert.equal(inspectScrollSlots({ slotsSource, cssSource: slotCss(".a, .b > td", '.a[data-overflowing="true"]') }).length, 1);
  assert.equal(inspectCss('.x[data-overflowing="true"] { overflow-x: auto; }', { filename: "/src/components/ui/X.css" }).filter((issue) => issue.message.includes("overflowSlots")).length, 1);
  assert.deepEqual(inspectCss('.x[data-overflowing="true"] { overflow-x: auto; }', { filename: "/src/components/ui/overflowScroll.css" }).filter((issue) => issue.message.includes("overflowSlots")), []);
  // 过长单项统一单行滚动：断词折行只允许在注明“正文折行”的规则里
  const wrapIssues = (css) => inspectCss(css, { filename: "/src/pages/X/style.css" }).filter((issue) => issue.message.includes("正文折行"));
  assert.equal(wrapIssues(".name { overflow-wrap: anywhere; }").length, 1);
  assert.equal(wrapIssues(".name { word-break: break-all; }").length, 1);
  assert.deepEqual(wrapIssues(".hint {\n  /* 正文折行：提示是句子 */\n  overflow-wrap: anywhere;\n}"), []);
  const panelIssues = (css) => inspectCss(css, { filename: "/src/components/ui/Panel.css" }).filter((issue) => issue.message.includes("切割面板"));
  assert.equal(panelIssues(".ds-panel{display:grid;gap:var(--ds-space-2);border:var(--ant-line-width) solid var(--ds-color-border);border-radius:var(--ds-radius-lg);background:var(--ds-color-border);}").length, 2);
  assert.deepEqual(panelIssues(".ds-panel{display:grid;gap:var(--ant-line-width);overflow:clip;border:var(--ant-line-width) solid var(--ds-color-border);border-radius:var(--ds-radius-lg);background:var(--ds-color-border);}"), []);
  assert.deepEqual(panelIssues(".ds-panel{display:grid;gap:var(--ds-space-16);background:var(--ds-color-surface);}"), []);
});

test("业务层 Col 固定 span 被拒绝，响应式列宽与整行不误判", () => {
  const colIssues = (source) => inspect(source).filter((issue) => issue.message.includes("响应式列宽"));
  assert.notEqual(colIssues('import {Col} from "antd"; <Col span={12}>x</Col>').length, 0);
  assert.notEqual(colIssues('import {Col} from "antd"; <Col span={8} style={{ textAlign: "right" }}>x</Col>').length, 0);
  assert.deepEqual(colIssues('import {Col} from "antd"; <Col span={24}>x</Col>'), []);
  assert.deepEqual(colIssues('import {Col} from "antd"; <Col xs={24} md={12}>x</Col>'), []);
  assert.deepEqual(colIssues('import {Col} from "antd"; <Col flex="auto">x</Col>'), []);
});

test("卡片/图表并排只用 ResponsiveGrid：Col 响应式列包卡片被拒绝，容器查询只属于共享层", () => {
  const gridIssues = (source) => inspect(source).filter((issue) => issue.message.includes("ResponsiveGrid"));
  assert.notEqual(gridIssues('import {Col, Card} from "antd"; <Col xs={24} lg={8}><Card>x</Card></Col>').length, 0);
  assert.notEqual(gridIssues('import {Col} from "antd"; import ChartCard from "./ChartCard"; <Col xs={24} xl={16}><ChartCard title="t">x</ChartCard></Col>').length, 0);
  assert.deepEqual(gridIssues('import {Col, Card} from "antd"; <Col span={24}><Card>x</Card></Col>'), []);
  assert.deepEqual(gridIssues('import {Col, Form} from "antd"; <Col xs={24} md={12}><Form.Item label="a">x</Form.Item></Col>'), []);
  const cssIssues = (filename) => inspectCss("@container (min-width: 536px) { .x { display: grid; } }", { filename }).filter((issue) => issue.message.includes("@container"));
  assert.notEqual(cssIssues("/repo/src/pages/X/index.css").length, 0);
  assert.deepEqual(cssIssues("/repo/src/components/ui/ResponsiveGrid.css"), []);
  assert.deepEqual(cssIssues("src/components/ui/SummaryStrip.css"), []);
  assert.notEqual(cssIssues("src/pages/X/index.css").length, 0);
});

test("禁止卡片套卡片与卡片只包一层切换控件，浮层内的卡片不计入", () => {
  const boxIssues = (source) => inspect(source).filter((issue) => /套卡片|choice-group 外框/.test(issue.message));
  assert.notEqual(boxIssues('import {Card} from "antd"; <Card title="外"><Card size="small">内</Card></Card>').length, 0);
  assert.notEqual(boxIssues('import {Card} from "antd"; import {ViewSwitch} from "@/components/ui"; <Card><ViewSwitch value={v} onChange={set} options={options} /></Card>').length, 0);
  assert.deepEqual(boxIssues('import {Card, Modal} from "antd"; <Card title="外"><Modal open><Card>浮层内</Card></Modal></Card>'), []);
  assert.deepEqual(boxIssues('import {Card} from "antd"; import {ResponsiveTabs, SectionHeader} from "@/components/ui"; <Card title="外"><SectionHeader title="内" headingLevel={3} /><ResponsiveTabs items={items} /></Card>'), []);
  assert.deepEqual(boxIssues('import {Card} from "antd"; import {SummaryStrip} from "@/components/ui"; <Card title="外"><SummaryStrip label="x" items={items} /></Card>'), []);
  // line 页签无外框：卡片只包 ResponsiveTabs 正是"页签放进所属卡片"的目标形态
  assert.deepEqual(boxIssues('import {Card} from "antd"; import {ResponsiveTabs} from "@/components/ui"; <Card size="small"><Row><Col><ResponsiveTabs items={items} variant="navigation-only" /></Col></Row></Card>'), []);
});

test("取值单选按钮组允许默认描边样式，buttonStyle 被拒绝而普通单选不误判", () => {
  const radioIssues = (source, filename) => inspect(source, filename).filter((issue) => issue.message.includes("buttonStyle"));
  assert.notEqual(radioIssues('import {Radio} from "antd"; <Radio.Group buttonStyle="solid" options={options} />').length, 0);
  assert.notEqual(radioIssues('import {Radio} from "antd"; <Radio.Group optionType="button" buttonStyle="solid" options={options} />').length, 0);
  assert.deepEqual(radioIssues('import {Radio} from "antd"; <Radio.Group optionType="button" options={options} />'), []);
  assert.deepEqual(radioIssues('import {Radio} from "antd"; <Radio.Group value={v}><Radio.Button value="a">A</Radio.Button></Radio.Group>'), []);
  assert.deepEqual(radioIssues('import {Radio} from "antd"; <Radio.Group options={options} />'), []);
  assert.deepEqual(radioIssues('import {Radio} from "antd"; <Radio value="a">A</Radio>'), []);
  assert.deepEqual(radioIssues('import {ViewSwitch} from "@/components/ui"; <ViewSwitch value={v} onChange={set} options={options} />'), []);
});

test("加载态统一 Spin 共享组件，骨架屏 Skeleton 在任何层都被拒绝", () => {
  const skeletonIssues = (source, filename) => inspect(source, filename).filter((issue) => issue.message.includes("骨架屏"));
  assert.notEqual(skeletonIssues('import {Skeleton} from "antd"; <Skeleton active />').length, 0);
  assert.notEqual(skeletonIssues('import {Skeleton} from "antd"; <Skeleton.Button active size="small" />').length, 0);
  assert.notEqual(skeletonIssues('import * as Ant from "antd"; <Ant.Skeleton />').length, 0);
  assert.notEqual(skeletonIssues('import {Skeleton} from "antd"; <Skeleton />', "/src/components/ui/Feedback.tsx").length, 0);
  assert.deepEqual(skeletonIssues('import {LoadingState, LoadingOverlay} from "@/components/ui"; <LoadingOverlay loading={loading} label={label}><LoadingState label={label} /></LoadingOverlay>'), []);
});

test("Cron 校验和描述只有 cronCycle utility 一个入口", () => {
  assert.notEqual(inspect('import cronstrue from "cronstrue"; cronstrue.toString(value)').length, 0);
  assert.notEqual(inspect('import cron from "cronstrue/i18n"; cron.toString(value)').length, 0);
  assert.notEqual(inspect('import {CronExpressionParser} from "cron-parser"; CronExpressionParser.parse(value)').length, 0);
  assert.notEqual(inspect('const parseCronExpression=(value)=>value.trim().split(/\\s+/).length===5').length, 0);
  assert.notEqual(inspect('function validateCron(value){return /^x$/.test(value)}').length, 0);
  assert.deepEqual(inspect('import {describeCronCycle,validateCronCycle} from "@/utils/cronCycle"; validateCronCycle(value); describeCronCycle(value,"zh-CN")'), []);
  assert.deepEqual(inspect('const cronDescription=record.cronCycle; <span>{cronDescription}</span>'), []);
  assert.deepEqual(inspect('import cronstrue from "cronstrue"; import {CronExpressionParser} from "cron-parser";', "/src/utils/cronCycle.ts"), []);
});

test("可排序的卡片项由 SortableList variant=card 给出，项里不再套 Card", () => {
  assert.notEqual(inspect('import { Card } from "antd"; import { SortableList } from "@/components/ui"; <SortableList items={a} renderItem={(item) => <Card>{item}</Card>} />', "/src/pages/A/index.tsx").length, 0);
  assert.notEqual(inspect('import { SortableList } from "@/components/ui"; <SortableList variant="card" items={a} renderItem={(item) => <span>{item}</span>} />', "/src/pages/A/index.tsx").length, 0);
  assert.deepEqual(inspect('import { SortableList } from "@/components/ui"; <SortableList variant="card" items={a} renderItem={(item, index, handle) => <span>{handle}{item}</span>} />', "/src/pages/A/index.tsx"), []);
});

test("编辑已有对象的页面给出对象名，面包屑上一级显示名字并可点回详情", () => {
  assert.notEqual(inspect('import { EntityEditPage } from "@/components/ui"; <EntityEditPage backTo="/a" query={q} saveBar={b}>x</EntityEditPage>', "/src/pages/A/index.tsx").length, 0);
  assert.deepEqual(inspect('import { EntityEditPage } from "@/components/ui"; <EntityEditPage objectName={name} backTo="/a" query={q} saveBar={b}>x</EntityEditPage>', "/src/pages/A/index.tsx"), []);
  assert.deepEqual(inspect('import { EntityEditPage } from "@/components/ui"; <EntityEditPage backTo="/a" saveBar={b}>x</EntityEditPage>', "/src/pages/A/index.tsx"), []);
});

test("表单字段并排只用 FormGrid，不用 Row / Col", () => {
  assert.notEqual(inspect('import { Col, Form, Input, Row } from "antd"; <Row><Col xs={24} md={12}><Form.Item name="a"><Input allowClear /></Form.Item></Col></Row>').length, 0);
  assert.notEqual(inspect('import * as Ant from "antd"; <Ant.Row><Ant.Col xs={24}><Ant.Form.Item name="a"><Ant.Input allowClear /></Ant.Form.Item></Ant.Col></Ant.Row>').length, 0);
  assert.deepEqual(inspect('import { Form, Input } from "antd"; import { FormGrid } from "@/components/ui"; <FormGrid><Form.Item name="a"><Input allowClear /></Form.Item></FormGrid>'), []);
});

test("只有一个候选项的下拉菜单直接做成按钮", () => {
  assert.notEqual(inspect('import { Dropdown } from "antd"; const menu = { items: [{ key: "link", label: "链接" }], onClick: () => {} }; <Dropdown menu={menu} />').length, 0);
  assert.notEqual(inspect('import { Dropdown } from "antd"; <Dropdown menu={{ items: [{ key: "link", label: "链接" }] }} />').length, 0);
  assert.deepEqual(inspect('import { Dropdown } from "antd"; <Dropdown menu={{ items: [{ key: "a", label: "甲" }, { key: "b", label: "乙" }] }} />'), []);
  assert.deepEqual(inspect('import { Dropdown } from "antd"; <Dropdown menu={{ items: [...extra] }} />'), []);
});

test("Ant Design 已弃用的业务组件 API 不得重新引入", () => {
  assert.notEqual(inspect('import { Alert as Notice } from "antd"; <Notice message="失败" />').length, 0);
  assert.notEqual(inspect('import { Drawer as Panel } from "antd"; <Panel width={480} />').length, 0);
  assert.notEqual(inspect('import { Space as Stack } from "antd"; <Stack direction="vertical" />').length, 0);
  assert.notEqual(inspect('import { Form as Fields, Input } from "antd"; <Fields.Item name="value"><span>说明</span><Input allowClear /></Fields.Item>').length, 0);
  assert.notEqual(inspect('import * as Ant from "antd"; <Ant.Form.Item name="value"><><Ant.Input allowClear /></></Ant.Form.Item>').length, 0);
  assert.notEqual(inspect('import { Form } from "antd"; <Form.Item name="value"><div>自定义编辑器</div></Form.Item>').length, 0);
  assert.notEqual(inspect('import { Dropdown as Menu } from "antd"; <Menu.Button>更多</Menu.Button>').length, 0);
  assert.notEqual(inspect('import * as Ant from "antd"; <Ant.Dropdown.Button>更多</Ant.Dropdown.Button>').length, 0);
  assert.notEqual(inspect('import { Modal as Dialog } from "antd"; <Dialog destroyOnClose />').length, 0);
  assert.notEqual(inspect('import { Card as Panel } from "antd"; const legacy={bordered:false}; <Panel {...legacy} />').length, 0);
  assert.notEqual(inspect('import { ModalForm as DialogForm } from "@/components/ui"; const modalProps={destroyOnClose:true}; <DialogForm modalProps={modalProps} />').length, 0);
  assert.deepEqual(inspect('import { ModalForm } from "@/components/ui"; <ModalForm open modalProps={{destroyOnHidden:true}} />'), []);
  assert.notEqual(inspect('import { DrawerForm as SharedDrawerForm } from "@/components/ui"; <SharedDrawerForm width={520} />').length, 0);
  assert.notEqual(inspect('import * as UI from "@/components/ui"; const legacy={width:520}; <UI.DrawerForm {...legacy} />').length, 0);
  assert.notEqual(inspect('import { Space as Stack } from "antd"; const legacy={direction:"vertical"}; <Stack {...legacy} />').length, 0);
  assert.notEqual(inspect('import { Space as Stack } from "antd"; <Stack orientation="vertical" {...runtimeProps} />').length, 0);
  assert.notEqual(inspect('import { Space as Stack } from "antd"; const layout={size:12}; <Stack {...layout} />').length, 0);
  assert.notEqual(inspect('import { Space as Stack } from "antd"; <Stack size={designTokens.space.sm} {...runtimeProps} />').length, 0);
  assert.notEqual(inspect('import { Card } from "antd"; <Card variant="borderless" {...runtimeProps} />').length, 0);
  assert.notEqual(inspect('import { Tag as Label } from "antd"; const legacy={bordered:false}; <Label {...legacy} />', "/src/components/ui/Example.tsx").length, 0);
  assert.notEqual(inspect('import * as Ant from "antd"; <Ant.Tag bordered={false}>状态</Ant.Tag>', "/src/components/ui/Example.tsx").length, 0);
  assert.notEqual(inspect('import { StatusTag as State } from "@/components/ui"; const legacy={bordered:false}; <State {...legacy} tone="success" />').length, 0);
  assert.notEqual(inspect('import { MetadataTag } from "@/components/ui"; <MetadataTag variant="filled" {...runtimeProps} />').length, 0);
  assert.notEqual(inspect('import { Space as Stack } from "antd"; <Stack {...runtimeProps} orientation="vertical" />').length, 0);
  assert.notEqual(inspect('import { Space as Stack } from "antd"; const layout={size:designTokens.space.sm}; <Stack {...layout} />').length, 0);
  assert.deepEqual(inspect('import { StatusTag } from "@/components/ui"; <StatusTag tone="success" variant="filled">启用</StatusTag>'), []);
  assert.deepEqual(inspect('import { Tag } from "antd"; <Tag variant="filled">类型</Tag>', "/src/components/ui/Example.tsx"), []);
  assert.deepEqual(inspect('const DrawerForm=(props)=><section />; <DrawerForm width={520} />'), []);
  assert.deepEqual(inspect('import {DrawerForm as SharedDrawerForm} from "@/components/ui"; function View(){const SharedDrawerForm=(props)=><section />; return <SharedDrawerForm width={520} />}'), []);
  assert.deepEqual(inspect('import { Alert, Button, Card, Drawer, Dropdown, Form, Input, Modal, Space } from "antd"; <><Alert title="失败" /><Drawer size="large" /><Modal destroyOnHidden /><Card variant="borderless" /><Form.Item name="value"><Input allowClear /></Form.Item><Space orientation="vertical" /><Space.Compact><Dropdown menu={menu}><Button icon={<PlusOutlined />}>更多</Button></Dropdown></Space.Compact></>'), []);
});

test("业务层禁止 Alert type=error：错误展示统一 QueryErrorAlert 或 notifyActionFailed", () => {
  for (const text of [
    'import { Alert } from "antd"; <Alert type="error" title="失败" />',
    'import { Alert as Notice } from "antd"; <Notice type="error" showIcon title={label} />',
    'import * as Ant from "antd"; <Ant.Alert type="error" />',
  ]) assert.notEqual(inspect(text).length, 0);
  // 共享实现内部允许（QueryErrorAlert 的 banner 形态就是 Alert type="error"）
  assert.deepEqual(inspect('import { Alert } from "antd"; <Alert type="error" title={message} />', "/src/components/ui/Feedback.tsx"), []);
  // info/warning 的常驻说明不受限制
  assert.deepEqual(inspect('import { Alert } from "antd"; <Alert type="warning" showIcon title={hint} />'), []);
});

test("受控公共 named import 不能被嵌套声明遮蔽", () => {
  for (const text of [
    'import {designTokens as tokens} from "@/design/tokens"; function render(tokens){return {fontFamily:tokens.font.mono}}',
    'import {buildTablePagination as pagination} from "@/components/ui"; function render(){const pagination=()=>({});}',
    'import {columnWidth as widths} from "@/components/ui"; function render(widths){return widths}',
    'import {columnWidth as widths} from "@/components/ui"; try {} catch (widths) {}',
    'import {tableScroll as scroll} from "@/components/ui"; function outer(){function scroll(){} return null}',
  ]) assert.notEqual(inspect(text).length, 0, text);
  assert.deepEqual(inspect('import {designTokens as tokens} from "@/design/tokens"; import {tableScroll as scroll} from "@/components/ui"; const other="safe"; const style={fontFamily:tokens.font.family}; void scroll; void other;'), []);
});

test("业务代码禁止一切 placeholder，控件配置对象同样受控，业务数据字段不误判", () => {
  const placeholderIssues = (source, filename = "/src/pages/Example.tsx") =>
    inspectSource(source, filename).filter((issue) => issue.message.includes("不使用 placeholder"));
  for (const source of [
    '<Input allowClear aria-label="姓名" placeholder="请输入姓名" />',
    '<Input allowClear aria-label="范围" placeholder="" />',
    '<Input allowClear aria-label="金额" placeholder={t("pages.users.amount")} />',
    'const cols=[a,b]; <Input allowClear aria-label="搜索" placeholder={cols.join("、")} />',
    '<JsonEditor placeholder={"{\\n  \\"key\\": 1}"} />',
    '<RangePicker placeholder={[start, end]} />',
  ]) assert.notEqual(placeholderIssues(source).length, 0, source);
  for (const source of [
    '<Input allowClear aria-label="姓名" />',
    '<Form.Item label="折扣" extra="0–1，例如 0.9 表示九折"><Input allowClear /></Form.Item>',
    'onChange({ ...config, placeholder: event.target.value })',
    'const question = { inputType: "text", placeholder: "" }; save(question)',
  ]) assert.deepEqual(placeholderIssues(source), [], source);
  assert.deepEqual(placeholderIssues('<Input {...inputProps} placeholder={hint} />', "/src/components/ui/SearchInput.tsx"), []);
});

test("复制统一走 CopyableValue/AtomicValue，禁止 Typography copyable 与直接访问剪贴板", () => {
  const copyIssues = (source, filename = "/src/pages/Example.tsx") =>
    inspectSource(source, filename).filter((issue) => /复制|剪贴板/.test(issue.message));
  for (const source of [
    'import { Typography } from "antd"; <Typography.Text copyable>{hash}</Typography.Text>',
    'import { Typography } from "antd"; const { Paragraph } = Typography; <Paragraph copyable={{ text: raw }}>{raw}</Paragraph>',
    'const onCopy = () => navigator.clipboard.writeText(value);',
  ]) assert.notEqual(copyIssues(source).length, 0, source);
  for (const source of [
    'import { AtomicValue } from "@/components/ui"; <AtomicValue text={record.identifier} copyable />',
    'import { CopyableValue } from "@/components/ui"; <CopyableValue text={raw} block><code>{raw}</code></CopyableValue>',
    'import { useCopyToClipboard } from "@/components/ui"; const { copy } = useCopyToClipboard(); void copy(name);',
  ]) assert.deepEqual(copyIssues(source), [], source);
  assert.deepEqual(copyIssues('await navigator.clipboard.writeText(text);', "/src/components/ui/useCopyToClipboard.ts"), []);
});

test("原生 title 不能替代统一 Tooltip 机制", () => {
  assert.notEqual(inspect('import {Button} from "antd"; <Button title="复制" icon={<CopyOutlined />} />').length, 0);
  assert.notEqual(inspect('<span title={fullValue}>{shortValue}</span>').length, 0);
  assert.deepEqual(inspect('import { Tooltip } from "@/components/ui"; <Tooltip title="说明"><Button icon={<PlusOutlined />}>查看</Button></Tooltip>', "/src/components/ui/Example.tsx"), []);
  assert.deepEqual(inspect('<Modal title="确认删除" />'), []);
  assert.deepEqual(inspect('<iframe title="预览" />'), []);
  assert.notEqual(inspect('import { Tooltip } from "@/components/ui"; <Tooltip title={items.map((item) => item.name).join(",")}><span>+3</span></Tooltip>', "/src/components/ui/Example.tsx").length, 0);
  assert.notEqual(inspect('import { Tooltip } from "@/components/ui"; <Tooltip title={<div><button>操作</button></div>}><span>详情</span></Tooltip>').length, 0);
  assert.deepEqual(inspect('import { Tooltip } from "@/components/ui"; <Tooltip title={t("copy")}><Button icon={<PlusOutlined />}>复制</Button></Tooltip>', "/src/components/ui/Example.tsx"), []);
});

test("业务层禁止 Ant 预设色板，颜色全部纳入双主题设计标度", () => {
  assert.notEqual(inspect('import {Button} from "antd"; <Button icon={<PlusOutlined />} color="cyan" variant="solid">启用</Button>').length, 0);
  assert.notEqual(inspect('import {Tag} from "antd"; <Tag color="geekblue">类型</Tag>').length, 0);
  assert.deepEqual(inspect('import {Button} from "antd"; <Button icon={<PlusOutlined />} variant="solid">启用</Button>'), []);
});

test("readCssColorToken 的运行时读取计为变量真实使用方", () => {
  const tokenSource = { filename: "src/design/tokens.css", source: tokenContractCss("  --ds-shadow-focus: 0 0 0 3px rgb(22 119 255 / 18%);") };
  assert.deepEqual(inspectVariableContract({
    tokenSource,
    consumers: [{ filename: "src/config/theme.ts", source: 'const x = { Input: { activeShadow: readCssColorToken("--ds-shadow-focus") } };' }],
  }), []);
  const unused = inspectVariableContract({
    tokenSource,
    consumers: [{ filename: "src/config/theme.ts", source: 'const x = readCssColorToken("--ds-shadow-raised");' }],
  });
  assert.ok(unused.some((issue) => issue.message.includes("--ds-shadow-focus") && issue.message.includes("没有真实使用方")));
});

test("图标动作和链接使用真实语义", () => {
  assert.notEqual(inspect('import { Button } from "antd"; import { CopyOutlined } from "@ant-design/icons"; <Button icon={<CopyOutlined />}></Button>').length, 0);
  assert.notEqual(inspect('import { CopyOutlined } from "@ant-design/icons"; import { Button as Action } from "antd"; <Action icon={<CopyOutlined />} />').length, 0);
  assert.notEqual(inspect('import * as Ant from "antd"; <Ant.Button type="link">详情</Ant.Button>').length, 0);
  assert.notEqual(inspect('import { Button } from "antd"; import { CopyOutlined } from "@ant-design/icons"; import { Tooltip } from "@/components/ui"; <Tooltip title="复制"><Button aria-labelledby="copy-label" icon={<CopyOutlined />} /></Tooltip>').length, 0);
  assert.deepEqual(inspect('import { CopyOutlined } from "@ant-design/icons"; import { IconButton } from "@/components/ui"; <IconButton label="复制" icon={<CopyOutlined />} />'), []);
  assert.deepEqual(inspect('import {Button} from "antd"; <Button icon={<CopyOutlined />}>复制</Button>'), []);
  assert.deepEqual(inspect('import {Button} from "antd"; <Button icon={<CopyOutlined />}><span>复制</span></Button>'), []);
  assert.notEqual(inspect('import {Button} from "antd"; <Button icon={<PlusOutlined />} type={"link"} onClick={open}>详情</Button>').length, 0);
  assert.deepEqual(inspect('import {Button} from "antd"; <Button icon={<PlusOutlined />} type="link" href="/details">详情</Button>'), []);
  assert.notEqual(inspect('<a onClick={open}>编辑</a>').length, 0);
  assert.deepEqual(inspect('<a href="/details">详情</a>'), []);
  assert.notEqual(inspect('import {Tag} from "antd"; <Tag color={tone}>启用</Tag>').length, 0);
});

test("IconButton 只生成可访问名称，不再弹操作提示", () => {
  const source = readFileSync(new URL("../src/components/ui/IconButton.tsx", import.meta.url), "utf8");
  assert.doesNotMatch(source, /<Tooltip/);
  assert.match(source, /<Button\s+\{\.\.\.buttonProps\}\s+aria-label=\{label\}/);
});

test("业务层禁止操作提示类 Tooltip；静态字段说明进 Form.Item tooltip 问号，extra 只留状态提示", () => {
  const tipIssues = (source, filename) => inspect(source, filename).filter((issue) => /操作提示类|不得常驻在 extra/.test(issue.message));
  assert.notEqual(tipIssues('import {Tooltip} from "antd"; <Tooltip title="导出会重新请求"><Button>导出</Button></Tooltip>').length, 0);
  assert.notEqual(tipIssues('import {Form} from "antd"; <Form.Item label="标识符" extra="唯一标识"><Input allowClear /></Form.Item>').length, 0);
  assert.notEqual(tipIssues('import {Form} from "antd"; <Form.Item label="标识符" extra={t("pages.x.hint")}><Input allowClear /></Form.Item>').length, 0);
  assert.deepEqual(tipIssues('import {Form} from "antd"; <Form.Item label="标识符" tooltip={t("pages.x.hint")}><Input allowClear /></Form.Item>'), []);
  assert.deepEqual(tipIssues('import {Form} from "antd"; <Form.Item label="池" extra={owner ? undefined : t("pages.x.fillOwnerFirst")}><Select /></Form.Item>'), []);
  assert.deepEqual(tipIssues('import {AtomicValue, HelpTip} from "@/components/ui"; <><AtomicValue text={hash} copyable /><HelpTip title={t("pages.x.hint")} /></>'), []);
  assert.deepEqual(tipIssues('import {Tooltip} from "antd"; <Tooltip title={copied}>x</Tooltip>', "/src/components/ui/CopyableValue.tsx"), []);
});

test("CSS/Less 使用语法树识别跨行声明、内部选择器和重要性", () => {
  for (const css of [".ant-btn { color: var(--color-text); }", ".x { padding:\n  16px; }", ".x { color: white; }", ".x { color: rebeccapurple; }", ".x { color: cyan; }", ".x { color: magenta; }", ".x { color: CanvasText; }", ".x { background: ButtonFace; }", ".x { color: lch(50% 20 30); }", ".x { border: 1px solid #fff; }", ".x { border-inline-start: 1px solid #fff; }", ".x { border-image: linear-gradient(#fff, #000) 1; }", ".x { mask-border-source: linear-gradient(cyan, magenta); }", ".x { -webkit-mask-image: linear-gradient(Canvas, CanvasText); }", ".x { column-rule: 1px solid #fff; }", ".x { text-emphasis: filled #fff; }", ".x { filter: drop-shadow(0 1px #fff); }", ".x { background: linear-gradient(#fff, transparent); }", ".x { background-image: linear-gradient(#fff, transparent); }", ".x { box-shadow: 0 1px 2px rgba(0,0,0,.2); }", ".x { opacity: 1 !important; }", ".x { font-family: Arial, sans-serif; }", ".x { font-family: Arial, var(--ds-font-family-body); }", ".x { font: italic var(--font-size) / 1.5 Arial, sans-serif; }", ".x { font: var(--font-size) Arial, var(--ds-font-family-body); }", ":root { --space-page: 16px; }", ":root { --brand: #fff; }", ".scope { --surface: rgb(1 2 3); }"]) assert.notEqual(inspectCss(css).length, 0, css);
  assert.deepEqual(inspectCss(".x { gap: var(--space-16); color: var(--color-text); font-family: var(--ds-font-family-body); transform: translateY(-1px); } .code { font: italic var(--font-size) / 1.5 var(--ds-font-family-code); }"), []);
  assert.notEqual(inspectCss(":root { --chart-series: var(--ds-color-data-1); }").length, 0);
  for (const css of [
    ".x { --g: 13px; gap: var(--g); }",
    ".x { --g: 13px; gap: calc(var(--g) * 2); }",
    ".x { --base: 13px; --g: var(--base); gap: var(--g); }",
    ".x { --g: var(--ds-space-8); gap: var(--g); }",
    ".x { --surface: var(--ant-color-bg-container); background: var(--surface); }",
  ]) assert.notEqual(inspectCss(css).length, 0, css);
  assert.deepEqual(inspectCss(".x { --progress: 50%; transform: scaleX(var(--progress)); gap: var(--runtime-gap); color: var(--ant-color-text); }"), []);
  assert.deepEqual(inspectCss(".x { color: currentColor; background: transparent; border-color: transparent; }"), []);
  assert.deepEqual(inspectCss('.x { color: var(--canvas); background: url("/assets/menu/canvas.svg"); }'), []);
  assert.match(inspectCss(".x { gap: 16px; }", { filename: "style.less" })[0].message, /Less/);
  assert.deepEqual(inspectCss(":root { --space-page: 16px; --color-text: #111; }", { tokenSource: true }), []);
});

test("token 源里的上下文规则（反色表面改绑语义色）算作变量的真实使用方", () => {
  const tokenSource = { filename: "/src/design/tokens.css", source: ':root { color-scheme: light; --ds-color-success: #217a4b; --ds-color-success-on-inverse: #65d697; }\n:root[data-theme="dark"] { color-scheme: dark; --ds-color-success: #65d697; --ds-color-success-on-inverse: #217a4b; }\n[data-surface="inverse"] { --ds-color-success: var(--ds-color-success-on-inverse); }' };
  const consumers = [
    { filename: "/src/main.tsx", source: 'import "./design/tokens.css";' },
    { filename: "/src/components/ui/X.css", source: ".x { color: var(--ds-color-success); }" },
  ];
  assert.deepEqual(inspectCssVariableContract({ tokenSource, consumers }).filter((issue) => issue.message.includes("没有真实使用方")), []);
});

test("--ds CSS 变量引用与 token 源发布双向一致", () => {
  const tokenSource = {
    filename: "src/design/tokens.css",
    source: tokenContractCss("  --ds-space-8: 8px;\n  --ds-color-text: #111;"),
  };
  assert.deepEqual(inspectVariableContract({
    tokenSource,
    consumers: [
      { filename: "src/a.css", source: ".a{gap:var(--ds-space-8)}" },
      { filename: "src/b.tsx", source: 'const style={color:"var(--ds-color-text)"}' },
    ],
  }), []);
  const missing = inspectVariableContract({
    tokenSource,
    consumers: [
      { filename: "src/a.css", source: ".a{gap:calc(var(--ds-space-12) * 2)}" },
      { filename: "src/b.tsx", source: 'const style={color:`var(--ds-color-link)`}' },
      { filename: "src/c.ts", source: 'getComputedStyle(root).getPropertyValue("--ds-runtime-missing")' },
    ],
  });
  assert.ok(missing.some((issue) => issue.filename === "src/a.css" && issue.message.includes("--ds-space-12") && issue.message.includes("未由")));
  assert.ok(missing.some((issue) => issue.filename === "src/b.tsx" && issue.message.includes("--ds-color-link") && issue.message.includes("未由")));
  assert.ok(missing.some((issue) => issue.filename === "src/c.ts" && issue.message.includes("--ds-runtime-missing") && issue.message.includes("未由")));
  assert.ok(missing.some((issue) => issue.filename === "src/design/tokens.css" && issue.message.includes("没有真实使用方")));
  const singleVarSource = {
    filename: "src/design/tokens.css",
    source: tokenContractCss("  --ds-space-8: 8px;"),
  };
  assert.deepEqual(inspectVariableContract({
    tokenSource: singleVarSource,
    consumers: [{ filename: "src/a.css", source: "/* var(--ds-missing) */ .a{gap:var(--ds-space-8)}" }],
  }), []);
  const fakeUse = inspectVariableContract({
    tokenSource: singleVarSource,
    consumers: [{ filename: "src/a.ts", source: 'const fake="--ds-space-8"' }],
  });
  assert.ok(fakeUse.some((issue) => issue.message.includes("没有真实使用方")));
  const privatePublish = inspectVariableContract({
    tokenSource: singleVarSource,
    consumers: [{ filename: "src/a.ts", source: 'root.style.setProperty("--ds-space-8", value); const css="var(--ds-space-8)"' }],
  });
  assert.ok(privatePublish.some((issue) => issue.filename === "src/a.ts" && issue.message.includes("只能由")));
});

test("CSS-in-JS 内部选择器、私有截断和裸 Ant 间距不能绕过统一机制", () => {
  assert.notEqual(inspect('const useStyles=createStyles({ root: { "& .ant-card-body": { padding: token.padding } } })').length, 0);
  assert.notEqual(inspect("const styles={textOverflow:'ellipsis'}").length, 0);
  assert.notEqual(inspect("const column={ellipsis:true}").length, 0);
  assert.notEqual(inspect("<Typography.Text ellipsis>{name}</Typography.Text>").length, 0);
  assert.notEqual(inspect('import { Space as Stack } from "antd"; <Stack size={12} />').length, 0);
  assert.notEqual(inspect('import { Space } from "antd"; <Space direction="vertical" />').length, 0);
  assert.notEqual(inspect('import { Space as Stack } from "antd"; <Stack direction="vertical" />').length, 0);
  assert.deepEqual(inspect('import { Space } from "antd"; <Space orientation="vertical" />'), []);
  assert.deepEqual(inspect('<CustomStack direction="vertical" />'), []);
  assert.deepEqual(inspect('import { Row } from "antd"; <Row gutter={designTokens.space.lg} />'), []);
  assert.ok(inspect('import { Row } from "antd"; <Row gutter={designTokens.space.md} />').some((i) => i.message.includes("四档角色间距")));
  assert.notEqual(inspectCss(".name { text-overflow: ellipsis; }", { filename: "src/pages/name.css" }).length, 0);
  // 共享层也不再省略：过长内容一律左右滚动
  assert.notEqual(inspectCss(".ds-atomic-value { text-overflow: ellipsis; }", { filename: "src/components/ui/AtomicValue.css" }).length, 0);
});

test("页面根不裁切横向溢出，DOM 高度使用动态视口单位", () => {
  assert.notEqual(inspectCss("html, body, #root { overflow-x: hidden; }", { filename: "src/global.css" }).length, 0);
  assert.notEqual(inspectCss(".ds-page-root { overflow: clip; }", { filename: "src/components/ui/AppPage.css" }).length, 0);
  assert.deepEqual(inspectCss(".code { overflow-x: auto; } body { overflow-x: auto; }"), []);
  assert.deepEqual(inspectCss(".thumbnail { overflow: hidden; }"), []);
  assert.notEqual(inspect('<div style={{height:"80vh"}} />').length, 0);
  assert.notEqual(inspect('<Modal styles={{body:{maxHeight:"calc(100vh - 48px)"}}} />').length, 0);
  assert.deepEqual(inspect('<div style={{height:"80dvh",width:"90vw"}} />'), []);
  assert.deepEqual(inspect('const announcementConfig={height:"85vh"}'), []);
});

test("CSS 断点三档与类名前缀所有权", () => {
  assert.deepEqual(inspectCss("@media (max-width: 480px) { .x { display: none; } }", { filename: "src/pages/x.css" }), []);
  assert.deepEqual(inspectCss("@media (min-width: 768px) { .x { display: none; } }", { filename: "src/pages/x.css" }), []);
  assert.deepEqual(inspectCss("@media (prefers-reduced-motion: reduce) { .x { animation: none; } }", { filename: "src/global.css" }), []);
  assert.notEqual(inspectCss("@media (max-width: 600px) { .x { display: none; } }", { filename: "src/pages/x.css" }).length, 0);
  assert.deepEqual(inspectCss(".ds-brand-header { color: var(--ds-color-text); }", { filename: "src/layouts/BasicLayout.css" }), []);
  assert.notEqual(inspectCss(".brand-header { color: var(--ds-color-text); }", { filename: "src/layouts/BasicLayout.css" }).length, 0);
  assert.deepEqual(inspectCss(".kpi-cards { display: grid; }", { filename: "src/pages/OverviewPage/components/StatsCards.css" }), []);
  assert.notEqual(inspectCss(".ds-kpi-cards { display: grid; }", { filename: "src/pages/OverviewPage/components/StatsCards.css" }).length, 0);
});

test("页面间距由布局契约管理，拒绝负 margin 一元表达式", () => {
  assert.notEqual(inspect("const styles={marginBottom:-designTokens.space.lg}").length, 0);
  assert.notEqual(inspect("const styles={margin:compact ? -space.sm : space.md}").length, 0);
  assert.notEqual(inspect("<Box marginTop={-designTokens.space.sm} />").length, 0);
  assert.notEqual(inspectCss(".x { margin-inline: calc(-1 * var(--ds-space-8)); }").length, 0);
  assert.notEqual(inspectCss(".x { margin: calc(100% - var(--ds-space-8)); }").length, 0);
  assert.deepEqual(inspect("const styles={paddingBottom:designTokens.space.lg,transform:'translateY(-1px)'}"), []);
  assert.deepEqual(inspectCss(".x { padding: var(--ds-space-8); transform: translateY(-1px); }"), []);
});

test("间隔只由容器 gap 表达：业务层禁止 margin（清零除外），gap/Space/Row 只取四档角色间距", () => {
  const business = (text) => inspectSource(text, "/src/pages/X/Y.tsx");
  assert.ok(business('const el = <div style={{ marginBottom: designTokens.space.lg }} />;').some((i) => i.message.includes("禁止用 margin")));
  assert.deepEqual(business('const el = <p style={{ margin: 0 }} />;').filter((i) => i.message.includes("禁止用 margin")), []);
  assert.deepEqual(inspectSource('const el = <div style={{ marginBottom: designTokens.space.lg }} />;', "/src/components/ui/X.tsx").filter((i) => i.message.includes("禁止用 margin")), []);
  assert.ok(business('const el = <div style={{ gap: designTokens.space.md }} />;').some((i) => i.message.includes("四档角色间距")));
  assert.deepEqual(business('const el = <div style={{ gap: designTokens.space.sm }} />;').filter((i) => i.message.includes("四档角色间距")), []);
  assert.ok(inspectCss(".x { margin-top: var(--ds-space-8); }", { filename: "src/pages/X/y.css" }).some((i) => i.message.includes("禁止用 margin")));
  assert.deepEqual(inspectCss(".x { margin: 0 auto; gap: var(--ds-space-8); }", { filename: "src/pages/X/y.css" }).filter((i) => i.message.includes("margin") || i.message.includes("gap")), []);
  assert.ok(inspectCss(".x { gap: var(--ds-space-12); }", { filename: "src/pages/X/y.css" }).some((i) => i.message.includes("四档角色间距")));
  assert.deepEqual(inspectCss(".ds-prose p { margin: var(--ds-space-8) 0; }", { filename: "src/components/ui/prose.css" }).filter((i) => i.message.includes("margin")), []);
});

test("页面表格统一使用共享 Table：不直用 Ant Table，不自设 scroll/tableLayout，分页走 buildTablePagination", () => {
  assert.ok(inspect('import { Table } from "antd"; <Table columns={columns} />').some((i) => i.message.includes("共享 Table")));
  assert.ok(inspect('import { Table } from "@/components/ui"; <Table columns={columns} pagination={false} scroll={{ x: 800 }} />').some((i) => i.message.includes("scroll")));
  assert.ok(inspect('import { Table } from "@/components/ui"; <Table columns={columns} pagination={false} tableLayout="auto" />').some((i) => i.message.includes("tableLayout")));
  assert.notEqual(inspect('import { Table } from "@/components/ui"; <Table columns={columns} pagination={{current,pageSize}} />').length, 0);
  assert.notEqual(inspect('import { Table, buildTablePagination } from "@/components/ui"; <Table columns={columns} pagination={buildTablePagination({pageSizeOptions:[5,10]})} />').length, 0);
  assert.notEqual(inspect('import { Table, buildTablePagination } from "@/components/ui"; <Table columns={columns} pagination={buildTablePagination(options)} />').length, 0);
  assert.notEqual(inspect('import { Table, buildTablePagination } from "@/components/ui"; <Table columns={columns} pagination={buildTablePagination({...state})} />').length, 0);
  assert.notEqual(inspect('import { Table, buildTablePagination } from "@/components/ui"; <Table columns={columns} pagination={buildTablePagination({current,foo})} />').length, 0);
  assert.notEqual(inspect('import { Table } from "@/components/ui"; const buildTablePagination=()=>({}); <Table columns={columns} pagination={buildTablePagination()} />').length, 0);
  assert.notEqual(inspect('import { Table, buildTablePagination } from "@/components/ui"; <Table columns={columns} pagination={buildTablePagination()} {...runtimeProps} />').length, 0);
  assert.deepEqual(inspect('import { Table, buildTablePagination } from "@/components/ui"; <Table columns={columns} scrollY={360} pagination={buildTablePagination({current,pageSize,total,onChange,onShowSizeChange,disabled})} />'), []);
  assert.deepEqual(inspect('import { Table } from "@/components/ui"; <Table columns={columns} pagination={false} order="given" />'), []);
});


test("DataTable.controller 只接受 useDataTable 的真实返回值", () => {
  const controllerIssues = (source) => inspect(source).filter((issue) => issue.message.includes("DataTable.controller") || issue.message.includes("受控 controller"));
  const setup = 'import {DataTable} from "@/components/ui"; import {useDataTable} from "@/hooks/useDataTable";';
  for (const source of [
    `${setup} const table=useDataTable({initialFilters:{},request}); <DataTable controller={table} columns={columns} rowKey="id" errorTitle="失败"/>`,
    `${setup} const table=useDataTable({initialFilters:{},request}); const alias=table; <DataTable controller={alias} columns={columns} rowKey="id" errorTitle="失败"/>`,
    `import {DataTable as Grid} from "@/components/ui"; import {useDataTable as useTable} from "@/hooks/useDataTable"; const table=useTable({initialFilters:{},request}); <Grid controller={table} columns={columns} rowKey="id" errorTitle="失败"/>`,
    `import * as UI from "@/components/ui"; import * as Hooks from "@/hooks/useDataTable"; const table=Hooks.useDataTable({initialFilters:{},request}); <UI.DataTable controller={table} columns={columns} rowKey="id" errorTitle="失败"/>`,
    `${setup} const table=useDataTable({initialFilters:{},request}); const reload=()=>void table.reload(); <DataTable controller={table} columns={columns} rowKey="id" errorTitle="失败"/>`,
    `${setup} import {usePageController} from "./usePageController"; const {table}=usePageController(); <DataTable controller={table} columns={columns} rowKey="id" errorTitle="失败"/>`,
  ]) assert.deepEqual(controllerIssues(source), [], source);
  for (const source of [
    `${setup} <DataTable columns={columns} rowKey="id" errorTitle="失败"/>`,
    `${setup} const table={rows:[],loading:false}; <DataTable controller={table} columns={columns} rowKey="id" errorTitle="失败"/>`,
    `${setup} function useDataTable(){return fake} const table=useDataTable(); <DataTable controller={table} columns={columns} rowKey="id" errorTitle="失败"/>`,
    `${setup} import {useAnalysisTable} from "./useAnalysisTable"; const table=useAnalysisTable(); <DataTable controller={table} columns={columns} rowKey="id" errorTitle="失败"/>`,
    `${setup} import {buildController} from "./controller"; const {table}=buildController(); <DataTable controller={table} columns={columns} rowKey="id" errorTitle="失败"/>`,
    `${setup} import {useSharedTable} from "@/hooks/useSharedTable"; const {table}=useSharedTable(); <DataTable controller={table} columns={columns} rowKey="id" errorTitle="失败"/>`,
    `${setup} const table=useDataTable({initialFilters:{},request}); table.rows=[]; <DataTable controller={table} columns={columns} rowKey="id" errorTitle="失败"/>`,
    `${setup} const table=useDataTable({initialFilters:{},request}); Object.assign(table,{rows:[]}); <DataTable controller={table} columns={columns} rowKey="id" errorTitle="失败"/>`,
    `${setup} const table=useDataTable({initialFilters:{},request}); <DataTable controller={table} {...runtimeProps} columns={columns} rowKey="id" errorTitle="失败"/>`,
    `${setup} let table=useDataTable({initialFilters:{},request}); <DataTable controller={table} columns={columns} rowKey="id" errorTitle="失败"/>`,
  ]) assert.notEqual(controllerIssues(source).length, 0, source);
  assert.deepEqual(controllerIssues(`const DataTable=(props)=><section/>; <DataTable controller={fake}/>`), []);
});

test("共享查询反馈组件只接收原始错误对象", () => {
  const feedbackIssues = (source) => inspect(source).filter((issue) => issue.message.includes("查询反馈 error") || issue.message.includes("业务层受控组件禁止 JSX spread"));
  for (const source of [
    'import {QueryFeedback as Feedback} from "@/components/ui"; <Feedback error={failure.message} />',
    'import * as UI from "@/components/ui"; <UI.QueryErrorAlert error={failure?.message} />',
    'import {QueryFeedback} from "@/components/ui"; <QueryFeedback error={failure["message"]} />',
    'import {QueryFeedback} from "@/components/ui"; const key="message"; <QueryFeedback error={failure[key]} />',
    'import {TableQueryBoundary} from "@/components/ui"; <TableQueryBoundary error="加载失败" />',
    'import {QueryFeedback} from "@/components/ui"; <QueryFeedback error={`加载失败: ${failure}`} />',
    'import {QueryFeedback} from "@/components/ui"; <QueryFeedback error={String(failure)} />',
    'import {QueryFeedback} from "@/components/ui"; <QueryFeedback error={failure.toString()} />',
    'import {QueryFeedback} from "@/components/ui"; <QueryFeedback error={JSON.stringify(failure)} />',
    'import {QueryFeedback} from "@/components/ui"; const text=failure.message; <QueryFeedback error={text} />',
    'import {QueryFeedback} from "@/components/ui"; const props={error:failure.message}; <QueryFeedback {...props} />',
    'import {QueryFeedback} from "@/components/ui"; import {useTranslation} from "react-i18next"; const {t:translate}=useTranslation(); <QueryFeedback error={translate("failed")} />',
    'import {QueryFeedback} from "@/components/ui"; import {extractRequestErrorMessage as format} from "@/utils/requestError"; <QueryFeedback error={format(failure,"失败")} />',
    'import {QueryFeedback} from "@/components/ui"; <QueryFeedback error={failure ? failure.message : "失败"} />',
    'import {QueryFeedback} from "@/components/ui"; function format(error){return error.message} <QueryFeedback error={format(failure)} />',
    'import {QueryFeedback} from "@/components/ui"; const format=(error)=>`失败: ${error}`; <QueryFeedback error={format(failure)} />',
    'import {QueryFeedback} from "@/components/ui"; <QueryFeedback error={((error)=>error.message)(failure)} />',
    'import {QueryFeedback} from "@/components/ui"; const identity=(value)=>value; <QueryFeedback error={identity(failure.message)} />',
    'import {QueryFeedback} from "@/components/ui"; const {message}=failure; <QueryFeedback error={message} />',
    'import {QueryFeedback} from "@/components/ui"; const {message:text}=failure; <QueryFeedback error={text} />',
    'import {QueryFeedback} from "@/components/ui"; const key="message"; const {[key]:text}=failure; <QueryFeedback error={text} />',
    'import {QueryFeedback} from "@/components/ui"; const base={error:failure.message}; const alias=base; const props={...alias}; <QueryFeedback {...props} />',
    'import {QueryFeedback} from "@/components/ui"; const helpers={format(error){return error.message}}; <QueryFeedback error={helpers.format(failure)} />',
    'import {QueryFeedback} from "@/components/ui"; const helpers={format:(error)=>error.message}; const alias=helpers; <QueryFeedback error={alias.format(failure)} />',
    'import {QueryFeedback} from "@/components/ui"; const helpers={format(error){return error.message}}; const {format}=helpers; <QueryFeedback error={format(failure)} />',
    'import {QueryFeedback} from "@/components/ui"; const build=(error)=>({error:error.message}); <QueryFeedback {...build(failure)} />',
    'import {QueryFeedback} from "@/components/ui"; function build(error){return {error:error.message}} const alias=build; <QueryFeedback {...alias(failure)} />',
    'import {QueryFeedback} from "@/components/ui"; const props={get error(){return failure.message}}; const alias=props; <QueryFeedback {...alias} />',
    'import {QueryFeedback} from "@/components/ui/index"; <QueryFeedback error={failure.message} />',
    'import {QueryFeedback} from "../components/ui"; <QueryFeedback error={failure.message} />',
    'import QueryFeedback from "../components/ui/QueryFeedback"; <QueryFeedback error={failure.message} />',
    'import {QueryFeedback} from "@/components/ui"; const props={}; props.error=failure.message; <QueryFeedback {...props} />',
    'import {QueryFeedback} from "@/components/ui"; const props={}; const alias=props; alias.error=failure.message; <QueryFeedback {...props} />',
    'import {QueryFeedback} from "@/components/ui"; const props={}; Object.assign(props,{error:failure.message}); <QueryFeedback {...props} />',
    'import {QueryFeedback} from "@/components/ui"; const props={}; Object.defineProperty(props,"error",{value:failure.message}); <QueryFeedback {...props} />',
    'import {QueryFeedback} from "@/components/ui"; const props={}; Object.defineProperty(props,"error",{get(){return failure.message}}); <QueryFeedback {...props} />',
    'import {QueryFeedback} from "@/components/ui"; const props={error:failure,...runtime,error:failure.message}; <QueryFeedback {...props} />',
    'import {QueryFeedback} from "@/components/ui"; const helpers={...runtime,format(error){return error.message}}; <QueryFeedback error={helpers.format(failure)} />',
    'import {QueryFeedback} from "@/components/ui"; <QueryFeedback error={failure.message.trim().replace("x","y").toUpperCase()} />',
    'import {QueryFeedback} from "@/components/ui"; <QueryFeedback error={[failure.message,"x"].join(":")} />',
    'import {QueryFeedback} from "@/components/ui"; import {normalizeFailure} from "@/domain/failure"; <QueryFeedback error={normalizeFailure(failure)} />',
    'import {QueryFeedback} from "@/components/ui"; const keepRaw=(error)=>error; <QueryFeedback error={keepRaw(failure)} />',
    'import {QueryFeedback} from "@/components/ui"; const wrap=(error)=>new Error(error.message); <QueryFeedback error={wrap(failure)} />',
    'import {QueryFeedback} from "@/components/ui"; const build=(error)=>({error}); <QueryFeedback {...build(failure)} />',
    'import {QueryFeedback} from "@/components/ui"; import {helpers} from "@/domain/failure"; <QueryFeedback error={helpers.format(failure)} />',
    'import {QueryFeedback} from "@/components/ui"; const text=failure.message; <QueryFeedback error={text} />',
    'import {QueryFeedback} from "@/components/ui"; const text=String(failure); <QueryFeedback error={text} />',
    'import {QueryFeedback} from "@/components/ui"; const text=`失败: ${failure}`; <QueryFeedback error={text} />',
  ]) assert.notEqual(feedbackIssues(source).length, 0, source);
  for (const source of [
    'import {QueryFeedback} from "@/components/ui"; <QueryFeedback error={failure} />',
    'import {QueryErrorAlert as Alert} from "@/components/ui"; <Alert error={state.error} />',
    'import * as UI from "@/components/ui"; <UI.TableQueryBoundary error={new Error("加载失败")} />',
    'import {QueryFeedback} from "@/components/ui"; import {useTranslation} from "react-i18next"; const {t}=useTranslation(); <QueryFeedback error={new Error(t("failed"))} />',
    'import {QueryFeedback} from "@/components/ui"; const raw=state.error; <QueryFeedback error={raw} />',
    'import {QueryFeedback} from "@/components/ui"; const raw=failure; <QueryFeedback error={raw} />',
    'import {QueryFeedback} from "@/components/ui"; function View(error){return <QueryFeedback error={error} />} ',
    'const QueryFeedback=(props)=><section/>; <QueryFeedback error={failure.message} />',
    'import {QueryFeedback} from "@/components/ui"; function View(QueryFeedback){return <QueryFeedback error={failure.message} />}',
  ]) assert.deepEqual(feedbackIssues(source), [], source);
  assert.notEqual(inspect('import {QueryFeedback} from "@/components/ui"; const props={error:failure}; Object.defineProperty(props,"error",{...runtime,value:failure.message}); <QueryFeedback {...props}/>', "/src/components/ui/Internal.tsx").filter((issue) => issue.message.includes("查询反馈 error")).length, 0);
  assert.deepEqual(inspect('import {QueryFeedback} from "@/components/ui"; const props={error:failure}; Object.defineProperty(props,"error",{value:failure.message,...runtime}); <QueryFeedback {...props}/>', "/src/components/ui/Internal.tsx").filter((issue) => issue.message.includes("查询反馈 error")), []);
});

test("ResponsiveTabs 从 items 结构推导导航模式，动态 items 必须显式约定", () => {
  assert.deepEqual(inspect('import {ResponsiveTabs as Tabs} from "@/components/ui"; <Tabs items={[{key:"a",label:"A"}]} />'), []);
  assert.deepEqual(inspect('import {ResponsiveTabs as Tabs} from "@/components/ui"; const items=[{key:"a",label:"A",children:<div />}]; <Tabs items={items} />'), []);
  assert.notEqual(inspect('import {ResponsiveTabs as Tabs} from "@/components/ui"; <Tabs items={[{key:"a",label:"A"}]} variant="default" />').length, 0);
  assert.notEqual(inspect('import {ResponsiveTabs as Tabs} from "@/components/ui"; <Tabs items={loadItems()} />').length, 0);
  assert.notEqual(inspect('import {ResponsiveTabs as Tabs} from "@/components/ui"; <Tabs items={loadItems()} variant={mode} />').length, 0);
  assert.deepEqual(inspect('import {ResponsiveTabs as Tabs} from "@/components/ui"; <Tabs items={loadItems()} variant="navigation-only" />'), []);
  assert.notEqual(inspect('import {ResponsiveTabs as Tabs} from "@/components/ui"; <Tabs {...props} />').length, 0);
  assert.notEqual(inspect('import {ResponsiveTabs as Tabs} from "@/components/ui"; <Tabs {...{items:loadItems()}} />').length, 0);
  assert.notEqual(inspect('import {ResponsiveTabs as Tabs} from "@/components/ui"; <Tabs {...props} variant="default" />').length, 0);
  assert.notEqual(inspect('import {ResponsiveTabs as Tabs} from "@/components/ui"; <Tabs {...{activeKey:"a"}} items={[{key:"a",label:"A",children:<div />}]} />').length, 0);
  assert.notEqual(inspect('import {ResponsiveTabs as Tabs} from "@/components/ui"; const items=[{key:"a",label:"A"}]; const props={items}; <Tabs {...props} />').length, 0);
});

test("专项依赖允许，第二通用组件体系拒绝", () => {
  assert.deepEqual(inspectDependencies({ antd: "6", echarts: "6", "@monaco-editor/react": "4" }), []);
  assert.deepEqual(inspectDependencies({ "@mui/material": "7", primereact: "10" }), ["@mui/material", "primereact"]);
  // Ant Design Pro 已整体退役：布局、页容器、表单壳全部由 components/ui 基于 antd 实现
  assert.deepEqual(inspectDependencies({ "@ant-design/pro-components": "2", "@ant-design/pro-layout": "7", "@ant-design/icons": "6" }), ["@ant-design/pro-components", "@ant-design/pro-layout"]);
});

test("唯一样式方案：同目录 CSS 允许，CSS-in-JS 与新预处理器依赖拒绝", () => {
  assert.deepEqual(inspectStyleDependencies({ antd: "6", classnames: "2", "@ant-design/icons": "6" }), []);
  assert.deepEqual(inspectStyleDependencies({ "antd-style": "4", "styled-components": "6", less: "4" }), ["antd-style", "styled-components", "less"]);
});

test("页面 JSON 编辑统一通过 JsonEditor，Monaco 运行时仅限共享组件内部", () => {
  const monacoIssues = (source, filename) => inspect(source, filename)
    .filter((issue) => issue.message.includes("Monaco 只能通过共享 JsonEditor"));
  for (const source of [
    'import Editor from "@monaco-editor/react"; <Editor defaultLanguage="json" options={{minimap:{enabled:false}}}/>',
    'import {loader as runtimeLoader} from "@monaco-editor/react"; runtimeLoader.init()',
    'import * as Monaco from "monaco-editor"; Monaco.editor.create(root)',
    'import worker from "monaco-editor/esm/vs/editor/editor.worker.js?worker"',
    'export {default as Editor} from "@monaco-editor/react"',
    'const loadEditor=()=>import("@monaco-editor/react")',
    'const Monaco=require("monaco-editor")',
  ]) assert.notEqual(monacoIssues(source).length, 0, source);

  assert.deepEqual(monacoIssues(
    'import {JsonEditor as Editor} from "@/components/JsonEditor"; <Editor value={json} onChange={setJson}/>',
  ), []);
  assert.deepEqual(monacoIssues(
    'const Editor=(props)=><textarea/>; <Editor value={json}/>',
  ), []);
  assert.deepEqual(monacoIssues(
    'import Editor, {loader} from "@monaco-editor/react"; import * as monaco from "monaco-editor"; loader.config({monaco});',
    "/src/components/JsonEditor/MonacoEditor.tsx",
  ), []);
});

test("危险操作统一写法、二次确认与统一确认标题", () => {
  const danger = (source) => inspect(source).filter((i) => i.message.includes("danger 布尔") || i.message.includes("忽略语义色"));
  assert.notEqual(danger('import {Button} from "antd"; <Button danger icon={<DeleteOutlined />}>删除</Button>').length, 0);
  assert.notEqual(danger('import {Button} from "antd"; <Button danger={flag} icon={<DeleteOutlined />}>删除</Button>').length, 0);
  assert.notEqual(danger('import {Button} from "antd"; <Button color="danger" icon={<DeleteOutlined />}>删除</Button>').length, 0);
  assert.notEqual(danger('import {Button} from "antd"; <Button color="danger" type="text" icon={<DeleteOutlined />}>删除</Button>').length, 0);
  assert.notEqual(danger('import {Button} from "antd"; <Button color="danger" variant="text" type="text" icon={<DeleteOutlined />}>删除</Button>').length, 0);
  assert.deepEqual(danger('import {Button} from "antd"; <Button color="danger" variant="outlined" icon={<DeleteOutlined />}>删除</Button>'), []);
  assert.deepEqual(danger('import {Button} from "antd"; <Button color={flag ? "danger" : "primary"} variant="solid" icon={<SaveOutlined />}>保存</Button>'), []);
  const unconfirmed = inspect('import {Button} from "antd"; const del=()=>{}; <Button color="danger" variant="outlined" icon={<DeleteOutlined />} onClick={del}>删除</Button>');
  assert.ok(unconfirmed.some((i) => i.message.includes("二次确认")));
  const popconfirmTitle = inspect('import {Popconfirm} from "antd"; <Popconfirm title={t("pages.x.confirm", { defaultValue: "确认删除" })}><span /></Popconfirm>');
  assert.ok(popconfirmTitle.some((i) => i.message.includes("common.confirm.execute")));
  assert.deepEqual(inspect('import {Popconfirm} from "@/components/ui"; <Popconfirm title={t("common.confirm.execute", { defaultValue: "确认执行？" })} description={t("pages.x.effect", { defaultValue: "删除后无法恢复" })}><span /></Popconfirm>'), []);
});

test("ActionLink 与按钮同规：同一动作文案必须配同一图标", () => {
  const mismatch = (source) => inspect(source).filter((i) => i.message.includes("全站统一用"));
  assert.notEqual(mismatch('import {ActionLink} from "@/components/ui"; <ActionLink to="/x" icon={<TagOutlined />}>{t("common.actions.edit")}</ActionLink>').length, 0);
  assert.deepEqual(mismatch('import {ActionLink} from "@/components/ui"; <ActionLink to="/x" icon={<EditOutlined />}>{t("common.actions.edit")}</ActionLink>'), []);
  assert.deepEqual(mismatch('import {ActionLink} from "@/components/ui"; <ActionLink to="/x" icon={<TagOutlined />}>{row.label}</ActionLink>'), []);
});

test("顺序调整统一拖动排序：上移/下移箭头按钮与原生 draggable 被拒绝", () => {
  const ordering = (source) => inspect(source).filter((i) => i.message.includes("拖动排序"));
  assert.notEqual(ordering('import {IconButton} from "@/components/ui"; <IconButton label="上移" icon={<ArrowUpOutlined />} onClick={up} />').length, 0);
  assert.notEqual(ordering('<div draggable onDragStart={start}>x</div>').length, 0);
  // KPI 卡片里的涨跌箭头不是操作按钮
  assert.deepEqual(ordering('<span>{positive ? <ArrowUpOutlined /> : <ArrowDownOutlined />}</span>'), []);
  assert.deepEqual(ordering('import {SortableList} from "@/components/ui"; <SortableList items={items} itemKey={(i) => i.id} onMove={move} handleLabel="拖动" renderItem={(i) => <span>{i.id}</span>} />'), []);
  const legacy = (source) => inspect(source).filter((i) => i.message.includes("@dnd-kit/react 系列"));
  assert.notEqual(legacy('import { useSortable } from "@dnd-kit/sortable";').length, 0);
  assert.deepEqual(legacy('import { useSortable } from "@dnd-kit/react/sortable"; import { move } from "@dnd-kit/helpers";'), []);
});

test("操作尾列由共享层固定：业务 fixed 被拒绝", () => {
  const fixed = (source) => inspect(source).filter((i) => i.message.includes("业务不得自行设置 fixed"));
  assert.notEqual(fixed('import {columnWidth} from "@/components/ui"; const columns = [{ title: "A", dataIndex: "a" }, { title: "操作", key: "action", width: columnWidth.actions(2), fixed: "right", render: () => null }];').length, 0);
  assert.deepEqual(fixed('import {columnWidth} from "@/components/ui"; const columns = [{ title: "A", dataIndex: "a" }, { title: "操作", key: "action", width: columnWidth.actions(2), render: () => null }];'), []);
});

test("表格列宽：columnWidth 标度 + 唯一主列", () => {
  const widths = (source) => inspect(source).filter((i) => i.message.includes("columnWidth") || i.message.includes("主列"));
  assert.notEqual(widths('const columns = [{ title: "A", dataIndex: "a" }, { title: "B", dataIndex: "b", width: 180 }];').length, 0);
  assert.notEqual(widths('import {columnWidth} from "@/components/ui"; const columns = [{ title: "A", dataIndex: "a" }, { title: "B", dataIndex: "b" }, { title: "C", dataIndex: "c", width: columnWidth.name }];').length, 0);
  assert.deepEqual(widths('import {columnWidth} from "@/components/ui"; const columns = [{ title: "A", dataIndex: "a" }, { title: "B", dataIndex: "b", width: columnWidth.time }, { title: "C", key: "c", width: columnWidth.actions(2), render: () => null }];'), []);
  assert.deepEqual(widths('const columns = [{ title: "A", dataIndex: "a", width: "30%" }, { title: "B", dataIndex: "b", width: "70%" }];'), []);
});


test("单元格里的条件树写在 TallContent 里，JSON 走 DetailDrawerButton，不用纯图标查看", () => {
  const cell = (source) => inspect(source).filter((issue) => /TallContent|DetailDrawerButton|纯图标 IconButton/.test(issue.message));
  assert.notEqual(cell('import {FilterRulesSummary} from "@/components/FilterRules"; const columns=[{ title: t("x"), dataIndex: "rules", render: (_, r) => <FilterRulesSummary value={r.rules} /> }];').length, 0);
  assert.notEqual(cell('import {JsonPreview} from "@/components/JsonPreview"; const columns=[{ title: t("x"), dataIndex: "remark", render: (_, r) => <JsonPreview value={r.remark} label="x" /> }];').length, 0);
  assert.notEqual(cell('import {JsonPreview} from "@/components/JsonPreview"; import {TallContent} from "@/components/ui"; const columns=[{ title: t("x"), dataIndex: "remark", render: (_, r) => <TallContent label="x"><JsonPreview value={r.remark} label="x" /></TallContent> }];').length, 0);
  assert.deepEqual(cell('import {JsonPreview} from "@/components/JsonPreview"; import {DetailDrawerButton} from "@/components/ui"; const columns=[{ title: t("x"), dataIndex: "remark", render: (_, r) => <DetailDrawerButton title={t("x")}><JsonPreview value={r.remark} label="x" /></DetailDrawerButton> }];'), []);
  assert.notEqual(cell('import {IconButton} from "@/components/ui"; import {EyeOutlined} from "@ant-design/icons"; const columns=[{ title: t("x"), dataIndex: "remark", render: (_, r) => <IconButton type="text" label={t("v")} icon={<EyeOutlined />} onClick={() => open(r)} /> }];').length, 0);
  assert.deepEqual(cell('import {FilterRulesSummary} from "@/components/FilterRules"; import {TallContent} from "@/components/ui"; const columns=[{ title: t("x"), dataIndex: "rules", render: (_, r) => <TallContent label={t("x")}><FilterRulesSummary value={r.rules} /></TallContent> }];'), []);
  assert.deepEqual(cell('import {ActionLink} from "@/components/ui"; import {EyeOutlined} from "@ant-design/icons"; const columns=[{ title: t("x"), key: "a", render: (_, r) => <ActionLink to={r.url} icon={<EyeOutlined />}>{t("common.vocab.detail")}</ActionLink> }];'), []);
});

test("表格长文本列统一 LongText：直接输出原文的 description/remark 列被拒绝", () => {
  const longText = (source) => inspect(source).filter((i) => i.message.includes("LongText"));
  assert.notEqual(longText('const columns = [{ title: "说明", dataIndex: "description", width: 220 }];').length, 0);
  assert.notEqual(longText('const columns = [{ title: "备注", dataIndex: "remark", render: (value) => <span>{value}</span> }];').length, 0);
  assert.deepEqual(longText('import { LongText } from "@/components/ui"; const columns = [{ title: "说明", dataIndex: "description", render: (value) => value ? <LongText label="说明">{value}</LongText> : "-" }];'), []);
  assert.deepEqual(longText('const columns = [{ title: "名称", dataIndex: "name" }];'), []);
});

test("前端整批数据的表格必须声明 orderBy 或 order=given", () => {
  const order = (source) => inspect(source).filter((issue) => issue.message.includes("声明展示顺序"));
  assert.notEqual(order('import { Table } from "@/components/ui"; <Table dataSource={rows} columns={columns} pagination={false} />').length, 0);
  assert.deepEqual(order('import { Table } from "@/components/ui"; <Table dataSource={rows} columns={columns} pagination={false} orderBy={(row) => row.name} />'), []);
  assert.deepEqual(order('import { Table } from "@/components/ui"; <Table dataSource={rows} columns={columns} pagination={false} order="given" />'), []);
  assert.deepEqual(order('import { Table } from "@/components/ui"; <Table dataSource={rows} columns={columns} pagination={pagination} />'), []);
});

test("时间只走 utils/dateTime：业务代码不得直接 dayjs/new Date/写死 +08:00", () => {
  const time = (source, file = "/src/pages/X/index.tsx") => inspectSource(source, file).filter((issue) => /utils\/dateTime|时区偏移/.test(issue.message));
  assert.notEqual(time('import dayjs from "dayjs"; const a = dayjs();').length, 0);
  assert.notEqual(time('const a = new Date();').length, 0);
  assert.notEqual(time('const s = value.format("YYYY-MM-DDTHH:mm:ss+08:00");').length, 0);
  assert.deepEqual(time('import type { Dayjs } from "dayjs"; import { now } from "@/utils/dateTime"; const a: Dayjs = now();'), []);
  assert.deepEqual(time('const id = `user-${Date.now()}`;'), []);
  assert.deepEqual(time('import dayjs from "dayjs"; dayjs.extend(utc);', "/src/utils/dateTime.ts"), []);
});

test("日期展示统一用 / 分隔：业务代码自写 YYYY-MM-DD/MM-DD 格式串被拒绝", () => {
  const separator = (source, file = "/src/pages/X/index.tsx") => inspectSource(source, file).filter((issue) => issue.message.includes("日期展示统一用"));
  assert.notEqual(separator('<DatePicker format="YYYY-MM-DD" />').length, 0);
  assert.notEqual(separator('const label = value.format("MM-DD");').length, 0);
  assert.notEqual(separator('const label = value.format(`YYYY-MM-DD HH:mm`);').length, 0);
  assert.deepEqual(separator('import { DATE_FORMAT } from "@/utils/dateTime"; <DatePicker format={DATE_FORMAT} />'), []);
  assert.deepEqual(separator('const s = value.format("YYYY-MM-DDTHH:mm:ssZ");', "/src/utils/dateTime.ts"), []);
  assert.deepEqual(separator('const key = "summary-MM-note";'), []);
});

test("排序比较只走 utils/collation：业务 localeCompare 与自建 Intl.Collator 被拒绝", () => {
  const collation = (source, filename) => inspect(source, filename).filter((i) => i.message.includes("utils/collation"));
  assert.notEqual(collation('const sorted = names.sort((a, b) => a.localeCompare(b));').length, 0);
  assert.notEqual(collation('const collator = new Intl.Collator("zh");').length, 0);
  assert.deepEqual(collation('import { compareText } from "@/utils/collation"; const sorted = names.sort(compareText);'), []);
  assert.deepEqual(collation('const collator = new Intl.Collator("zh"); export const compareText = (a, b) => a.localeCompare(b);', "/src/utils/collation.ts"), []);
});

test("表格单元格里的标签集合统一 InlineList：Space/Stack wrap 换行摊开被拒绝", () => {
  const wrapped = (source) => inspect(source).filter((i) => i.message.includes("InlineList"));
  assert.notEqual(wrapped('import {Space} from "antd"; import {StatusTag} from "@/components/ui"; const columns = [{ title: "标签", render: (_, record) => <Space wrap>{record.tags.map((tag) => <StatusTag key={tag}>{tag}</StatusTag>)}</Space> }];').length, 0);
  assert.notEqual(wrapped('import {Space} from "antd"; import {MetadataTag} from "@/components/ui"; const renderSourceCell = (sources) => <Space wrap>{sources.map((s) => <MetadataTag key={s}>{s}</MetadataTag>)}</Space>;').length, 0);
  // 非单元格（弹窗正文）里的换行标签组不在此列
  assert.deepEqual(wrapped('import {Space} from "antd"; import {MetadataTag} from "@/components/ui"; const body = <Space wrap>{groups.map((g) => <MetadataTag key={g}>{g}</MetadataTag>)}</Space>;'), []);
  assert.deepEqual(wrapped('import {InlineList, StatusTag} from "@/components/ui"; const columns = [{ title: "标签", render: (_, record) => <InlineList label="标签" items={record.tags} renderItem={(tag) => <StatusTag>{tag.label}</StatusTag>} /> }];'), []);
});

test("业务层按钮不得用 style 改几何：内边距/高度/字号交给 size 与共享层", () => {
  const geometry = (source) => inspect(source).filter((i) => i.message.includes("按钮几何"));
  assert.notEqual(geometry('import {Button} from "antd"; <Button type="text" size="small" icon={<EditOutlined />} style={{ paddingInline: 0 }}>编辑</Button>').length, 0);
  assert.notEqual(geometry('import {Button} from "antd"; <Button type="text" icon={<EyeOutlined />} style={{ height: 28, padding: 0 }}>查看</Button>').length, 0);
  assert.notEqual(geometry('import {IconButton} from "@/components/ui"; <IconButton type="text" label="查看" icon={<EyeOutlined />} style={{ fontSize: 12 }} />').length, 0);
  assert.deepEqual(geometry('import {Button} from "antd"; <Button type="text" size="small" icon={<EditOutlined />} style={{ width: "100%" }}>编辑</Button>'), []);
  assert.deepEqual(geometry('import {Button} from "antd"; <Button type="text" size="small" icon={<EditOutlined />}>编辑</Button>'), []);
});

test("二次确认唯一形式是 Popconfirm：命令式弹窗与 Modal.confirm 兜底一律拒绝", () => {
  const imperative = (source, filename) => inspect(source, filename).filter((i) => i.message.includes("命令式弹窗"));
  assert.notEqual(imperative('import {Modal} from "antd"; const del=()=>Modal.confirm({ title: "x" });').length, 0);
  assert.notEqual(imperative('import {Modal} from "antd"; const ok=()=>Modal.success({ title: "x" });').length, 0);
  assert.notEqual(imperative('import {Modal} from "antd"; const bad=()=>Modal.error({ title: "x" });').length, 0);
  assert.notEqual(imperative('import {App} from "antd"; const { modal } = App.useApp(); const del=()=>modal.confirm({ title: "x" });').length, 0);
  assert.notEqual(imperative('import {Modal} from "antd"; const [modal, holder] = Modal.useModal();').length, 0);
  // Modal.confirm 不再让危险按钮免于 Popconfirm
  const dangerWithModal = inspect('import {Button, Modal} from "antd"; const del=()=>Modal.confirm({}); <Button color="danger" variant="outlined" icon={<DeleteOutlined />} onClick={del}>删除</Button>');
  assert.ok(dangerWithModal.some((i) => i.message.includes("二次确认")));
  assert.deepEqual(imperative('import {Modal} from "antd"; <Modal open={open} title="x" />'), []);
  assert.deepEqual(imperative('import {Modal} from "antd"; const del=()=>Modal.confirm({});', "/src/components/ui/Example.tsx"), []);
});

test("业务图表只声明数据与形态：外观、缩放、HTML 提示框与循环取色一律拒绝", () => {
  const chart = (body) => inspectSource(`import ReactECharts from "@/components/ReactEcharts"; const option = ${body};`, "/src/pages/X/Chart.tsx");
  assert.ok(chart('{ tooltip: { backgroundColor: designTokens.color.data[0] } }').some((i) => i.message.includes("不得手写 backgroundColor")));
  assert.ok(chart('{ dataZoom: [{ type: "inside" }] }').some((i) => i.message.includes("不提供 dataZoom")));
  assert.ok(chart('{ series: [{ type: "sankey", roam: true }] }').some((i) => i.message.includes("不提供 roam")));
  assert.deepEqual(chart('{ series: [{ type: "graph", roam: false }] }').filter((i) => i.message.includes("不提供")), []);
  assert.ok(chart('{ tooltip: { formatter: (p) => `${p.name}<br/>${p.value}` } }').some((i) => i.message.includes("valueFormatter")));
  assert.deepEqual(chart('{ tooltip: { valueFormatter: chartValueFormatters.currency }, xAxis: { axisLabel: { formatter: (v) => f(v) } } }').filter((i) => i.message.includes("valueFormatter")), []);
  assert.ok(chart('{ series: [{ data: rows.map((r, i) => ({ value: r.v, itemStyle: { color: CHART_COLORS[i % CHART_COLORS.length] } })) }] }').some((i) => i.message.includes("循环取色")));
  assert.ok(inspectSource('import ReactECharts from "@/components/ReactEcharts"; import { useCopyToClipboard } from "@/components/ui"; const el = <ReactECharts option={o} onChartReady={(c) => c.on("click", copy)} />;', "/src/pages/X/Chart.tsx").some((i) => i.message.includes("不承载复制")));
  assert.deepEqual(inspectSource('import ReactECharts from "@/components/ReactEcharts"; import { useCopyToClipboard } from "@/components/ui";', "/src/pages/X/Chart.tsx").filter((i) => i.message.includes("不承载复制")), []);
  assert.ok(inspectSource('import ReactECharts from "@/components/ReactEcharts"; const el = <Card title={t("pages.x.chart", { defaultValue: "模型开销分布" })} />;', "/src/pages/X/Chart.tsx").some((i) => i.message.includes("chartTitle")));
  assert.deepEqual(inspectSource('import ReactECharts from "@/components/ReactEcharts"; const el = <Card title={chartTitle({ dimension: "model", metric: "total", form: "ranking" })} />;', "/src/pages/X/Chart.tsx").filter((i) => i.message.includes("chartTitle")), []);
  // 非图表文件与共享图表层不受影响
  assert.deepEqual(inspectSource('const style = { fontSize: designTokens.font.sizeXs }; const o = { tooltip: { backgroundColor: "x" } };', "/src/pages/X/Plain.tsx").filter((i) => i.message.includes("共享主题")), []);
  assert.deepEqual(inspectSource('import { init } from "echarts/core"; const theme = { tooltip: { backgroundColor: colors.surface } };', "/src/components/ReactEcharts/chartTheme.ts").filter((i) => i.message.includes("共享主题")), []);
});

test("完整表格必须放在 TablePanel 内，不得直接进 Card 正文", () => {
  const inCard = inspect('import {Card} from "antd"; import {DataTable} from "@/components/ui"; <Card title="x"><DataTable controller={c} columns={[]} rowKey="id" /></Card>');
  assert.ok(inCard.some((i) => i.message.includes("共享 TablePanel")));
  assert.deepEqual(inspect('import {DataTable, TablePanel} from "@/components/ui"; <TablePanel title="x"><DataTable controller={c} columns={[]} rowKey="id" /></TablePanel>').filter((i) => i.message.includes("TablePanel")), []);
});

test("查询区下拉统一 FilterSelect：二元状态 pair，可组合枚举和实体 enum", () => {
  const raw = inspect('import {Form, Select} from "antd"; import {QueryForm} from "@/components/ui"; <QueryForm onSubmit={run}><Form.Item name="s"><Select allowClear options={opts} /></Form.Item></QueryForm>');
  assert.ok(raw.some((i) => i.message.includes("共享 FilterSelect")));
  assert.deepEqual(inspect('import {Form, Select} from "antd"; <Form><Form.Item name="s"><Select allowClear options={opts} /></Form.Item></Form>').filter((i) => i.message.includes("共享 FilterSelect")), []);
  const pairTooMany = inspect('import {FilterSelect} from "@/components/ui"; <FilterSelect kind="pair" options={[{value:"a",label:"A"},{value:"b",label:"B"},{value:"c",label:"C"}]} />');
  assert.ok(pairTooMany.some((i) => i.message.includes("三值及以上枚举必须")));
  const enumPair = inspect('import {FilterSelect} from "@/components/ui"; <FilterSelect kind="enum" options={[{value:"a",label:"A"},{value:"b",label:"B"}]} />');
  assert.deepEqual(enumPair.filter((i) => i.rule === "FRONTEND-TABLE"), []);
  assert.ok(inspect('import {FilterSelect} from "@/components/ui"; <FilterSelect kind={kind} options={opts} />').some((i) => i.message.includes("字符串字面量声明 kind")));
  assert.deepEqual(inspect('import {FilterSelect} from "@/components/ui"; <FilterSelect kind="enum" options={[{value:"a",label:"A"},{value:"b",label:"B"},{value:"c",label:"C"}]} />').filter((i) => i.message.includes("FilterSelect") || i.message.includes("kind")), []);
});

test("确定/取消按钮随共享层带图标：业务层不得直接用 antd Popconfirm 或置空图标", () => {
  const rawPopconfirm = inspect('import {Popconfirm} from "antd"; <Popconfirm title={t("common.confirm.execute")}><span /></Popconfirm>');
  assert.ok(rawPopconfirm.some((i) => i.message.includes("共享 Popconfirm")));
  assert.deepEqual(inspectSource('import {Popconfirm} from "antd"; <Popconfirm title="x"><span /></Popconfirm>', "/src/components/ui/Popconfirm.tsx").filter((i) => i.message.includes("共享 Popconfirm")), []);
  const dropped = inspect('import {Modal} from "antd"; <Modal open okButtonProps={{ icon: null }}><p /></Modal>');
  assert.ok(dropped.some((i) => i.message.includes("不得置空 okButtonProps/cancelButtonProps.icon")));
  const droppedPopconfirm = inspect('import {Popconfirm} from "@/components/ui"; <Popconfirm title={t("common.confirm.execute")} cancelButtonProps={{ icon: undefined }}><span /></Popconfirm>');
  assert.ok(droppedPopconfirm.some((i) => i.message.includes("不得置空 okButtonProps/cancelButtonProps.icon")));
  assert.deepEqual(inspect('import {Modal} from "antd"; <Modal open okButtonProps={{ loading }}><p /></Modal>').filter((i) => i.message.includes("置空")), []);
});

test("操作按钮统一图标 + 文字", () => {
  const iconIssues = (source, filename) => inspectSource(source, filename ?? "/src/pages/Example.tsx").filter((i) => i.message.includes("必须显式传 icon"));
  assert.notEqual(iconIssues('import {Button} from "antd"; <Button type="primary">新建</Button>').length, 0);
  assert.notEqual(iconIssues('import {Button as Action} from "antd"; <Action onClick={run}>刷新</Action>').length, 0);
  assert.deepEqual(iconIssues('import {Button} from "antd"; <Button type="primary" icon={<PlusOutlined />}>新建</Button>'), []);
  assert.deepEqual(iconIssues('import {IconButton} from "@/components/ui"; <IconButton label="复制" icon={<CopyOutlined />} />'), []);
  assert.deepEqual(iconIssues('import {Button} from "antd"; <Button htmlType="submit">查询</Button>', "/src/components/ui/QueryForm.tsx"), []);
});

test("字号梯级冻结为六档职责制,新增中间档被拒绝", () => {
  const valid = "const designTokens = { font: { family: 'x', mono: 'y', sizeXs: 12, sizeBody: 14, sizeLg: 16, sizeTitle: 20, sizePageTitle: 24, sizeMetric: 28 } }";
  assert.deepEqual(inspectTypographyScale(valid), []);
  const rogueTier = valid.replace("sizeXs: 12,", "sizeXs: 12, sizeSm: 13,");
  assert.notEqual(inspectTypographyScale(rogueTier).length, 0);
  assert.match(inspectTypographyScale(rogueTier)[0].message, /sizeSm 不在六档职责制内/);
  const changedValue = valid.replace("sizeBody: 14,", "sizeBody: 15,");
  assert.notEqual(inspectTypographyScale(changedValue).length, 0);
});

test("可清除输入控件必须显式声明 allowClear", () => {
  assert.notEqual(inspect('import {Input} from "antd"; const a = <Input value={v} onChange={c} />').length, 0);
  assert.notEqual(inspect('import {Select} from "antd"; <Select options={o} />').length, 0);
  assert.deepEqual(inspect('import {Input} from "antd"; const a = <Input allowClear value={v} onChange={c} />'), []);
  assert.deepEqual(inspect('import {Select} from "antd"; <Select allowClear={false} options={o} />'), []);
  assert.deepEqual(inspect('import {InputNumber} from "antd"; <InputNumber value={v} onChange={c} />'), []);
});

test("Menu 主题映射的亮色 token 必须成对映射 dark 变体", () => {
  const paired = `const theme = { components: { Menu: { itemColor: c.a, darkItemColor: c.b, itemHoverColor: c.a, darkItemHoverColor: c.b, itemHoverBg: c.a, darkItemHoverBg: c.b, itemSelectedColor: c.a, darkItemSelectedColor: c.b, subMenuItemSelectedColor: c.a, itemSelectedBg: c.a, darkItemSelectedBg: c.b, groupTitleColor: c.a, darkGroupTitleColor: c.b } } };`;
  assert.deepEqual(inspectAntThemeMapping(paired), []);
  const missingDark = paired.replace(", darkItemColor: c.b", "").replace(", subMenuItemSelectedColor: c.a", "");
  const issues = inspectAntThemeMapping(missingDark);
  assert.equal(issues.length, 2);
  assert.match(issues[0].message, /缺少成对的 darkItemColor/);
  assert.match(issues[1].message, /缺少成对的 subMenuItemSelectedColor/);
  assert.notEqual(inspectAntThemeMapping("const theme = { components: { Button: {} } };").length, 0);
});

test("Ant Design 关键颜色与尺寸全部从唯一 token 源派生", () => {
  const text = readFileSync(new URL("../src/config/theme.ts", import.meta.url), "utf8");
  const source = ts.createSourceFile("theme.ts", text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const required = new Set(["colorPrimary", "colorText", "colorBgContainer", "colorBorder", "borderRadius", "borderRadiusLG", "fontSize", "fontSizeSM", "fontSizeLG"]);
  const found = new Set();
  function visit(node) {
    if (ts.isPropertyAssignment(node) && required.has(node.name.getText(source))) {
      found.add(node.name.getText(source));
      assert.match(node.initializer.getText(source), /^token\./, `${node.name.getText(source)} 必须直接派生自 token`);
    }
    ts.forEachChild(node, visit);
  }
  visit(source);
  assert.deepEqual(found, required);
});

test("普通图表系列只使用数据色，不借用状态色", () => {
  assert.notEqual(inspect("const option={series:[{itemStyle:{color:designTokens.color.success}}]} ").length, 0);
  assert.notEqual(inspect("const option={visualMap:{inRange:{color:[designTokens.color.infoSurface]}}}").length, 0);
  assert.notEqual(inspect("const CHART_COLORS=[designTokens.color.info,designTokens.color.warning]").length, 0);
  assert.deepEqual(inspect("const option={series:[{itemStyle:{color:designTokens.color.data[0]}}]}; const status={color:designTokens.color.error}"), []);
  assert.deepEqual(inspect("const CHART_COLORS=designTokens.color.data"), []);
});

test("关键前景与表面 token 满足文本对比度", () => {
  const source = readFileSync(new URL("../src/design/tokens.css", import.meta.url), "utf8");
  const block = (marker) => {
    const start = source.indexOf(marker);
    const end = source.indexOf("}", start);
    return Object.fromEntries([...source.slice(start, end).matchAll(/(--ds-[\w-]+):\s*([^;]+);/g)].map((m) => [m[1], m[2].trim()]));
  };
  const themes = { light: block(":root {"), dark: block(':root[data-theme="dark"]') };
  const luminance = (hex) => {
    const channels = hex.slice(1).match(/.{2}/g).map((value) => Number.parseInt(value, 16) / 255).map((value) => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);
    return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
  };
  const ratio = (foreground, background) => {
    const values = [luminance(foreground), luminance(background)].sort((a, b) => b - a);
    return (values[0] + 0.05) / (values[1] + 0.05);
  };
  for (const [name, colors] of Object.entries(themes)) {
    for (const [foreground, background] of [
      [colors["--ds-color-text"], colors["--ds-color-surface"]],
      [colors["--ds-color-text-secondary"], colors["--ds-color-surface"]],
      [colors["--ds-color-text"], colors["--ds-color-surface-muted"]],
      [colors["--ds-color-text"], colors["--ds-color-surface-elevated"]],
    ]) assert.ok(ratio(foreground, background) >= 4.5, `${name}: ${foreground} / ${background} 对比度不足 4.5:1`);
  }
});

test("品牌主题只有一个可编辑种子，所有交互主色档位自动派生", () => {
  const source = readFileSync(new URL("../src/design/tokens.css", import.meta.url), "utf8");
  assert.equal([...source.matchAll(/--ds-color-brand\s*:/g)].length, 1, "品牌种子必须且只能发布一次");
  const darkBlock = source.match(/:root\[data-theme="dark"\]\s*\{([\s\S]*?)\}/)?.[1] ?? "";
  assert.equal(darkBlock.includes("--ds-color-brand:"), false, "暗色主题不得维护第二份品牌种子");
  const declarations = Object.fromEntries([...source.matchAll(/(--ds-(?:color|shadow)-[\w-]+):\s*([^;]+);/g)].map((match) => [match[1], match[2].trim()]));
  for (const name of [
    "--ds-color-primary",
    "--ds-color-primary-hover",
    "--ds-color-primary-active",
    "--ds-color-primary-surface",
    "--ds-color-primary-border",
    "--ds-color-focus",
    "--ds-shadow-focus",
  ]) assert.match(declarations[name], /var\(--ds-color-(?:brand|primary)/, `${name} 必须从唯一品牌种子派生`);
});


test("数据页面信息架构：总览只放登记的一级指标，同一张图不得同时出现在总览与分析", () => {
  const title = (metric) => `const t = chartTitle({ dimension: "model", metric: ${JSON.stringify(metric)}, form: "ranking" });`;
  const overview = { filename: `${overviewPage}components/A.tsx`, source: title(primaryMetric) };
  const analysisDup = { filename: `${analysisPage}components/B.tsx`, source: title(primaryMetric) };
  const analysisOk = { filename: `${analysisPage}components/C.tsx`, source: title(derivedMetric) };
  const overviewDerived = { filename: `${overviewPage}components/D.tsx`, source: title([secondaryMetric, derivedMetric]) };
  assert.ok(inspectDataPageArchitecture([overview, analysisDup], archConfig).some((i) => i.message.includes("不得重复摆放")));
  assert.deepEqual(inspectDataPageArchitecture([overview, analysisOk], archConfig), []);
  assert.ok(inspectDataPageArchitecture([overviewDerived], archConfig).some((i) => i.message.includes("派生指标")));
  assert.deepEqual(inspectDataPageArchitecture([{ filename: "src/pages/Other/X.tsx", source: overviewDerived.source }], archConfig), []);
});

test("通知只由用户动作触发：加载/派生/渲染/服务层/模块顶层禁止弹通知，反馈入口唯一", () => {
  const feedback = (text, filename = "/src/pages/X/Y.tsx") =>
    inspectSource(text, filename).filter((issue) => issue.rule === "FRONTEND-FEEDBACK").map((issue) => issue.message);
  const header = 'import { useEffect, useMemo } from "react"; import { useRequest } from "@/hooks/useRequest"; import { notifyActionSuccess, notifyActionFailed, notifyWarning } from "@/utils/feedback";';
  assert.deepEqual(feedback(`${header}
    export function Page() {
      const save = async () => { try { await api(); notifyActionSuccess("save"); } catch (error) { notifyActionFailed("save", error); } };
      const blocked = () => { if (!ok) { notifyWarning("x"); return; } };
      return <button onClick={save} />;
    }`), []);
  assert.ok(feedback(`${header} export function Page() { useEffect(() => { if (error) notifyActionFailed("save", error); }, [error]); return null; }`).some((m) => m.includes("useEffect")));
  assert.ok(feedback(`${header} export function Page() { useEffect(() => { void (async () => { notifyActionSuccess("save"); })(); }, []); return null; }`).some((m) => m.includes("useEffect")));
  assert.ok(feedback(`${header} export function Page() { const v = useMemo(() => { notifyWarning("x"); return 1; }, []); return null; }`).some((m) => m.includes("useMemo")));
  assert.ok(feedback(`${header} export function Page() { const q = useRequest(async () => { try { return await api(); } catch (e) { notifyActionFailed("save", e); throw e; } }); return null; }`).some((m) => m.includes("useRequest")));
  assert.ok(feedback(`${header} export function Page() { if (bad) notifyWarning("x"); return null; }`).some((m) => m.includes("渲染阶段")));
  assert.ok(feedback(`${header} const Page = () => { notifyWarning("x"); return null; };`).some((m) => m.includes("渲染阶段")));
  assert.ok(feedback(`${header} notifyWarning("x");`).some((m) => m.includes("模块顶层")));
  assert.ok(feedback(`${header} export async function load() { try { return await api(); } catch (e) { notifyActionFailed("save", e); } }`, `/src${servicesModule.replace("@/", "/")}/x.ts`).some((m) => m.includes("服务层")));
  assert.ok(feedback(`${header} export function Page() { const run = async () => { try { await api(); } catch (e) { notifyActionSuccess("save"); } }; return <button onClick={run} />; }`).some((m) => m.includes("catch 分支不得报成功")));
  assert.ok(feedback('import { message } from "antd"; export function Page() { const run = () => message.success("ok"); return <button onClick={run} />; }').some((m) => m.includes("禁止直接使用 antd message")));
  assert.ok(feedback('import { App } from "antd"; export function Page() { const { message } = App.useApp(); const run = () => message.success("ok"); return <button onClick={run} />; }').some((m) => m.includes("禁止直接调用 message/notification 实例")));
  assert.deepEqual(feedback('import { notification } from "./antdStatic"; export function x() {}', "/src/utils/feedback.ts"), []);
});

test("图表突出显示：主题里每种系列都选定 focus（self/series/adjacency），none 与手写高亮样式一律拒绝；业务不得碰高亮", () => {
  const theme = (text) => inspectSource(text, "/src/components/ReactEcharts/chartTheme.ts").filter((i) => i.rule === "FRONTEND-DATA").map((i) => i.message);
  assert.deepEqual(theme('export function buildChartTheme() { return { sankey: { emphasis: { focus: "adjacency" } }, bar: { barMaxWidth: 28, emphasis: { focus: "self", blurScope: "series" } }, line: { emphasis: { focus: "series" } } }; }'), []);
  assert.ok(theme('export function buildChartTheme() { return { bar: { emphasis: { focus: "self", blurScope: "row" } } }; }').some((m) => m.includes("blurScope 只能取")));
  assert.ok(theme('export function buildChartTheme() { return { bar: { barMaxWidth: 28 } }; }').some((m) => m.includes("bar 系列必须选定 emphasis.focus")));
  assert.ok(theme('export function buildChartTheme() { return { bar: { emphasis: { focus: "none" } } }; }').some((m) => m.includes('不得用 "none"')));
  assert.ok(theme('export function buildChartTheme() { return { bar: { emphasis: { focus: "self", itemStyle: { borderWidth: 1 } } } }; }').some((m) => m.includes("不得手写 itemStyle")));
  assert.ok(theme('export function buildChartTheme() { return { axisPointer: { shadowStyle: { color: "#000", opacity: 0.6 } } }; }').some((m) => m.includes("不得手写 shadowStyle")));
  assert.ok(theme('export function buildChartTheme() { return { scatter: { emphasis: { focus: "self" }, blur: { itemStyle: { opacity: 0.1 } } } }; }').some((m) => m.includes("不得手写 blur")));
  const business = inspectSource('import { ReactEcharts } from "@/components/ReactEcharts"; const option = { series: [{ type: "scatter", emphasis: { focus: "self" } }] };', "/src/pages/X/Chart.tsx").map((i) => i.message);
  assert.ok(business.some((m) => m.includes("业务 option 不得设置 emphasis")));
});

test("图表左右留白：类目轴标签宽度不得写死（用 categoryAxisLabel 按内容定宽），有图例时值轴不再写 name", () => {
  const chart = (text) => inspectSource(`import { ReactEcharts } from "@/components/ReactEcharts"; ${text}`, "/src/pages/X/Chart.tsx").filter((i) => i.rule === "FRONTEND-DATA").map((i) => i.message);
  assert.ok(chart('const option = { yAxis: { type: "category", axisLabel: { width: 120, overflow: "truncate" } } };').some((m) => m.includes("类目轴标签宽度不得写死")));
  assert.deepEqual(chart('const option = { yAxis: { type: "category", axisLabel: categoryAxisLabel(names) } };'), []);
  assert.ok(chart('const option = { legend: { data: [a, b] }, xAxis: [{ type: "value", name: a }], series: [{ name: a, type: "bar" }] };').some((m) => m.includes("有图例的图表不再写值轴 name")));
  assert.deepEqual(chart('const option = { xAxis: { type: "value", name: a }, yAxis: { type: "value", name: b }, series: [{ type: "scatter" }] };'), []);
});

test("图表网格左右留白由主题统一：业务不得设 grid.left/right，内容定几何与无轴迷你图除外", () => {
  const chart = (text) => inspectSource(`import { ReactEcharts } from "@/components/ReactEcharts"; ${text}`, "/src/pages/X/Chart.tsx").filter((i) => i.rule === "FRONTEND-DATA").map((i) => i.message);
  assert.ok(chart('const option = { grid: { left: 24, right: 24 }, xAxis: { type: "value" } };').some((m) => m.includes("不得设置 grid.left")));
  assert.ok(chart('const option = { grid: { top: 8, bottom: 40 }, xAxis: { type: "value" } };').some((m) => m.includes("不得设置 grid.top")));
  assert.deepEqual(chart('const option = { grid: { containLabel: true }, xAxis: { type: "value" } };'), []);
  assert.ok(chart('const option = { legend: { bottom: 0 }, series: [] };').some((m) => m.includes("业务 legend 不得设置 bottom")));
  assert.deepEqual(chart('const option = { legend: { data: [a, b], show: true }, series: [] };'), []);
  assert.deepEqual(chart('const option = { legend: {}, xAxis: { type: "value", name: a }, yAxis: { type: "value", name: b }, series: rows.map(row => ({ type: "scatter", name: row.name })) };'), []);
  assert.ok(chart('const option = { series: [{ type: "pie", center: ["50%", "44%"], data }] };').some((m) => m.includes("不得设置 center")));
  assert.deepEqual(chart('const option = { grid: { left: 8, width: w, height: h }, xAxis: { type: "category" } };'), []);
  assert.deepEqual(chart('const option = { grid: { left: 0, right: 0 }, xAxis: { type: "category", show: false }, yAxis: { type: "value", show: false } };'), []);
});

test("图表必须画出全部数据：业务图表引用“其他”折叠即拒绝", () => {
  const chart = (text) => inspectSource(`import { ReactEcharts } from "@/components/ReactEcharts"; ${text}`, "/src/pages/X/Chart.tsx").filter((i) => i.rule === "FRONTEND-DATA").map((i) => i.message);
  assert.ok(chart('const other = t("common.chart.other"); const option = { series: [] };').some((m) => m.includes("不得把数据折叠成")));
  assert.deepEqual(chart('const unknown = t("common.chart.unknown"); const option = { series: [] };'), []);
});

test("第三方库配置变量可在共享组件里桥接到设计 token，但不得带裸值；设计 token 本身仍只在 token 源定义", () => {
  assert.deepEqual(inspectCss(".x { --rqb-spacing: var(--ds-space-8); --rqb-border-color: var(--ds-color-border); }", { filename: "src/components/FilterRules/FilterRules.css" }).filter((i) => i.message.includes("唯一 token 源")), []);
  assert.ok(inspectCss(".x { --rqb-spacing: 8px; }", { filename: "src/components/FilterRules/FilterRules.css" }).some((i) => i.message.includes("唯一 token 源")));
  assert.ok(inspectCss(".x { --ds-space-8: var(--ds-space-4); }", { filename: "src/components/FilterRules/FilterRules.css" }).some((i) => i.message.includes("唯一 token 源")));
  // 业务层不得起别名：桥接只属于包装第三方库的共享组件
  assert.ok(inspectCss(".x { --rqb-spacing: var(--ds-space-8); }", { filename: "src/pages/X/y.css" }).some((i) => i.message.includes("唯一 token 源")));
});

test("筛选条件组只经共享 FilterRules：页面不得直引 react-querybuilder", () => {
  assert.ok(inspectSource('import { QueryBuilder } from "react-querybuilder";', "/src/pages/X/Y.tsx").some((i) => i.message.includes("共享 FilterRules")));
  assert.ok(inspectSource('import { QueryBuilderAntD } from "@react-querybuilder/antd";', "/src/pages/X/Y.tsx").some((i) => i.message.includes("共享 FilterRules")));
  assert.deepEqual(inspectSource('import { QueryBuilder } from "react-querybuilder";', "/src/components/FilterRules/FilterRulesEditor.tsx").filter((i) => i.message.includes("共享 FilterRules")), []);
});

test("颜色与图标语义统一：危险图标必须红色，同一动作同一图标，IconButton 与 Button 同规", () => {
  const business = (text) => inspectSource(`import { Button } from "antd"; import { IconButton, Popconfirm } from "@/components/ui"; import { DeleteOutlined, ClearOutlined, EditOutlined, PlusOutlined } from "@ant-design/icons"; ${text}`, "/src/pages/X/Y.tsx").map((i) => i.message);
  assert.ok(business('const el = <Popconfirm title={t("common.confirm.execute")}><IconButton type="text" icon={<DeleteOutlined />} label={t("common.actions.delete")} /></Popconfirm>;').some((m) => m.includes('必须 color="danger"')));
  assert.ok(business('const el = <Popconfirm title={t("common.confirm.execute")}><IconButton type="text" color="danger" icon={<DeleteOutlined />} label={t("common.actions.delete")} /></Popconfirm>;').some((m) => m.includes("必须同时显式给出 variant")));
  assert.deepEqual(business('const el = <Popconfirm title={t("common.confirm.execute")}><IconButton variant="text" color="danger" icon={<DeleteOutlined />} label={t("common.actions.delete")} /></Popconfirm>;').filter((m) => /danger|variant|图标/.test(m)), []);
  assert.ok(business('const el = <Button type="text" icon={<EditOutlined />}>{t("common.actions.clear")}</Button>;').some((m) => m.includes("全站统一用 ClearOutlined")));
  assert.deepEqual(business('const el = <Button type="primary" icon={<PlusOutlined />}>{t("common.actions.create")}</Button>;').filter((m) => m.includes("全站统一用")), []);
});

test("页面级保存只走 SaveBar", () => {
  const messages = inspectSource('import { Button } from "antd"; const el = <Button type="primary" icon={<SaveOutlined />}>{t("common.actions.save")}</Button>;', "/src/pages/X/Y.tsx").map((i) => i.message);
  assert.ok(messages.some((m) => m.includes("统一走共享 SaveBar")));
  assert.deepEqual(inspectSource('import { Button } from "antd"; const el = <Button icon={<EditOutlined />}>{t("common.actions.edit")}</Button>;', "/src/pages/X/Y.tsx").filter((i) => i.message.includes("SaveBar")), []);
});

test("大候选集接口不得无参全量拉取", () => {
  const source = (call) => `import { ${largeCandidateApi} } from "${largeCandidateApis.module}"; export const load = () => ${call};`;
  assert.ok(inspectSource(source(`${largeCandidateApi}()`), "/src/pages/X/Y.tsx", { largeCandidateApis }).some((i) => i.message.includes("不得无参全量拉取")));
  assert.deepEqual(inspectSource(source(`${largeCandidateApi}({ keyword: "a", limit: 20 })`), "/src/pages/X/Y.tsx", { largeCandidateApis }).filter((i) => i.message.includes("全量拉取")), []);
});

test("ViewSwitch 不得写死宽度，ResponsiveTabs 不受此限", () => {
  const messages = inspectSource('import { ViewSwitch } from "@/components/ui"; const el = <ViewSwitch options={[]} style={{ width: 102 }} />;', "/src/pages/X/Y.tsx").map((i) => i.message);
  assert.ok(messages.some((m) => m.includes("不得写死 width")));
  assert.deepEqual(inspectSource('import { ViewSwitch } from "@/components/ui"; const el = <ViewSwitch block options={[]} />;', "/src/pages/X/Y.tsx").filter((i) => i.message.includes("写死 width")), []);
  assert.deepEqual(inspectSource('import { ResponsiveTabs } from "@/components/ui"; const el = <ResponsiveTabs items={[]} style={{ width: 480 }} />;', "/src/pages/X/Y.tsx").filter((i) => i.message.includes("写死 width")), []);
});

test("多选控件统一走共享 MultiSelect", () => {
  const messages = inspectSource('import { Select } from "antd"; const el = <Select mode="multiple" allowClear options={[]} />;', "/src/pages/X/Y.tsx").map((i) => i.message);
  assert.ok(messages.some((m) => m.includes("统一使用共享 MultiSelect")));
  assert.deepEqual(inspectSource('import { Select } from "antd"; const el = <Select mode="multiple" allowClear options={[]} />;', "/src/components/ui/MultiSelect.tsx").filter((i) => i.message.includes("MultiSelect")), []);
  assert.deepEqual(inspectSource('import { Select } from "antd"; const el = <Select mode="multiple" allowClear options={[]} />;', "/src/components/ui/FilterSelect.tsx").filter((i) => i.message.includes("MultiSelect")), []);
});

test("多选控件不得折叠或截断已选标签", () => {
  const messages = inspectSource('import { Select } from "antd"; const el = <Select mode="multiple" maxTagCount="responsive" options={[]} />;', "/src/pages/X/Y.tsx").map((i) => i.message);
  assert.ok(messages.some((m) => m.includes("不得 maxTagCount")));
  assert.ok(inspectSource('import { Select } from "antd"; const el = <Select mode="multiple" maxTagTextLength={10} options={[]} />;', "/src/components/ui/X.tsx").some((i) => i.message.includes("不得 maxTagTextLength")));
});

test("权限点列表只用共享 PermissionPointTable，业务页不自建权限点表格列或 Ant Tree", () => {
  const issues = (source, file = "/repo/src/pages/PolicyListPage/X.tsx") => inspectSource(source, file).filter((issue) => /PermissionPointTable|Ant Tree/.test(issue.message));
  assert.notEqual(issues('const columns = [{ title: t("common.vocab.searchPermissions"), key: "permission", render: () => null }];').length, 0);
  assert.notEqual(issues('import { Tree } from "antd"; <Tree treeData={[]} />').length, 0);
  assert.deepEqual(issues('const columns = [{ title: t("common.vocab.searchPermissions"), key: "permission", render: () => null }];', "/repo/src/components/PermissionPointTable/index.tsx"), []);
  assert.deepEqual(issues('<SectionHeader title={t("common.vocab.searchPermissions")} />'), []);
  assert.deepEqual(issues('const header = { title: t("common.vocab.searchPermissions") };'), []);
  // 换成“对象 / 操作”表头同样拦下；带“主体”列的原始授权规则表、导入变更对比放行
  assert.notEqual(issues('const columns = [{ title: t("common.vocab.object"), dataIndex: "obj" }, { title: t("common.vocab.action"), dataIndex: "act" }];').length, 0);
  assert.deepEqual(issues('const columns = [{ title: t("common.vocab.subject"), dataIndex: "sub" }, { title: t("common.vocab.object"), dataIndex: "obj" }, { title: t("common.vocab.action"), dataIndex: "act" }];'), []);
  assert.deepEqual(issues('const columns = [{ title: t("common.vocab.object"), dataIndex: "obj" }, { title: t("common.vocab.action"), dataIndex: "act" }];', "/repo/src/pages/PolicyListPage/PermissionDefinitionImportPreview.tsx"), []);
});

test("页面标题与侧边栏、面包屑同源：AppPage 不传固定 t() 标题", () => {
  const issues = (source) => inspectSource(source, "/repo/src/pages/X/index.tsx").filter((issue) => issue.message.includes("导航树"));
  assert.notEqual(issues('<AppPage title={t("pages.x.title")}>x</AppPage>').length, 0);
  assert.deepEqual(issues('<AppPage title={isCreate ? t("common.vocab.createTag") : undefined}>x</AppPage>'), []);
  assert.deepEqual(issues('<AppPage title={resourceName}>x</AppPage>'), []);
  assert.deepEqual(issues('<Card title={t("pages.x.title")}>x</Card>'), []);
});

test("列表 → 详情 → 编辑：路由形态、详情/编辑版式、行内编辑入口、弹窗表单与列数", () => {
  const issues = (source, file = "/repo/src/pages/X/index.tsx") => inspectSource(source, file).filter((issue) => /详情|编辑|ModalForm|最多 8 列|带参数的路由/.test(issue.message));
  const routes = "/repo/src/routes/index.tsx";
  // 路由形态
  assert.notEqual(issues('const r = [{ path: "/resource/user-list/:id", label: x }];', routes).length, 0);
  assert.notEqual(issues('const r = [{ path: "config/announcement/edit/:id", element: page }];', routes).length, 0);
  assert.deepEqual(issues('const r = [{ path: "/resource/user-list/detail/:id" }, { path: "/a/detail/:k/edit" }, { path: "a/new" }];', routes), []);
  // 详情 / 编辑版式
  assert.notEqual(issues('<AppPage title={name} content={summary} tabList={tabs}>x</AppPage>').length, 0);
  assert.notEqual(issues('<SaveBar dirty={dirty} onSave={save} onRevert={revert} />').length, 0);
  assert.deepEqual(issues('<SaveBar dirty={dirty} onSave={save} onRevert={revert} />', "/repo/src/components/ui/EntityPage.tsx"), []);
  // 行内编辑入口
  assert.notEqual(issues('const columns = [{ title: t("a"), render: (_, row) => <Button icon={<EditOutlined />} onClick={() => navigate(`/x/detail/${row.id}/edit`)}>e</Button> }];').length, 0);
  assert.deepEqual(issues('const columns = [{ title: t("a"), render: (_, row) => <Button icon={<EditOutlined />} onClick={() => openModal(row)}>e</Button> }];'), []);
  // 授权配置不再例外：行内跳到标签编辑页同样拒绝
  assert.notEqual(issues('const columns = [{ title: t("a"), render: (_, row) => <Button icon={<EditOutlined />} onClick={() => navigate(buildTagEditorUrl(row.key))}>e</Button> }];').length, 0);
  // 弹窗表单
  assert.notEqual(issues('<Modal open={open} onOk={ok}><Form form={form}><Form.Item name="a" /></Form></Modal>').length, 0);
  assert.deepEqual(issues('<Modal open={open} footer={[<Button key="a" />]}><Form form={form} /></Modal>'), []);
  // 列数
  const column = (i) => `{ title: t("c${i}"), render: () => null }`;
  assert.notEqual(issues(`const columns = [${Array.from({ length: 9 }, (_, i) => column(i)).join(", ")}];`).length, 0);
  assert.deepEqual(issues(`const columns = [${Array.from({ length: 8 }, (_, i) => column(i)).join(", ")}];`), []);
});

test("详情入口只有一种：操作列“详情”，名称链接只引用别的对象", () => {
  const issues = (source) => inspectSource(source, "/repo/src/pages/X/index.tsx").filter((issue) => /详情入口|名称链接/.test(issue.message));
  assert.notEqual(issues('<ActionLink variant="name" icon={<EyeOutlined />} to="/a/detail/1">{row.name}</ActionLink>').length, 0);
  assert.notEqual(issues('<ActionLink icon={<EyeOutlined />} to="/a/detail/1">{t("common.actions.view")}</ActionLink>').length, 0);
  assert.deepEqual(issues('<ActionLink icon={<EyeOutlined />} to="/a/detail/1">{t("common.vocab.detail")}</ActionLink>'), []);
  assert.deepEqual(issues('<ActionLink variant="name" icon={<LinkOutlined />} to="/b/detail/2">{row.pool}</ActionLink>'), []);
});


test("尺寸 token 刻度：间距 / 圆角 / 控件高度取 4 的倍数，结构宽度取 20 的倍数", () => {
  for (const [name, value] of [["--ds-space-2", "2px"], ["--ds-space-12", "12px"], ["--ds-radius-xs", "4px"], ["--ds-control-height", "36px"], ["--ds-layout-header-height", "60px"], ["--ds-radius-choice-inner", "var(--ds-radius-xs)"], ["--ds-color-text", "#000"]]) {
    assert.equal(sizeTokenScaleIssue(name, value), null, name);
  }
  for (const [name, value] of [["--ds-radius-sm", "6px"], ["--ds-radius-choice-inner", "5px"], ["--ds-space-10", "10px"], ["--ds-space-4", "2px"], ["--ds-layout-dialog-width", "730px"]]) {
    assert.notEqual(sizeTokenScaleIssue(name, value), null, name);
  }
});


test("写失败保留原始错误：直接/别名/namespace 与局部 message 提取不能绕过过滤", () => {
  const failures = (source) => inspectSource(source, "/src/pages/X.tsx")
    .filter((issue) => issue.rule === "FRONTEND-FEEDBACK" && issue.message.includes("提前提取 message"));
  const header = 'import { notifyActionFailed as fail } from "@/utils/feedback";';
  for (const statement of [
    'fail("save", error.message);',
    'fail("save", error["message"]);',
    'fail("save", String(error.message));',
    'fail("save", new Error(error.message));',
    'const reason = error.message; const copy = reason; fail("save", copy);',
    'const { message: reason } = error; fail("save", reason);',
  ]) assert.equal(failures(`${header} const save = (error) => { ${statement} };`).length, 1, statement);
  assert.equal(failures('import * as feedback from "@/utils/feedback"; const save = (error) => feedback.notifyActionFailed("save", `${error.message}`);').length, 1);
  for (const statement of [
    'fail("save", error);',
    'fail("save", extractRequestErrorMessage(error, "fallback"));',
    'fail("save", "本地校验失败");',
    'const reason = { message: "业务拒绝", status: 403 }; fail("save", reason);',
    'const reason = "本地校验失败"; fail("save", reason);',
  ]) assert.deepEqual(failures(`${header} const save = (error) => { ${statement} };`), [], statement);
  assert.deepEqual(failures(`${header} function local(fail, error) { fail("save", error.message); }`), []);
});


test("筛选空值哨兵覆盖翻译标签、别名、变量与 spread，作用域不得伪造不限", () => {
  const issues = (source) => inspect(source).filter((issue) => issue.message.includes("哨兵"));
  for (const source of [
    'const options = [{value:"",label:t("common.vocab.all")}];',
    'import {FilterSelect as Picker} from "@/components/ui"; const value=""; const base={value,label:t("other.caption")}; const options=[{...base}]; <Picker kind="enum" options={options}/>;',
    'import * as UI from "@/components/ui"; const base=[{value:"",label:"ignored"}]; <UI.FilterSelect kind="scope" options={[...base]}/>;',
  ]) assert.ok(issues(source).length > 0, source);
  assert.deepEqual(issues('import {FilterSelect} from "@/components/ui"; const options=[{value:"all-products",label:"所有产品系列"}]; <FilterSelect kind="enum" options={options}/>;'), []);
});

test("scope 必须有真实 required 校验，远程实体候选不能以 pair 降为单选", () => {
  const issues = (source) => inspect(source).filter((issue) => issue.rule === "FRONTEND-TABLE");
  assert.ok(issues('import {FilterSelect} from "@/components/ui"; <FilterSelect kind="scope" options={opts}/>;').length);
  assert.ok(issues('import {Form} from "antd"; import {FilterSelect} from "@/components/ui"; <Form.Item required><FilterSelect kind="scope" options={opts}/></Form.Item>;').length);
  assert.deepEqual(issues('import {Form as Fields} from "antd"; import {FilterSelect as Picker} from "@/components/ui"; const rules=[{required:true}]; <Fields.Item rules={rules}><Picker kind="scope" options={opts}/></Fields.Item>;'), []);
  assert.ok(issues('import {FilterSelect} from "@/components/ui"; <FilterSelect kind="pair" options={[]} loadOptions={load}/>;').some((issue) => issue.message.includes("远程候选")));
});

test("可清空门禁识别原生子组件、命名别名和 namespace，静态 spread 不能覆盖", () => {
  const issues = (source) => inspect(source).filter((issue) => issue.message.includes("allowClear"));
  for (const source of [
    'import {DatePicker as Calendar} from "antd"; <Calendar.RangePicker/>;',
    'import * as Ant from "antd"; <Ant.Input.TextArea/>;',
    'import {Input} from "antd"; const {Password: Secret}=Input; <Secret/>;',
    'import {Select as Picker} from "antd"; <Picker allowClear {...runtime}/>;',
  ]) assert.ok(issues(source).length, source);
  assert.deepEqual(issues('import {DatePicker} from "antd"; const options={allowClear:true}; <DatePicker.RangePicker {...options}/>;'), []);
  assert.deepEqual(issues('function Input(){return null} <Input/>;'), []);
});

test("可选查询不能关闭清空，也不能通过原生 Select 别名绕过共享选型", () => {
  const issues = (source) => inspect(source).filter((issue) => issue.rule === "FRONTEND-TABLE");
  for (const source of [
    'import {Input} from "antd"; import {QueryForm as Query} from "@/components/ui"; <Query><Input allowClear={false}/></Query>;',
    'import {Select as Picker} from "antd"; import * as UI from "@/components/ui"; <UI.QueryForm><Picker allowClear/></UI.QueryForm>;',
  ]) assert.ok(issues(source).length, source);
  assert.deepEqual(issues('import {Input} from "antd"; import {QueryForm} from "@/components/ui"; <QueryForm><Input allowClear/></QueryForm>;'), []);
});


test("表格对齐独立于列宽，必须引用真实共享用途，可使用导入别名", () => {
  const column = (source) => inspect(source).filter(issue => issue.message.includes("列对齐统一左对齐") || issue.message.includes("数值标度列须使用共享"));
  assert.ok(column('const cols = [{ title: name, dataIndex: "rate", width: columnWidth.badge, align: "center" }]').length > 0);
  assert.ok(column('const cols = [{ title: name, dataIndex: "amount", align: "right" }]').length > 0);
  assert.ok(column('import {columnWidth} from "@/components/ui"; const cols = [{ title: name, dataIndex: "amount", width: columnWidth.number }]').length > 0);
  assert.deepEqual(column('import {columnAlign as alignment} from "@/components/ui"; const cols = [{ title: name, dataIndex: "amount", width: columnWidth.badge, align: alignment.number }];'), []);
  assert.deepEqual(column('import {columnAlign} from "@/components/ui"; const cols = [{ title: name, dataIndex: "version", width: columnWidth.number, align: columnAlign.text }];'), []);
  assert.ok(column('const columnAlign = {number:"center"}; const cols = [{title: name, dataIndex: "amount", align: columnAlign.number}]').length > 0);
});

test("列对齐共享引用不能被局部参数遮蔽", () => {
  const source = 'import {columnAlign as alignment} from "@/components/ui"; function columns(alignment) { return [{title:name,dataIndex:"amount",align:alignment.number}]; }';
  assert.ok(inspect(source).some(issue => issue.message.includes("列对齐统一左对齐")));
});

test("数值标度列对齐检查识别导入别名", () => {
  assert.ok(inspect('import {columnWidth as widths} from "@/components/ui"; const cols=[{title:name,dataIndex:"amount",width:widths.number}];').some(issue => issue.message.includes("数值标度列须使用共享")));
});

test("状态文案追踪别名和局部变量，保留真实状态与同名遮蔽", () => {
  const issues = source => inspectSource(source, "/src/pages/Demo/columns.tsx").filter(item => item.message.includes("状态标签写状态"));
  assert.equal(issues('import { StatusTag as State } from "@/components/ui"; import { useTranslation } from "react-i18next"; function X(){const {t:translate}=useTranslation(); const key="common.actions.disable"; const text=ok?translate(key):translate("common.vocab.enabled"); return <State>{text}</State>;}').length, 1);
  assert.equal(issues('const text=t("common.actions.disable"); const alias=text; const view=<StatusTag>{alias}</StatusTag>;').length, 1);
  assert.deepEqual(issues('const text=t("common.vocab.disabled"); const view=<StatusTag>{text}</StatusTag>;'), []);
  assert.deepEqual(issues('function X(){const t=(value)=>value; const label=t("common.actions.disable"); return <StatusTag>{label}</StatusTag>;}'), []);
  assert.deepEqual(issues('function StatusTag(){return null;} const view=<StatusTag>{t("common.actions.disable")}</StatusTag>;'), []);
});


test("已登记实体筛选和关联列不可退回填空或纯文本，识别导入别名", () => {
  const filter = {file: "src/pages/EntityTest/index.tsx", names: ["owners"]};
  const reference = {file: "src/pages/EntityTest/columns.tsx", names: ["owner"]};
  const query = (child) => `import {Form as F, Input} from "antd"; import {QueryForm as Q, FilterSelect as S} from "@/components/ui"; <Q><F.Item name="${filter.names[0]}">${child}</F.Item></Q>`;
  const issues = (child) => inspectSource(query(child), "/"+filter.file, {entityFilterFields: [filter]}).filter(i => i.message.includes("已登记实体筛选"));
  assert.equal(issues('<Input allowClear />').length, 1);
  assert.equal(inspectSource(query('<Input allowClear />').replace('name="owners"', 'name="owners" data-filter-purpose="keyword"'), "/"+filter.file, {entityFilterFields: [filter]}).filter(i => i.message.includes("已登记实体筛选")).length, 1);
  assert.equal(issues('<S kind="pair" options={opts} />').length, 1);
  assert.deepEqual(issues('<S kind="enum" options={[]} loadOptions={load} />'), []);
  assert.deepEqual(issues('<S {...{kind: "enum", options: []}} />'), []);
  const column = (render) => `import {ActionLink as A} from "@/components/ui"; const columns = [{title: t("x"), dataIndex: "${reference.names[0]}", render: () => ${render}}];`;
  const linked = (render) => inspectSource(column(render), "/"+reference.file, {entityReferenceColumns: [reference]}).filter(i => i.message.includes("已登记关联字段"));
  assert.equal(linked('<span>value</span>').length, 1);
  assert.deepEqual(linked('<A to="/detail/x" icon={<LinkOutlined />}>value</A>'), []);
});

test("滚动条可见尺寸只由共享入口维护", () => {
  assert.equal(inspectCss('.x { scrollbar-width: thin; }', { filename: '/src/pages/X/style.css' }).filter(issue => issue.message.includes('scrollbar.css')).length, 1);
  assert.deepEqual(inspectCss('* { scrollbar-width: thin; }', { filename: '/src/components/ui/scrollbar.css' }).filter(issue => issue.message.includes('scrollbar.css')), []);
});

test("操作列必须声明 action 键并置于末尾，固定位置由共享层接管", () => {
  const prefix = 'import { columnWidth } from "@/components/ui"; ';
  const check = (value) => inspect(prefix + value).filter((issue) => issue.rule === "FRONTEND-TABLE");
  assert.notEqual(check('const c=[{title:"名称",dataIndex:"name"},{title:"动作",width:columnWidth.actions(2),render:()=>null}];').length, 0);
  assert.notEqual(check('const c=[{title:"动作",key:"action",width:columnWidth.actions(2),render:()=>null},{title:"名称",dataIndex:"name"}];').length, 0);
  assert.deepEqual(check('const c=[{title:"名称",dataIndex:"name"},{title:"动作",key:"action",width:columnWidth.actions(2),render:()=>null}];'), []);
});

test("全域查询字段绑定真实列与文案，识别抽出字段组件且不存在的列不能通过", async () => {
  const { inspectQueryFieldBindings } = await import("./query-field-governance.mjs");
  const column = { filename: "src/pages/Test/columns.tsx", source: 'const cols=[{title:t("common.vocab.name"),dataIndex:"nickname"}];' };
  const field = (attributes = '', control = '<Input allowClear />') => `import {Form as F,Input} from "antd"; import {QueryForm as Q,FilterSelect} from "@/components/ui"; <Q><F.Item name="nickname" label={t("common.vocab.name")} ${attributes}>${control}</F.Item></Q>`;
  const inspect = (source, extra = []) => inspectQueryFieldBindings([{filename:"src/pages/Test/index.tsx", source}, column, ...extra]);
  assert.equal(inspect(field()).length, 1);
  assert.deepEqual(inspect(field('data-filter-column="./columns#nickname" data-filter-purpose="keyword"')), []);
  assert.equal(inspect(field('data-filter-column="./columns#absent" data-filter-purpose="keyword"')).length, 1);
  assert.equal(inspect(field('data-filter-column="./columns#nickname" data-filter-purpose="keyword"').replace('label={t("common.vocab.name")}', 'label={t("common.vocab.nickname")}')).length, 1);
  assert.equal(inspect(field('data-filter-column="./columns#nickname" data-filter-purpose="identifier"')).length, 1);
  assert.equal(inspect(field('data-filter-column="./columns#nickname" data-filter-purpose="keyword"','<FilterSelect kind="enum" options={[]} />')).length, 1);
  // 绑定列的任何用途（含 keyword/range）都必须与列同文案键
  assert.equal(inspect(field('data-filter-column="./columns#nickname" data-filter-purpose="range"').replace('label={t("common.vocab.name")}', 'label={t("common.vocab.dateRange")}')).length, 1);
  assert.equal(inspect(field('data-filter-column="./columns#nickname" data-filter-purpose="keyword" name2="x"').replace('name="nickname"', 'name="keyword"').replace('label={t("common.vocab.name")}', 'label={t("common.vocab.dateRange")}')).length, 1);
  // 跨字段关键词不绑列时标签必须统一 common.vocab.search
  assert.deepEqual(inspect(field('data-filter-purpose="keyword"').replace('label={t("common.vocab.name")}', 'label={t("common.vocab.search")}')), []);
  assert.equal(inspect(field('data-filter-purpose="keyword"').replace('label={t("common.vocab.name")}', 'label={t("pages.test.customSearch")}')).length, 1);
  assert.equal(inspect(field('data-filter-purpose="keyword"','<FilterSelect kind="enum" options={[]} />').replace('label={t("common.vocab.name")}', 'label={t("common.vocab.search")}')).length, 1);
  const component = {filename:"src/pages/Test/Fields.tsx",source:'import {Form,Input} from "antd"; export function Fields(){return <Form.Item name="x"><Input allowClear /></Form.Item>}'};
  assert.equal(inspect('import {QueryForm} from "@/components/ui"; import {Fields} from "./Fields"; <QueryForm><Fields/></QueryForm>', [component]).length, 1);
  assert.deepEqual(inspectQueryFieldBindings([{filename:"src/pages/Test/index.tsx",source:'import {Form,Input} from "antd"; <Form><Form.Item name="nickname"><Input allowClear /></Form.Item></Form>'}]), []);
});

test("懒加载必须套共享 LazyBoundary，声明注册表豁免", async () => {
  const { inspectSource } = await import("./design-governance.mjs");
  assert.equal(inspectSource('import {lazy} from "react"; const P = lazy(() => import("./X"));', "/src/pages/Test/index.tsx").filter(i => i.message.includes("LazyBoundary")).length, 1);
  assert.deepEqual(inspectSource('import {lazy} from "react"; import {LazyBoundary} from "@/components/ui"; const P = lazy(() => import("./X"));', "/src/pages/Test/index.tsx"), []);
  assert.deepEqual(inspectSource('import {lazy} from "react"; export const P = lazy(() => import("./X"));', "/src/routes/pages.ts"), []);
  assert.deepEqual(inspectSource('import {lazyRoute} from "./lazyRoute"; const e = lazyRoute(P);', "/src/routes/index.tsx"), []);
});


test("固定表头背景必须使用不透明的表格表面色", () => {
  const theme = header => `const theme = { components: { Menu: {}, Table: { headerBg: ${header} } } };`;
  assert.deepEqual(inspectAntThemeMapping(theme("token.color.surface")), []);
  for (const header of ['"transparent"', '"rgba(255, 255, 255, 0.5)"', "token.color.surfaceMuted"]) {
    assert.ok(inspectAntThemeMapping(theme(header)).some(issue => issue.rule === "FRONTEND-TABLE"));
  }
});

test("外部固定排序 ID 列仅允许登记字段和指定列文件，注释不能绕过", () => {
  const source='const columns=[{title:t("common.vocab.id"),dataIndex:"id"}];';
  const contract={page:'src/pages/External/index.tsx',columns:'src/pages/External/columns.tsx',service:'src/services/catalog.ts',request:'getList',endpoint:'/api/catalog/v1/list',field:'id',order:'descend',interactive:false,reason:'用户限定外部接口不改，固定ID倒序'};
  const issues=(file=contract.columns,meta=contract,text=source)=>inspectSource(text,`/${file}`,{externalFixedOrderTables:[meta]}).filter(i=>i.message.includes('自增 ID'));
  assert.deepEqual(issues(),[]);
  assert.ok(issues('src/pages/Other/columns.tsx').length);
  assert.ok(issues(contract.columns,{...contract,field:'other'}).length);
  assert.ok(issues(contract.columns,{...contract,order:'ascend'}).length);
  assert.ok(issues(contract.columns,{...contract,interactive:true}).length);
  assert.ok(issues(contract.columns,{...contract,reason:''}).length);
  assert.ok(issues(contract.columns,contract,source.replace('dataIndex:"id"','dataIndex:"hidden"')).length);
  assert.ok(inspectSource('// 外部接口固定ID倒序\n'+source,'/src/pages/Other/columns.tsx').some(i=>i.message.includes('自增 ID')));
});
