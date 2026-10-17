import { readFileSync } from "node:fs";
import nodePath from "node:path";
import postcss from "postcss";
import ts from "typescript";
import { resolveNested } from "./i18n-nesting.mjs";

/**
 * 门禁引擎里唯一与本项目领域绑定的参数（服务层模块名、信息架构页面、超大候选集接口等）。
 * 引擎规则本身对任何项目通用；换项目只改这份配置，不改引擎。
 */
const project = JSON.parse(readFileSync(new URL("./design-system.project.json", import.meta.url), "utf8"));
const escapeForRegExp = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const SERVICES_MODULE = new RegExp(`^${escapeForRegExp(project.servicesModule)}(?:/|$)|^\\./service$`);

const RAW_COLOR_SYNTAX = /#[\da-f]{3,8}\b|(?:^|[^\w-])(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch|color|color-mix|device-cmyk|light-dark|contrast-color)\s*\(/i;
const CSS_NAMED_COLORS = new Set(`
  aliceblue antiquewhite aqua aquamarine azure beige bisque black blanchedalmond blue blueviolet brown burlywood
  cadetblue chartreuse chocolate coral cornflowerblue cornsilk crimson cyan darkblue darkcyan darkgoldenrod darkgray
  darkgreen darkgrey darkkhaki darkmagenta darkolivegreen darkorange darkorchid darkred darksalmon darkseagreen
  darkslateblue darkslategray darkslategrey darkturquoise darkviolet deeppink deepskyblue dimgray dimgrey dodgerblue
  firebrick floralwhite forestgreen fuchsia gainsboro ghostwhite gold goldenrod gray green greenyellow grey honeydew
  hotpink indianred indigo ivory khaki lavender lavenderblush lawngreen lemonchiffon lightblue lightcoral lightcyan
  lightgoldenrodyellow lightgray lightgreen lightgrey lightpink lightsalmon lightseagreen lightskyblue lightslategray
  lightslategrey lightsteelblue lightyellow lime limegreen linen magenta maroon mediumaquamarine mediumblue mediumorchid
  mediumpurple mediumseagreen mediumslateblue mediumspringgreen mediumturquoise mediumvioletred midnightblue mintcream
  mistyrose moccasin navajowhite navy oldlace olive olivedrab orange orangered orchid palegoldenrod palegreen
  paleturquoise palevioletred papayawhip peachpuff peru pink plum powderblue purple rebeccapurple red rosybrown
  royalblue saddlebrown salmon sandybrown seagreen seashell sienna silver skyblue slateblue slategray slategrey snow
  springgreen steelblue tan teal thistle tomato turquoise violet wheat white whitesmoke yellow yellowgreen
`.trim().split(/\s+/));
const CSS_SYSTEM_COLORS = new Set(`
  accentcolor accentcolortext activetext buttonborder buttonface buttontext canvas canvastext field fieldtext graytext
  highlight highlighttext linktext mark marktext selecteditem selecteditemtext visitedtext activeborder activecaption
  appworkspace background buttonhighlight buttonshadow captiontext inactiveborder inactivecaption inactivecaptiontext
  infobackground infotext menu menutext scrollbar threeddarkshadow threedface threedhighlight threedlightshadow
  threedshadow window windowframe windowtext
`.trim().split(/\s+/));
const RAW_LENGTH = /(?<![\w-])-?\d*\.?\d+(?:px|r?em|pt|pc|cm|mm|q|in|r?ex|r?ch|cap|ic|r?lh|[sld]?v(?:w|h|i|b|min|max)|cq(?:w|h|i|b|min|max))(?![\w-])/i;
const DIMENSION_PROPERTY = /^(?:font|fontSize|borderRadius|border(?:Top|Bottom)(?:Left|Right)Radius|(?:margin|padding)(?:Top|Bottom|Left|Right|Inline|Block|InlineStart|InlineEnd|BlockStart|BlockEnd)?|gap|rowGap|columnGap)$/;
const MARGIN_PROPERTY = /^margin(?:Top|Bottom|Left|Right|Inline|Block|InlineStart|InlineEnd|BlockStart|BlockEnd)?$/;
const CSS_DIMENSION_PROPERTY = /^(?:font|font-size|border(?:-(?:(?:top|bottom)-(?:left|right)|(?:start|end)-(?:start|end)))?-radius|(?:(?:row|column)-)?gap|(?:margin|padding)(?:-(?:top|right|bottom|left|inline|block)(?:-(?:start|end))?)?)$/i;
const CSS_MARGIN_PROPERTY = /^margin(?:-(?:top|right|bottom|left|inline|block)(?:-(?:start|end))?)?$/i;
const CSS_NEGATIVE_EXPRESSION = /(?<![\w-])-\s*(?:\d*\.?\d+|var\(|@[\w-]+)/i;
const COLOR_PROPERTY = /^(?:(?:[a-z][a-z\d]*-)*color|fill|stroke|background(?:-image)?|border(?:-(?:top|right|bottom|left|block|inline|block-start|block-end|inline-start|inline-end))?|border-image(?:-source)?|outline|column-rule|text-decoration|text-emphasis|text-stroke|(?:text|box)-shadow|filter|mask(?:-box)?(?:-image)?|mask-border(?:-source)?|list-style(?:-image)?)$/;
const LEGACY_VIEWPORT_HEIGHT = /(?<![a-z])(?:\d*\.?\d+)vh\b/i;
const VIEWPORT_HEIGHT_PROPERTY = new Set(["height", "minHeight", "maxHeight", "blockSize", "minBlockSize", "maxBlockSize"]);
const GOVERNED_COMPONENTS = new Set(["Tooltip", "Tabs", "Segmented", "Descriptions", "Spin", "Empty", "Tag", "Badge", "List"]);
const DEPRECATED_ANT_COMPONENTS = new Set(["List"]);
const REVIEWED_UI_RAW_EXPORTS = new Set(["Descriptions"]);
const GOVERNED_PUBLIC_UI = new Set([
  "AppPage", "AtomicValue", "InlineList", "AppEmpty", "LoadingIndicator", "LoadingOverlay", "LoadingState",
  "QueryErrorAlert", "QueryFeedback", "TableQueryBoundary", "InformationFieldGrid", "IconButton", "ContentStack", "PageStack",
  "SectionHeader", "ResponsiveTabs", "ResponsiveActions", "DataTable", "QueryForm", "ModalForm",
  "SearchInput", "ScrollRegion", "SummaryStrip", "Tooltip", "ViewSwitch", "MetadataTag", "StatusTag", "DrawerForm", "Popconfirm",
  "FilterSelect", "TablePanel", "SecondarySection",
]);
const TABLE_PAGINATION_OPTION_KEYS = new Set(["current", "pageSize", "total", "onChange", "onShowSizeChange", "disabled"]);
/** 第二套通用组件体系：其他设计系统，以及已整体退役的 Ant Design Pro（布局/页容器/表单壳全部由 components/ui 基于 antd 实现）。 */
const SECOND_COMPONENT_SYSTEM = /^(?:@ant-design\/pro-|@mui\/|@chakra-ui\/|@mantine\/|@radix-ui\/|@headlessui\/|@primer\/|@fluentui\/|@carbon\/|bootstrap$|react-bootstrap$|primereact$|semantic-ui-react$)/;
/** 危险按钮是否处于二次确认上下文：唯一形式是 Popconfirm 祖先（居中弹窗式确认已整体退役）。 */
function dangerButtonConfirmed(node) {
  for (let current = node.parent; current; current = current.parent) {
    if (ts.isJsxElement(current) && ts.isIdentifier(current.openingElement.tagName)
      && current.openingElement.tagName.text === "Popconfirm") return true;
  }
  return false;
}

/** 业务层按钮 style 里不允许出现的几何键（内边距、高度、字号、行高、最小宽高）。 */
const BUTTON_GEOMETRY_STYLE_KEYS = /^(?:padding(?:Inline|Block|Top|Right|Bottom|Left|InlineStart|InlineEnd|BlockStart|BlockEnd)?|height|minHeight|maxHeight|minWidth|fontSize|lineHeight)$/;

/** 命令式弹窗方法：静态 Modal.x 拿不到主题上下文（暗色下出现白底弹窗），App 实例 modal.x 也不再作为确认形式。 */
const IMPERATIVE_MODAL_METHODS = new Set(["confirm", "info", "success", "error", "warning", "warn"]);

/** 节点是否位于表格列的 render（columns 里的 render 属性，或名为 renderXxxCell 的单元格渲染函数）之内。 */
function isInsideCellRenderer(node, sourceFile) {
  for (let current = node.parent; current && !ts.isSourceFile(current); current = current.parent) {
    if (ts.isPropertyAssignment(current) && current.name.getText(sourceFile) === "render") return true;
    if (ts.isVariableDeclaration(current) && /^render\w*Cell$/.test(current.name.getText(sourceFile))) return true;
  }
  return false;
}

/** JSX 节点是否位于给定标签名的元素之内（按开标签的简单标识符匹配）。 */
function hasJsxAncestorNamed(node, tagName) {
  for (let current = node.parent; current; current = current.parent) {
    if (ts.isJsxElement(current) && ts.isIdentifier(current.openingElement.tagName)
      && current.openingElement.tagName.text === tagName) return true;
  }
  return false;
}

/** 间距角色：page 24 / block 16 / control 8 / tight 4，对应 designTokens.space 的 xl / lg / sm / xs。 */
const ROLE_SPACING_KEYS = new Set(["xl", "lg", "sm", "xs"]);

function isZeroDimension(node) {
  const text = node.getText().trim().replace(/^["'`]|["'`]$/g, "");
  return /^0(?:px)?$/.test(text) || /^(?:0(?:px)?\s+)+0(?:px)?$/.test(text);
}

/** 表达式里是否静态地出现了非角色档位的间距 token（12/2/32/40 档），运行时值不在此判定。 */
function isRoleSpacingToken(node) {
  const text = node.getText();
  return !/\.space\.(?:md|xxs|xxl|xxxl)\b/.test(text) && !/--ds-space-(?:2|12|32|40)\b/.test(text);
}

/** 通知反馈（FRONTEND-FEEDBACK）：只有用户发起的写操作能弹通知；加载、派生、渲染与服务层不得弹。 */
const FEEDBACK_ENTRY_NAMES = new Set(["notifyActionSuccess", "notifyActionFailed", "notifyWarning"]);
const FEEDBACK_LOAD_HOOKS = new Set(["useEffect", "useLayoutEffect", "useInsertionEffect", "useMemo"]);
const FEEDBACK_ALLOWED_RAW_FILES = /\/src\/(?:utils\/feedback\.ts|utils\/antdStatic\.ts|App\.tsx)$/;
function isAnyFunctionNode(node) {
  return ts.isFunctionDeclaration(node) || ts.isFunctionExpression(node) || ts.isArrowFunction(node) || ts.isMethodDeclaration(node);
}
function calleeName(call) {
  const expression = call.expression;
  if (ts.isIdentifier(expression)) return expression.text;
  if (ts.isPropertyAccessExpression(expression)) return expression.name.text;
  return undefined;
}
/** 函数节点是否为 React 组件本体：模块级 PascalCase 函数或 const 箭头函数。 */
function isComponentFunction(fn) {
  if (ts.isFunctionDeclaration(fn)) return Boolean(fn.name && /^[A-Z]/.test(fn.name.text) && ts.isSourceFile(fn.parent));
  const owner = fn.parent;
  return ts.isVariableDeclaration(owner) && ts.isIdentifier(owner.name) && /^[A-Z]/.test(owner.name.text)
    && ts.isVariableDeclarationList(owner.parent) && ts.isVariableStatement(owner.parent.parent) && ts.isSourceFile(owner.parent.parent.parent);
}
/** 通知调用所处的上下文：返回违规原因，合规返回 undefined。 */
function feedbackCallViolation(call) {
  let node = call.parent;
  let nearestFunction;
  while (node && !ts.isSourceFile(node)) {
    if (isAnyFunctionNode(node)) {
      nearestFunction ??= node;
      const owner = node.parent;
      if (ts.isCallExpression(owner) && owner.arguments.includes(node)) {
        const name = calleeName(owner);
        if (name && FEEDBACK_LOAD_HOOKS.has(name)) return `禁止在 ${name} 里弹通知：加载与派生路径不产生通知，读取失败用 QueryErrorAlert 内联展示`;
        if (name === "useRequest" && owner.arguments[0] === node) return "禁止在 useRequest 的读取函数里弹通知：读取失败由 QueryErrorAlert 内联展示";
      }
      if (isComponentFunction(node) && nearestFunction === node) return "禁止在组件渲染阶段弹通知：通知只能由用户动作处理函数触发";
    }
    node = node.parent;
  }
  if (!nearestFunction) return "禁止在模块顶层弹通知：通知只能由用户动作处理函数触发";
  return undefined;
}

/** 图表 option 里只能由共享主题设置的外观属性。 */
const CHART_THEME_ONLY_PROPERTY = new Set([
  "textStyle", "fontSize", "fontFamily", "fontWeight", "backgroundColor", "borderColor", "borderWidth", "borderRadius",
  "axisLine", "axisTick", "splitLine", "splitArea", "shadowBlur", "shadowColor", "itemWidth", "itemHeight", "icon",
  "nodeWidth", "nodeGap", "barMaxWidth", "symbol", "smooth", "curveness", "extraCssText",
]);
/** 动作 → 图标的唯一对应（同一动作全站同一图标）；键为 common.actions 的动作名。 */
const ACTION_ICON_BY_NAME = {
  create: "PlusOutlined", add: "PlusOutlined", edit: "EditOutlined", delete: "DeleteOutlined", save: "SaveOutlined",
  cancel: "CloseOutlined", close: "CloseOutlined", query: "SearchOutlined", search: "SearchOutlined", refresh: "ReloadOutlined",
  retry: "ReloadOutlined", reset: "ClearOutlined", export: "DownloadOutlined", upload: "UploadOutlined", sync: "SyncOutlined",
  enable: "CheckCircleOutlined", disable: "StopOutlined", copy: "CopyOutlined", send: "SendOutlined", clone: "CopyOutlined",
  publish: "SendOutlined", unpublish: "StopOutlined", clear: "ClearOutlined", update: "EditOutlined", revert: "RollbackOutlined",
};
/** 只能出现在危险按钮（color="danger"）上的图标：删除、禁用/下线、重置/清空。 */
const DANGER_ICONS = new Set(["DeleteOutlined", "StopOutlined", "ClearOutlined"]);
/** 共享主题里按系列类型设默认值的键。 */
const CHART_SERIES_TYPES = new Set(["line", "bar", "pie", "scatter", "effectScatter", "heatmap", "treemap", "sankey", "graph", "funnel", "gauge", "radar", "boxplot", "candlestick"]);
/** 图表不提供的交互能力。 */
const CHART_FORBIDDEN_FEATURE = new Set(["dataZoom", "toolbox", "roam", "zoom", "draggable", "brush"]);

/** 与 grid 同级的 xAxis/yAxis 是否都声明了 show: false（无轴迷你图）。 */
function axesHidden(gridProperty, sourceFile) {
  const option = gridProperty.parent;
  if (!option || !ts.isObjectLiteralExpression(option)) return false;
  const axes = option.properties.filter((item) => ts.isPropertyAssignment(item) && /^[xy]Axis$/.test(propertyName(item, sourceFile) ?? ""));
  if (!axes.length) return false;
  return axes.every((axis) => ts.isObjectLiteralExpression(axis.initializer)
    && axis.initializer.properties.some((item) => ts.isPropertyAssignment(item) && propertyName(item, sourceFile) === "show" && item.initializer.kind === ts.SyntaxKind.FalseKeyword));
}
/** 按钮对应的裸动作名：子节点或 label 属性里第一个 t("common.actions.<x>") / 模板 common.actionObjectTemplates.<x> 的 x。 */
function actionKeyOfButton(opening, sourceFile) {
  const texts = [];
  const labelAttr = opening.attributes.properties.find((item) => ts.isJsxAttribute(item) && item.name.getText(sourceFile) === "label");
  if (labelAttr) texts.push(labelAttr.getText(sourceFile));
  const parent = opening.parent;
  if (ts.isJsxElement(parent) && parent.openingElement === opening) texts.push(parent.children.map((child) => child.getText(sourceFile)).join(" "));
  const joined = texts.join(" ");
  const match = /common\.(?:actions|actionObjectTemplates)\.([a-zA-Z]+)"/.exec(joined);
  return match ? match[1] : undefined;
}
/** 属性是否位于 xAxis/yAxis 配置对象内。 */
function isInsideAxisOption(node, sourceFile) {
  for (let ancestor = node.parent; ancestor && !ts.isSourceFile(ancestor); ancestor = ancestor.parent) {
    if (ts.isPropertyAssignment(ancestor)) {
      const name = propertyName(ancestor, sourceFile);
      if (name === "xAxis" || name === "yAxis") return true;
      if (name === "series" || name === "tooltip" || name === "legend") return false;
    }
  }
  return false;
}
/** 所在 option 对象字面量里是否声明了 legend。 */
function optionHasLegend(node, sourceFile) {
  for (let ancestor = node.parent; ancestor && !ts.isSourceFile(ancestor); ancestor = ancestor.parent) {
    if (ts.isObjectLiteralExpression(ancestor)
      && ancestor.properties.some((item) => ts.isPropertyAssignment(item) && propertyName(item, sourceFile) === "legend")) {
      // 纯散点图图例说明实体分类，不能代替横纵轴各自的量纲；两轴仍需名称。
      const series = ancestor.properties.find((item) => ts.isPropertyAssignment(item) && propertyName(item, sourceFile) === "series");
      const types = [];
      const collect = (child) => {
        if (ts.isPropertyAssignment(child) && propertyName(child, sourceFile) === "type" && ts.isStringLiteralLike(child.initializer)) types.push(child.initializer.text);
        ts.forEachChild(child, collect);
      };
      if (series) collect(series.initializer);
      return !(types.length > 0 && types.every((type) => type === "scatter"));
    }
  }
  return false;
}
/** 属性是否位于 ECharts option 的组件/系列对象内（tooltip/legend/series/xAxis/…）。 */
const CHART_OPTION_ROOTS = new Set(["series", "tooltip", "legend", "xAxis", "yAxis", "grid", "visualMap", "dataset", "axisPointer", "toolbox", "dataZoom", "radar", "polar", "textStyle"]);
function isInsideChartOption(node, sourceFile) {
  for (let current = node.parent; current; current = current.parent) {
    if (ts.isPropertyAssignment(current) && CHART_OPTION_ROOTS.has(propertyName(current, sourceFile) ?? "")) return true;
    if (ts.isJsxAttribute(current) || ts.isCallExpression(current) && !ts.isPropertyAccessExpression(current.expression)) continue;
  }
  return false;
}

function isFunctionLike(node) {
  return ts.isArrowFunction(node) || ts.isFunctionExpression(node);
}

/** 属性是否位于 tooltip: { … } 对象内（含系列级 tooltip）。 */
function isInsideTooltipOption(node, sourceFile) {
  for (let current = node.parent; current; current = current.parent) {
    if (ts.isPropertyAssignment(current) && propertyName(current, sourceFile) === "tooltip") return true;
    if (ts.isCallExpression(current) || ts.isFunctionLike(current)) return false;
  }
  return false;
}

/** color: PALETTE[index % PALETTE.length] 之类的循环取色。 */
function isCyclingPaletteIndex(node, sourceFile) {
  const text = node.getText(sourceFile);
  return /\[\s*[^\]]*%\s*[^\]]*\.length\s*\]/.test(text);
}

/** 支持一键清除的输入控件;InputNumber 在 antd v6 无 allowClear,不参与。 */
const CLEARABLE_INPUT_TAGS = new Set(["Input", "Select", "AutoComplete", "DatePicker", "TreeSelect", "Search", "Mentions", "TimePicker", "Cascader"]);

/** Ant 预设色板名：不受设计标度管理、不随语义角色变化，业务层禁止。 */
const ANT_PRESET_COLOR = /^(?:red|volcano|orange|gold|yellow|lime|green|cyan|blue|geekblue|purple|magenta|pink)$/;

/** 唯一样式方案是同目录 CSS + `--ds-*` 变量，禁止 CSS-in-JS 运行时库与预处理器依赖。 */
const SECOND_STYLE_SYSTEM = /^(?:antd-style|styled-components|@emotion\/styled|linaria|@vanilla-extract\/|@stitches\/|sass|less)$/;
const CSS_FONT_FAMILY_TOKEN = /^var\(\s*--ds-font-family-(?:body|code)\s*\)$/i;

function propertyName(node, sourceFile) {
  return node.name && (ts.isIdentifier(node.name) || ts.isStringLiteralLike(node.name))
    ? node.name.text
    : node.name?.getText(sourceFile).replaceAll(/["']/g, "");
}

function normalizedPropertyName(name) {
  return name.replaceAll("_", "-").replaceAll(/([a-z\d])([A-Z])/g, "$1-$2").toLowerCase();
}

function isColorProperty(name) {
  return COLOR_PROPERTY.test(normalizedPropertyName(name).replace(/^-?(?:webkit|moz|ms|o)-/, ""));
}

function containsRawColor(value) {
  const colorValue = value
    .replaceAll(/url\(\s*(?:"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|[^)])*\)/gi, " ")
    .replaceAll(/var\(\s*--[\w-]+/gi, "var(");
  if (RAW_COLOR_SYNTAX.test(colorValue)) return true;
  return (colorValue.match(/[a-z][a-z\d-]*/gi) ?? []).some((word) => {
    const normalized = word.toLowerCase();
    return CSS_NAMED_COLORS.has(normalized) || CSS_SYSTEM_COLORS.has(normalized);
  });
}

function containsRawColorExpression(node, sourceFile, staticValues) {
  let found = false;
  function visit(current, seen = new Set()) {
    if (found) return;
    const resolved = staticValues?.resolve(current, seen);
    if (resolved) {
      visit(resolved.expression, resolved.seen);
      return;
    }
    if (RAW_COLOR_SYNTAX.test(current.getText(sourceFile))) {
      found = true;
      return;
    }
    if (ts.isPropertyAccessExpression(current) || ts.isElementAccessExpression(current)) return;
    if (ts.isStringLiteralLike(current) && containsRawColor(current.text)) {
      found = true;
      return;
    }
    ts.forEachChild(current, visit);
  }
  visit(node);
  return found;
}

function containsRawDimension(node, staticValues) {
  let found = false;
  function visit(current, seen = new Set()) {
    if (found) return;
    const resolved = staticValues?.resolve(current, seen);
    if (resolved) {
      visit(resolved.expression, resolved.seen);
      return;
    }
    if (ts.isPropertyAccessExpression(current) || ts.isElementAccessExpression(current)) return;
    if (ts.isNumericLiteral(current) && Number(current.text) !== 0) found = true;
    if (ts.isStringLiteralLike(current) && RAW_LENGTH.test(current.text)) found = true;
    ts.forEachChild(current, (child) => visit(child, seen));
  }
  visit(node);
  return found;
}

function containsUnaryMinus(node) {
  let found = false;
  function visit(current) {
    if (found) return;
    if (
      ts.isPrefixUnaryExpression(current)
      && current.operator === ts.SyntaxKind.MinusToken
    ) {
      found = true;
      return;
    }
    ts.forEachChild(current, visit);
  }
  visit(node);
  return found;
}

function unwrapParentheses(node) {
  let current = node;
  while (current && (
    ts.isParenthesizedExpression(current)
    || ts.isAsExpression(current)
    || ts.isTypeAssertionExpression(current)
    || ts.isSatisfiesExpression(current)
    || ts.isNonNullExpression(current)
  )) current = current.expression;
  return current;
}

function isWithin(node, scope) {
  return scope.pos <= node.pos && node.end <= scope.end;
}

function nearestAncestor(node, predicate) {
  let current = node?.parent;
  while (current) {
    if (predicate(current)) return current;
    current = current.parent;
  }
  return undefined;
}

function declarationScope(owner) {
  if (ts.isParameter(owner)) return owner.parent;
  if (ts.isVariableDeclaration(owner)) {
    if (ts.isCatchClause(owner.parent)) return owner.parent;
    const list = ts.isVariableDeclarationList(owner.parent) ? owner.parent : undefined;
    const blockScoped = list && (list.flags & ts.NodeFlags.BlockScoped) !== 0;
    return nearestAncestor(owner, blockScoped
      ? (node) => ts.isBlock(node) || ts.isSourceFile(node) || ts.isCaseBlock(node) || ts.isForStatement(node) || ts.isForInStatement(node) || ts.isForOfStatement(node)
      : (node) => ts.isFunctionLike(node) || ts.isSourceFile(node));
  }
  if (ts.isFunctionExpression(owner) || ts.isClassExpression(owner)) return owner;
  return owner.parent;
}

function collectBindingDeclarations(sourceFile, controlledNames) {
  const declarations = [];
  function addBinding(name, owner) {
    if (ts.isIdentifier(name)) {
      if (controlledNames.has(name.text)) declarations.push({ name: name.text, node: name, scope: declarationScope(owner) });
      return;
    }
    if (ts.isObjectBindingPattern(name) || ts.isArrayBindingPattern(name)) {
      for (const element of name.elements) if (ts.isBindingElement(element)) addBinding(element.name, owner);
    }
  }
  function visit(node) {
    if (ts.isVariableDeclaration(node) || ts.isParameter(node)) addBinding(node.name, node);
    if ((ts.isFunctionDeclaration(node) || ts.isFunctionExpression(node) || ts.isClassDeclaration(node) || ts.isClassExpression(node)) && node.name) addBinding(node.name, node);
    ts.forEachChild(node, visit);
  }
  visit(sourceFile);
  return declarations.filter((declaration) => declaration.scope);
}

function isImportedReference(node, importedNames, shadowDeclarations) {
  return ts.isIdentifier(node)
    && importedNames.has(node.text)
    && !shadowDeclarations.some((declaration) => declaration.name === node.text && isWithin(node, declaration.scope));
}

function normalizeImportSource(moduleName, filename) {
  let resolved = moduleName;
  if (moduleName.startsWith(".")) resolved = nodePath.posix.resolve(nodePath.posix.dirname(filename.replaceAll("\\", "/")), moduleName);
  resolved = resolved.replace(/\.(?:[cm]?[jt]sx?)$/, "").replace(/\/index$/, "");
  if (resolved === "@/components/ui" || resolved === "/src/components/ui" || resolved.endsWith("/src/components/ui")) return "@/components/ui";
  const uiSegment = resolved.match(/(?:^@|.*\/src)\/components\/ui\/(.+)$/);
  return uiSegment ? `@/components/ui/${uiSegment[1]}` : moduleName;
}

function collectLexicalBindings(sourceFile, filename) {
  const declarations = [];
  function add(name, owner, bindingPath = []) {
    if (ts.isIdentifier(name)) {
      const bindingProperty = bindingPath.length === 1 && bindingPath[0].kind === "property"
        && !ts.isComputedPropertyName(bindingPath[0].node)
        ? bindingPath[0].node.getText(sourceFile).replaceAll(/["']/g, "")
        : undefined;
      declarations.push({ bindingPath, bindingProperty, name: name.text, node: name, owner, scope: declarationScope(owner) });
      return;
    }
    if (ts.isObjectBindingPattern(name) || ts.isArrayBindingPattern(name)) {
      for (const [index, element] of name.elements.entries()) {
        if (!ts.isBindingElement(element)) continue;
        const selector = ts.isObjectBindingPattern(name)
          ? { kind: "property", node: element.propertyName ?? element.name }
          : { index, kind: "index" };
        add(element.name, owner, [...bindingPath, selector]);
      }
    }
  }
  for (const statement of sourceFile.statements) {
    if (!ts.isImportDeclaration(statement) || !statement.importClause || !ts.isStringLiteral(statement.moduleSpecifier)) continue;
    const moduleName = normalizeImportSource(statement.moduleSpecifier.text, filename);
    if (statement.importClause.name) declarations.push({ imported: "default", moduleName, name: statement.importClause.name.text, node: statement.importClause.name, owner: statement, scope: sourceFile });
    const bindings = statement.importClause.namedBindings;
    if (bindings && ts.isNamedImports(bindings)) for (const element of bindings.elements) {
      declarations.push({ imported: (element.propertyName ?? element.name).text, moduleName, name: element.name.text, node: element.name, owner: element, scope: sourceFile });
    }
    if (bindings && ts.isNamespaceImport(bindings)) {
      declarations.push({ imported: "*", moduleName, name: bindings.name.text, node: bindings.name, owner: bindings, scope: sourceFile });
    }
  }
  function visit(node) {
    if (ts.isVariableDeclaration(node) || ts.isParameter(node)) add(node.name, node);
    if ((ts.isFunctionDeclaration(node) || ts.isFunctionExpression(node) || ts.isClassDeclaration(node) || ts.isClassExpression(node)) && node.name) add(node.name, node);
    ts.forEachChild(node, visit);
  }
  visit(sourceFile);
  return declarations.filter((declaration) => declaration.scope);
}

function createReferenceResolver(sourceFile, filename) {
  const declarations = collectLexicalBindings(sourceFile, filename);
  const resolveIdentifier = (identifier) => declarations
    .filter((declaration) => declaration.name === identifier.text && isWithin(identifier, declaration.scope))
    .sort((left, right) => (left.scope.end - left.scope.pos) - (right.scope.end - right.scope.pos) || (left.imported ? 1 : -1))[0];
  const isConst = (declaration) => ts.isVariableDeclaration(declaration?.owner)
    && ts.isVariableDeclarationList(declaration.owner.parent)
    && (declaration.owner.parent.flags & ts.NodeFlags.Const) !== 0;
  const origin = (node, seen = new Set()) => {
    const value = unwrapParentheses(node);
    if (ts.isPropertyAccessExpression(value)) {
      const base = origin(value.expression, seen);
      if (!base) return undefined;
      return base.imported === "*"
        ? { moduleName: base.moduleName, imported: value.name.text, path: [] }
        : { ...base, path: [...base.path, value.name.text] };
    }
    if (ts.isElementAccessExpression(value) && ts.isStringLiteralLike(unwrapParentheses(value.argumentExpression))) {
      const base = origin(value.expression, seen);
      if (!base) return undefined;
      const name = unwrapParentheses(value.argumentExpression).text;
      return base.imported === "*"
        ? { moduleName: base.moduleName, imported: name, path: [] }
        : { ...base, path: [...base.path, name] };
    }
    if (!ts.isIdentifier(value)) return undefined;
    const declaration = resolveIdentifier(value);
    if (!declaration || seen.has(declaration.node)) return undefined;
    if (declaration.moduleName) return { moduleName: declaration.moduleName, imported: declaration.imported, path: [] };
    if (!isConst(declaration) || !declaration.owner.initializer) return undefined;
    const next = new Set(seen).add(declaration.node);
    const base = origin(declaration.owner.initializer, next);
    if (!base) return undefined;
    return declaration.bindingProperty && base.imported === "*"
      ? { moduleName: base.moduleName, imported: declaration.bindingProperty, path: [] }
      : base;
  };
  return {
    matches: (node, moduleName, imported, path = []) => {
      const resolved = origin(node);
      const deepDefault = resolved?.imported === "default" && nodePath.posix.basename(resolved.moduleName) === imported;
      const sameUiIdentity = moduleName === "@/components/ui" && resolved?.moduleName.startsWith("@/components/ui/")
        && (resolved.imported === imported || deepDefault);
      return (resolved?.moduleName === normalizeImportSource(moduleName, filename) && resolved.imported === imported || sameUiIdentity)
        && resolved.path.length === path.length && resolved.path.every((segment, index) => segment === path[index]);
    },
    origin,
    resolveIdentifier,
  };
}

function createStaticValueResolver(sourceFile, references) {
  const rootIdentifier = (node) => {
    let expression = unwrapParentheses(node);
    while (ts.isPropertyAccessExpression(expression) || ts.isElementAccessExpression(expression)) expression = unwrapParentheses(expression.expression);
    return ts.isIdentifier(expression) ? expression : undefined;
  };
  const sameBinding = (declaration, target) => {
    const root = rootIdentifier(target);
    return root && references.resolveIdentifier(root) === declaration;
  };
  const isMutated = (declaration, memberKey, useNode) => {
    let mutated = false;
    const sameExecutionScope = (node) => nearestAncestor(node, ts.isFunctionLike) === nearestAncestor(useNode, ts.isFunctionLike);
    function visit(node) {
      if (mutated) return;
      if (useNode && sameExecutionScope(node) && node.getStart(sourceFile) >= useNode.getStart(sourceFile)) return;
      if (ts.isBinaryExpression(node)
        && node.operatorToken.kind >= ts.SyntaxKind.FirstAssignment
        && node.operatorToken.kind <= ts.SyntaxKind.LastAssignment
        && sameBinding(declaration, node.left)) {
        if (memberKey !== undefined && (ts.isPropertyAccessExpression(node.left) || ts.isElementAccessExpression(node.left))) {
          const writtenKey = ts.isPropertyAccessExpression(node.left)
            ? node.left.name.text
            : ts.isStringLiteralLike(unwrapParentheses(node.left.argumentExpression)) || ts.isNumericLiteral(unwrapParentheses(node.left.argumentExpression))
              ? unwrapParentheses(node.left.argumentExpression).text
              : undefined;
          if (writtenKey !== undefined && writtenKey !== memberKey) {
            ts.forEachChild(node, visit);
            return;
          }
        }
        mutated = true;
        return;
      }
      if ((ts.isPrefixUnaryExpression(node) || ts.isPostfixUnaryExpression(node))
        && [ts.SyntaxKind.PlusPlusToken, ts.SyntaxKind.MinusMinusToken].includes(node.operator)
        && sameBinding(declaration, node.operand)) {
        mutated = true;
        return;
      }
      if (ts.isDeleteExpression(node) && sameBinding(declaration, node.expression)) {
        mutated = true;
        return;
      }
      if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)
        && ts.isIdentifier(node.expression.expression) && node.expression.expression.text === "Object"
        && !references.resolveIdentifier(node.expression.expression)
        && ["assign", "defineProperty"].includes(node.expression.name.text)
        && node.arguments[0] && sameBinding(declaration, node.arguments[0])) {
        if (memberKey !== undefined && node.expression.name.text === "defineProperty" && node.arguments[1]
          && ts.isStringLiteralLike(unwrapParentheses(node.arguments[1]))
          && unwrapParentheses(node.arguments[1]).text !== memberKey) {
          ts.forEachChild(node, visit);
          return;
        }
        if (memberKey !== undefined && node.expression.name.text === "assign") {
          const sources = node.arguments.slice(1).map(unwrapParentheses);
          const knownUnrelated = sources.every((source) => ts.isObjectLiteralExpression(source)
            && source.properties.every((property) => !ts.isSpreadAssignment(property)
              && property.name && (ts.isIdentifier(property.name) || ts.isStringLiteralLike(property.name))
              && property.name.text !== memberKey));
          if (knownUnrelated) {
            ts.forEachChild(node, visit);
            return;
          }
        }
        mutated = true;
        return;
      }
      if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)
        && /^(?:copyWithin|fill|pop|push|reverse|shift|sort|splice|unshift)$/.test(node.expression.name.text)
        && sameBinding(declaration, node.expression.expression)) {
        mutated = true;
        return;
      }
      ts.forEachChild(node, visit);
    }
    visit(sourceFile);
    return mutated;
  };
  const linearMemberOverride = (declaration, memberKey, useNode) => {
    const useScope = nearestAncestor(useNode, ts.isFunctionLike);
    const useContainer = nearestAncestor(useNode, (node) => ts.isBlock(node) || ts.isSourceFile(node));
    let latest;
    let unsupported = false;
    const writtenMember = (target) => {
      const expression = unwrapParentheses(target);
      if (!ts.isPropertyAccessExpression(expression) && !ts.isElementAccessExpression(expression)) return undefined;
      if (!sameBinding(declaration, expression)) return undefined;
      if (ts.isPropertyAccessExpression(expression)) return expression.name.text;
      const argument = unwrapParentheses(expression.argumentExpression);
      return ts.isStringLiteralLike(argument) || ts.isNumericLiteral(argument) ? argument.text : null;
    };
    function visit(node) {
      if (unsupported || node.getStart(sourceFile) >= useNode.getStart(sourceFile)) return;
      if (ts.isFunctionLike(node) && node !== useScope) return;
      if (ts.isBinaryExpression(node)
        && node.operatorToken.kind >= ts.SyntaxKind.FirstAssignment
        && node.operatorToken.kind <= ts.SyntaxKind.LastAssignment) {
        const key = writtenMember(node.left);
        if (key === undefined || key !== null && key !== memberKey) {
          ts.forEachChild(node, visit);
          return;
        }
        const directStatement = ts.isExpressionStatement(node.parent) && node.parent.parent === useContainer;
        if (!directStatement || node.operatorToken.kind !== ts.SyntaxKind.EqualsToken) {
          unsupported = true;
          return;
        }
        latest = node.right;
        return;
      }
      if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)
        && ts.isIdentifier(node.expression.expression) && node.expression.expression.text === "Object"
        && ["assign", "defineProperty"].includes(node.expression.name.text)
        && node.arguments[0] && sameBinding(declaration, node.arguments[0])) {
        unsupported = true;
        return;
      }
      ts.forEachChild(node, visit);
    }
    visit(useContainer ?? sourceFile);
    if (unsupported) return { kind: "unknown" };
    return latest ? { expression: latest, kind: "found" } : { kind: "missing" };
  };
  const staticKey = (node, seen) => {
    let expression = unwrapParentheses(node);
    let currentSeen = seen;
    for (;;) {
      if (ts.isStringLiteralLike(expression) || ts.isNumericLiteral(expression)) return { key: expression.text, seen: currentSeen };
      const result = resolve(expression, currentSeen);
      if (!result || result.expression === expression) return undefined;
      expression = unwrapParentheses(result.expression);
      currentSeen = result.seen;
    }
  };
  const objectPropertyKey = (property, seen) => {
    if (!property.name) return undefined;
    if (ts.isComputedPropertyName(property.name)) {
      const result = staticKey(property.name.expression, new Set());
      return result ? { key: result.key, seen } : undefined;
    }
    if (ts.isIdentifier(property.name) || ts.isStringLiteralLike(property.name) || ts.isNumericLiteral(property.name)) {
      return { key: property.name.text, seen };
    }
    return undefined;
  };
  const selectMemberState = (baseNode, key, seen) => {
    let base = unwrapParentheses(baseNode);
    let currentSeen = seen;
    if (ts.isIdentifier(base)) {
      const declaration = references.resolveIdentifier(base);
      if (declaration && !currentSeen.has(declaration.node) && ts.isVariableDeclaration(declaration.owner)
        && declaration.owner.initializer && ts.isVariableDeclarationList(declaration.owner.parent)
        && (declaration.owner.parent.flags & ts.NodeFlags.Const) !== 0
        && declaration.owner.getStart(sourceFile) < base.getStart(sourceFile)) {
        const override = linearMemberOverride(declaration, key, base);
        if (override.kind === "found") {
          return { expression: override.expression, kind: "found", seen: new Set(currentSeen).add(declaration.node) };
        }
        if (override.kind === "unknown" || isMutated(declaration, key, base)) return { kind: "unknown" };
        base = unwrapParentheses(declaration.owner.initializer);
        currentSeen = new Set(currentSeen).add(declaration.node);
      }
    }
    for (;;) {
      const result = resolve(base, currentSeen);
      if (!result || result.expression === base) break;
      base = unwrapParentheses(result.expression);
      currentSeen = result.seen;
    }
    if (ts.isArrayLiteralExpression(base)) {
      if (base.elements.some(ts.isSpreadElement)) return { kind: "unknown" };
      const index = Number(key);
      const element = Number.isInteger(index) ? base.elements[index] : undefined;
      return element && !ts.isOmittedExpression(element)
        ? { expression: element, kind: "found", seen: currentSeen }
        : { kind: "missing" };
    }
    if (!ts.isObjectLiteralExpression(base)) return { kind: "unknown" };
    for (let index = base.properties.length - 1; index >= 0; index -= 1) {
      const property = base.properties[index];
      if (ts.isSpreadAssignment(property)) {
        const nested = selectMemberState(property.expression, key, currentSeen);
        if (nested.kind === "found" || nested.kind === "unknown") return nested;
        continue;
      }
      const propertyKey = objectPropertyKey(property, currentSeen);
      if (!propertyKey || propertyKey.key !== key) continue;
      if (ts.isPropertyAssignment(property)) return { expression: property.initializer, kind: "found", seen: propertyKey.seen };
      if (ts.isShorthandPropertyAssignment(property)) return { expression: property.name, kind: "found", seen: propertyKey.seen };
      return { kind: "unknown" };
    }
    return { kind: "missing" };
  };
  const selectMember = (baseNode, key, seen) => {
    const result = selectMemberState(baseNode, key, seen);
    return result.kind === "found" ? { expression: result.expression, seen: result.seen } : undefined;
  };
  const constInitializer = (identifier, seen) => {
    const declaration = references.resolveIdentifier(identifier);
    if (!declaration || seen.has(declaration.node) || !ts.isVariableDeclaration(declaration.owner)
      || !declaration.owner.initializer || !ts.isVariableDeclarationList(declaration.owner.parent)
      || (declaration.owner.parent.flags & ts.NodeFlags.Const) === 0
      || declaration.owner.getStart(sourceFile) >= identifier.getStart(sourceFile)
      || isMutated(declaration)) return undefined;
    let result = {
      expression: declaration.owner.initializer,
      seen: new Set(seen).add(declaration.node),
    };
    for (const selector of declaration.bindingPath ?? []) {
      const keyResult = selector.kind === "index"
        ? { key: String(selector.index), seen: result.seen }
        : ts.isComputedPropertyName(selector.node)
          ? staticKey(selector.node.expression, new Set())
          : { key: selector.node.text, seen: result.seen };
      if (!keyResult) return undefined;
      result = selectMember(result.expression, keyResult.key, result.seen);
      if (!result) return undefined;
    }
    return result;
  };
  function resolve(node, seen = new Set()) {
    const expression = unwrapParentheses(node);
    if (ts.isIdentifier(expression)) return constInitializer(expression, seen);
    if (!ts.isPropertyAccessExpression(expression) && !ts.isElementAccessExpression(expression)) return undefined;
    const keyResult = ts.isPropertyAccessExpression(expression)
      ? { key: expression.name.text, seen }
      : staticKey(expression.argumentExpression, new Set());
    return keyResult ? selectMember(expression.expression, keyResult.key, seen) : undefined;
  }
  return { isMutated, resolve };
}

function isDesignFontToken(node, designTokenNames, shadowDeclarations) {
  const expression = unwrapParentheses(node);
  if (!expression || !ts.isPropertyAccessExpression(expression)) return false;
  const familyName = expression.name.text;
  const font = expression.expression;
  return (familyName === "family" || familyName === "mono")
    && ts.isPropertyAccessExpression(font)
    && font.name.text === "font"
    && isImportedReference(font.expression, designTokenNames, shadowDeclarations);
}


function cssValueTokens(value) {
  const tokens = [];
  let current = "";
  let depth = 0;
  let quote;
  for (let index = 0; index < value.length; index += 1) {
    const character = value[index];
    if (quote) {
      current += character;
      if (character === quote && value[index - 1] !== "\\") quote = undefined;
      continue;
    }
    if (character === '"' || character === "'") {
      quote = character;
      current += character;
    } else if (character === "(") {
      depth += 1;
      current += character;
    } else if (character === ")") {
      depth -= 1;
      current += character;
    } else if (depth === 0 && (character === "/" || character === "," || /\s/.test(character))) {
      if (current) tokens.push(current);
      current = "";
      if (character === "/" || character === ",") tokens.push(character);
    } else {
      current += character;
    }
  }
  if (current) tokens.push(current);
  return tokens;
}

function fontShorthandUsesToken(value) {
  const tokens = cssValueTokens(value);
  if (!CSS_FONT_FAMILY_TOKEN.test(tokens.at(-1) ?? "")) return false;
  return tokens.slice(0, -1).every((token) => token !== "," && (
    token === "/"
    || /^(?:normal|italic|oblique|small-caps|bold(?:er)?|lighter|[1-9]00|ultra-condensed|extra-condensed|condensed|semi-condensed|semi-expanded|expanded|extra-expanded|ultra-expanded|xx-small|x-small|small|medium|large|x-large|xx-large|xxx-large|larger|smaller)$/i.test(token)
    || /^(?:-?\d*\.?\d+|(?:var|calc|min|max|clamp)\(.+\))$/i.test(token)
  ));
}

function collectStaticArrayBindings(sourceFile) {
  const bindings = [];
  function visit(node) {
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer) {
      const initializer = unwrapParentheses(node.initializer);
      if (ts.isArrayLiteralExpression(initializer)) {
        bindings.push({ name: node.name.text, declaration: node.name, initializer, scope: declarationScope(node) });
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(sourceFile);
  const result = bindings.filter((binding) => binding.scope);
  result.declarations = collectBindingDeclarations(sourceFile, new Set(result.map((binding) => binding.name)));
  return result;
}

function collectStaticObjectBindings(sourceFile) {
  const bindings = [];
  function visit(node) {
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer) {
      const initializer = unwrapParentheses(node.initializer);
      if (ts.isObjectLiteralExpression(initializer)) {
        bindings.push({ name: node.name.text, declaration: node.name, initializer, scope: declarationScope(node) });
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(sourceFile);
  const result = bindings.filter((binding) => binding.scope);
  result.declarations = collectBindingDeclarations(sourceFile, new Set(result.map((binding) => binding.name)));
  return result;
}

function nearestBindingDeclaration(node, useNode, bindings) {
  return bindings.declarations
    ?.filter((declaration) => declaration.name === node.text && isWithin(useNode, declaration.scope))
    .sort((left, right) => (left.scope.end - left.scope.pos) - (right.scope.end - right.scope.pos))[0];
}

function resolveStaticArray(node, useNode, bindings) {
  const expression = unwrapParentheses(node);
  if (ts.isArrayLiteralExpression(expression)) return expression;
  if (!ts.isIdentifier(expression)) return undefined;
  const binding = bindings
    .filter((binding) => binding.name === expression.text && isWithin(useNode, binding.scope))
    .sort((left, right) => (left.scope.end - left.scope.pos) - (right.scope.end - right.scope.pos))[0];
  const declaration = nearestBindingDeclaration(expression, useNode, bindings);
  return binding && declaration?.node.pos === binding.declaration.pos ? binding.initializer : undefined;
}

function resolveStaticObject(node, useNode, bindings) {
  const expression = unwrapParentheses(node);
  if (ts.isObjectLiteralExpression(expression)) return expression;
  if (!ts.isIdentifier(expression)) return undefined;
  const binding = bindings
    .filter((binding) => binding.name === expression.text && isWithin(useNode, binding.scope))
    .sort((left, right) => (left.scope.end - left.scope.pos) - (right.scope.end - right.scope.pos))[0];
  const declaration = nearestBindingDeclaration(expression, useNode, bindings);
  return binding && declaration?.node.pos === binding.declaration.pos ? binding.initializer : undefined;
}

function staticObjectEntries(node, useNode, bindings, sourceFile, seen = new Set()) {
  const object = resolveStaticObject(node, useNode, bindings);
  if (!object || seen.has(object)) return undefined;
  seen.add(object);
  const entries = [];
  for (const property of object.properties) {
    if (ts.isSpreadAssignment(property)) {
      const nested = staticObjectEntries(property.expression, useNode, bindings, sourceFile, seen);
      if (nested) entries.push(...nested);
      else entries.push({ unknownSpread: true, node: property });
      continue;
    }
    const name = ts.isComputedPropertyName(property.name)
      ? (ts.isStringLiteralLike(unwrapParentheses(property.name.expression))
        ? unwrapParentheses(property.name.expression).text
        : undefined)
      : propertyName(property, sourceFile);
    if (!name) return undefined;
    if (ts.isPropertyAssignment(property)) {
      entries.push({ name, expression: property.initializer, node: property });
    } else if (ts.isShorthandPropertyAssignment(property)) {
      entries.push({ name, expression: property.name, node: property });
    } else if (ts.isMethodDeclaration(property) || ts.isGetAccessorDeclaration(property) || ts.isSetAccessorDeclaration(property)) {
      entries.push({ name, expression: property, node: property });
    } else {
      entries.push({ unknownSpread: true, node: property });
    }
  }
  seen.delete(object);
  return entries;
}

function lastNamedEntry(entries, name) {
  return entries.findLast((entry) => entry.name === name);
}

function hasUnsafeTrailingSpread(entries, criticalNames) {
  return criticalNames.some((name) => {
    const attribute = lastNamedEntry(entries, name);
    return entries.some((entry) => entry.unknownSpread && (!attribute || entry.index > attribute.index));
  });
}

function classifyTabsItems(node, useNode, bindings, sourceFile) {
  const items = resolveStaticArray(node, useNode, bindings);
  if (!items || items.elements.length === 0 || items.elements.some((item) => ts.isSpreadElement(item))) return "unknown";
  let withChildren = 0;
  let withoutChildren = 0;
  for (const item of items.elements) {
    const value = unwrapParentheses(item);
    if (!ts.isObjectLiteralExpression(value) || value.properties.some((property) => ts.isSpreadAssignment(property))) return "unknown";
    const children = value.properties.find(
      (property) => ts.isPropertyAssignment(property) && propertyName(property, sourceFile) === "children",
    );
    if (!children
      || (ts.isPropertyAssignment(children)
        && (children.initializer.kind === ts.SyntaxKind.NullKeyword
          || (ts.isIdentifier(children.initializer) && children.initializer.text === "undefined")))) withoutChildren += 1;
    else withChildren += 1;
  }
  if (withChildren === 0) return "navigation-only";
  if (withoutChildren === 0) return "content";
  return "unknown";
}

function classifyTabsSpread(node, useNode, objectBindings, arrayBindings, sourceFile) {
  const object = resolveStaticObject(node, useNode, objectBindings);
  if (!object || object.properties.some((property) => ts.isSpreadAssignment(property))) return "unknown";
  const items = object.properties.find((property) => propertyName(property, sourceFile) === "items");
  if (!items) return "none";
  if (ts.isPropertyAssignment(items)) return classifyTabsItems(items.initializer, useNode, arrayBindings, sourceFile);
  if (ts.isShorthandPropertyAssignment(items)) return classifyTabsItems(items.name, useNode, arrayBindings, sourceFile);
  return "unknown";
}

function jsxStringAttributeValue(attribute) {
  if (!attribute?.initializer) return undefined;
  if (ts.isStringLiteral(attribute.initializer)) return attribute.initializer.text;
  if (ts.isJsxExpression(attribute.initializer)) {
    const expression = unwrapParentheses(attribute.initializer.expression);
    if (expression && ts.isStringLiteralLike(expression)) return expression.text;
  }
  return undefined;
}

function isIconExpression(node, sourceFile, iconNames) {
  if (!node) return true;
  if (node.kind === ts.SyntaxKind.NullKeyword || node.kind === ts.SyntaxKind.FalseKeyword) return true;
  if (ts.isParenthesizedExpression(node)) return isIconExpression(node.expression, sourceFile, iconNames);
  if (ts.isConditionalExpression(node)) return isIconExpression(node.whenTrue, sourceFile, iconNames) && isIconExpression(node.whenFalse, sourceFile, iconNames);
  if (ts.isJsxElement(node) || ts.isJsxSelfClosingElement(node)) {
    const opening = ts.isJsxElement(node) ? node.openingElement : node;
    const tag = opening.tagName.getText(sourceFile);
    return iconNames.has(tag) || /(?:Icon|Outlined|Filled|TwoTone)$/.test(tag) || tag === "svg" || tag === "img";
  }
  if (ts.isIdentifier(node)) return /(?:icon|Icon)$/.test(node.text);
  return false;
}

function isPureIconButton(opening, sourceFile, iconNames) {
  const hasIconAttribute = opening.attributes.properties.some(
    (item) => ts.isJsxAttribute(item) && item.name.getText(sourceFile) === "icon",
  );
  if (ts.isJsxSelfClosingElement(opening)) return hasIconAttribute;
  const element = opening.parent;
  if (!ts.isJsxElement(element)) return false;
  const meaningful = element.children.filter(
    (child) => !(ts.isJsxText(child) && child.getText(sourceFile).trim() === ""),
  );
  if (meaningful.length === 0) return hasIconAttribute;
  return meaningful.every((child) => {
    if (ts.isJsxExpression(child)) return isIconExpression(child.expression, sourceFile, iconNames);
    return isIconExpression(child, sourceFile, iconNames);
  });
}


function translatedValues(node, sourceFile, catalogs, translationNames) {
  if (!ts.isCallExpression(node) || !ts.isIdentifier(node.expression) || !translationNames.has(node.expression.text)) return [];
  const [keyNode, optionsNode] = node.arguments;
  if (!keyNode || !ts.isStringLiteralLike(keyNode)) return [];
  const values = [];
  const lookup = (catalog, key) => key.split(".").reduce((current, segment) => current?.[segment], catalog);
  for (const catalog of catalogs) {
    const value = lookup(catalog, keyNode.text);
    // 字典里的复合文案由 $t(key) 拼接，按内容判断前先展开
    if (typeof value === "string") values.push(resolveNested(value, (key) => lookup(catalog, key)));
  }
  if (optionsNode && ts.isObjectLiteralExpression(optionsNode)) {
    const fallback = optionsNode.properties.find(
      (item) => ts.isPropertyAssignment(item) && propertyName(item, sourceFile) === "defaultValue",
    );
    if (fallback && ts.isPropertyAssignment(fallback) && ts.isStringLiteralLike(fallback.initializer)) {
      values.push(fallback.initializer.text);
    }
  } else if (optionsNode && ts.isStringLiteralLike(optionsNode)) {
    values.push(optionsNode.text);
  }
  return values;
}

/** 对象字面量是否直接作为 JSX 属性值（如 fieldProps={{ placeholder }}），用于区分控件配置与业务数据字段。 */
function isJsxAttributeObject(propertyNode) {
  let current = propertyNode.parent;
  while (current && (ts.isObjectLiteralExpression(current) || ts.isPropertyAssignment(current) || ts.isParenthesizedExpression(current))) {
    current = current.parent;
  }
  return Boolean(current) && ts.isJsxExpression(current) && Boolean(current.parent) && ts.isJsxAttribute(current.parent);
}

function collectLiteralTexts(node, sourceFile, out = []) {
  if (ts.isStringLiteralLike(node) || ts.isNoSubstitutionTemplateLiteral(node)) out.push(node.text);
  if (ts.isTemplateExpression(node)) {
    out.push(node.head.text);
    for (const span of node.templateSpans) out.push(span.literal.text);
  }
  ts.forEachChild(node, (child) => collectLiteralTexts(child, sourceFile, out));
  return out;
}

function collectTranslationNames(sourceFile) {
  const names = new Set(["t"]);
  let changed = true;
  while (changed) {
    changed = false;
    function visit(node) {
      if (ts.isVariableDeclaration(node)) {
        if (ts.isIdentifier(node.name) && node.initializer) {
          const aliasesKnownTranslation = ts.isIdentifier(node.initializer) && names.has(node.initializer.text);
          const readsTranslationProperty = ts.isPropertyAccessExpression(node.initializer)
            && node.initializer.name.text === "t"
            && ts.isCallExpression(node.initializer.expression)
            && /(?:^|\.)useTranslation$/.test(node.initializer.expression.expression.getText(sourceFile));
          if ((aliasesKnownTranslation || readsTranslationProperty) && !names.has(node.name.text)) {
            names.add(node.name.text);
            changed = true;
          }
        }
        if (ts.isObjectBindingPattern(node.name)
          && node.initializer
          && ts.isCallExpression(node.initializer)
          && /(?:^|\.)useTranslation$/.test(node.initializer.expression.getText(sourceFile))) {
          for (const element of node.name.elements) {
            const imported = element.propertyName?.getText(sourceFile) ?? element.name.getText(sourceFile);
            if (imported === "t" && ts.isIdentifier(element.name) && !names.has(element.name.text)) {
              names.add(element.name.text);
              changed = true;
            }
          }
        }
      }
      ts.forEachChild(node, visit);
    }
    visit(sourceFile);
  }
  return names;
}

function directRawColor(node) {
  if (!ts.isStringLiteralLike(node)) return false;
  const value = node.text.trim();
  const normalized = value.toLowerCase();
  return RAW_COLOR_SYNTAX.test(value)
    || CSS_NAMED_COLORS.has(normalized)
    || CSS_SYSTEM_COLORS.has(normalized);
}

function paletteContextName(object, sourceFile) {
  let current = object;
  while (current) {
    const parent = current.parent;
    if (ts.isVariableDeclaration(parent) && ts.isIdentifier(parent.name)) return parent.name.text;
    if (ts.isPropertyAssignment(parent)) {
      const name = propertyName(parent, sourceFile);
      if (name && /(?:palette|colou?rs?|tones?|swatches?|theme|brand)/i.test(name)) return name;
    }
    if (!ts.isObjectLiteralExpression(parent) && !ts.isPropertyAssignment(parent)) break;
    current = parent;
  }
  return "";
}

function isPrivatePaletteProperty(node, sourceFile) {
  if (!directRawColor(node.initializer) || !ts.isObjectLiteralExpression(node.parent)) return false;
  const object = node.parent;
  if (/(?:palette|colou?rs?|tones?|swatches?|theme|brand)/i.test(paletteContextName(object, sourceFile))) return true;
  return object.properties.filter(
    (property) => ts.isPropertyAssignment(property) && directRawColor(property.initializer),
  ).length >= 2;
}

const SEMANTIC_STATUS_COLOR = /\bdesignTokens\.color\.(?:primary|info|success|warning|error)(?:Border|Surface)?\b/;

function isInsideOrdinaryChartColor(node, sourceFile) {
  if (!SEMANTIC_STATUS_COLOR.test(node.getText(sourceFile))) return false;
  let current = node.parent;
  while (current) {
    if (ts.isPropertyAssignment(current)) {
      const name = propertyName(current, sourceFile);
      if (name === "series" || name === "visualMap") return true;
    }
    if (ts.isVariableDeclaration(current) || ts.isFunctionLike(current)) break;
    current = current.parent;
  }
  return false;
}

function isInsideJsxStyle(node, sourceFile) {
  let current = node.parent;
  while (current && !ts.isSourceFile(current)) {
    if (ts.isJsxAttribute(current)) {
      return ["style", "styles", "bodyStyle"].includes(current.name.getText(sourceFile));
    }
    current = current.parent;
  }
  return false;
}

export function inspectSource(source, filename, { catalogs = [], entityFilterFields = project.entityFilterFields ?? [], entityReferenceColumns = project.entityReferenceColumns ?? [], externalFixedOrderTables = project.externalFixedOrderTables ?? [], largeCandidateApis = project.largeCandidateApis ?? { module: "", names: [] } } = {}) {
  const errors = [];
  const sourceFile = ts.createSourceFile(filename, source, ts.ScriptTarget.Latest, true, filename.endsWith("tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const references = createReferenceResolver(sourceFile, filename);
  const staticValues = createStaticValueResolver(sourceFile, references);
  const translationNames = collectTranslationNames(sourceFile);
  const report = (node, rule, message) => errors.push({ rule, message, line: sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1 });
  const sharedUI = /\/src\/components\/ui(?:\/|$)/.test(filename);
  // 图表共享层：主题、色板与组合件只在这里定义；业务图表只声明数据与形态
  const chartLayer = /\/src\/components\/ReactEcharts\//.test(filename);
  const uiPublicIndex = /\/src\/components\/ui\/index\.ts$/.test(filename);
  const themeSource = /\/src\/config\/theme\.ts$/.test(filename) || /\/src\/design\/tokens\.ts$/.test(filename);
  const cronCycleUtility = /\/src\/utils\/cronCycle\.ts$/.test(filename);
  const jsonEditorComponent = /\/src\/components\/JsonEditor(?:\/|$)/.test(filename);
  const filterRulesComponent = /\/src\/components\/FilterRules(?:\/|$)/.test(filename);
  const pageSource = /\/src\/pages\//.test(filename);
  // 懒加载必须有错误边界：React.lazy 的 chunk 失败不被 Suspense 捕获，没有 LazyBoundary 就整页白屏。
  // routes/pages.ts 是纯声明注册表，其全部导出经 lazyRoute 渲染（边界在 lazyRoute 内），按注册表豁免。
  if (/\blazy\s*\(/.test(source) && !/\bLazyBoundary\b/.test(source) && !/\/src\/routes\/pages\.ts$/.test(filename)) {
    report(sourceFile, "FRONTEND-COMPONENTS", "懒加载内容必须套共享 LazyBoundary：chunk 请求失败不被 Suspense 接管，无边界会冒泡成整页白屏");
  }
  const buttonNames = new Set();
  const tagNames = new Set();
  const semanticTagNames = new Set();
  const spaceNames = new Set();
  const rowNames = new Set();
  const flexNames = new Set();
  const formItemNames = new Set();
  const alertNames = new Set();
  const drawerNames = new Set();
  const modalNames = new Set();
  const cardNames = new Set();
  const dropdownButtonNames = new Set();
  const tableNames = new Set();
  const tableConfigNames = new Set();
  const columnAlignmentNames = new Set();
  const dataTableNames = new Set();
  const modalFormNames = new Set();
  const drawerFormNames = new Set();
  const paginationBuilderNames = new Set();
  const responsiveTabsNames = new Set();
  const designTokenNames = new Set();
  const tooltipNames = new Set();
  const iconNames = new Set();
  // 文件是否为业务图表（引用了共享 ECharts 入口或 echarts 类型）
  let usesCharts = false;
  // 真正渲染图表组件（值导入共享 ReactEcharts 入口）的文件
  let rendersCharts = false;
  for (const statement of sourceFile.statements) {
    if (!ts.isImportDeclaration(statement) || !ts.isStringLiteral(statement.moduleSpecifier)) continue;
    const moduleName = normalizeImportSource(statement.moduleSpecifier.text, filename);
    const bindings = statement.importClause?.namedBindings;
    if (moduleName === "@/design/tokens" && bindings && ts.isNamedImports(bindings)) {
      for (const entry of bindings.elements) {
        if ((entry.propertyName ?? entry.name).text === "designTokens") designTokenNames.add(entry.name.text);
      }
    }
    if (moduleName.startsWith("@/components/ReactEcharts") || moduleName === "echarts" || moduleName.startsWith("echarts/")) usesCharts = true;
    if (moduleName.startsWith("@/components/ReactEcharts") && !statement.importClause?.isTypeOnly) rendersCharts = true;
    if (moduleName === "@ant-design/icons" && bindings && ts.isNamedImports(bindings)) {
      for (const entry of bindings.elements) iconNames.add(entry.name.text);
    }
    if (moduleName.startsWith("@/components/ui") && bindings && ts.isNamedImports(bindings)) {
      for (const entry of bindings.elements) {
        const imported = (entry.propertyName ?? entry.name).text;
        if (imported === "Tooltip") tooltipNames.add(entry.name.text);
        if (imported === "StatusTag" || imported === "MetadataTag") semanticTagNames.add(entry.name.text);
        if (imported === "buildTablePagination") paginationBuilderNames.add(entry.name.text);
        if (imported === "columnAlign") columnAlignmentNames.add(entry.name.text);
        if (imported === "columnWidth" || imported === "tableScroll") tableConfigNames.add(entry.name.text);
        if (imported === "DataTable") dataTableNames.add(entry.name.text);
        if (imported === "ResponsiveTabs") responsiveTabsNames.add(entry.name.text);
        if (imported === "DrawerForm") drawerFormNames.add(entry.name.text);
        if (imported === "ModalForm") modalFormNames.add(entry.name.text);
      }
    }
    if (moduleName !== "antd") continue;
    if (bindings && ts.isNamedImports(bindings)) for (const entry of bindings.elements) {
      const imported = (entry.propertyName ?? entry.name).text;
      if (imported === "Button") buttonNames.add(entry.name.text);
      if (imported === "Popconfirm" && !sharedUI) report(entry, "FRONTEND-COMPONENTS", "二次确认统一使用共享 Popconfirm（components/ui）：确定/取消与其它动作同为图标 + 文字，窄屏一起收成仅图标");
      if (imported === "Tag") tagNames.add(entry.name.text);
      if (imported === "Space") spaceNames.add(entry.name.text);
      if (imported === "Row") rowNames.add(entry.name.text);
      if (imported === "Flex") flexNames.add(entry.name.text);
      if (imported === "Form") formItemNames.add(`${entry.name.text}.Item`);
      if (imported === "Alert") alertNames.add(entry.name.text);
      if (imported === "Drawer") drawerNames.add(entry.name.text);
      if (imported === "Modal") modalNames.add(entry.name.text);
      if (imported === "Card") cardNames.add(entry.name.text);
      if (imported === "Dropdown") dropdownButtonNames.add(`${entry.name.text}.Button`);
      if (imported === "Table") {
        tableNames.add(entry.name.text);
        if (!sharedUI) report(entry, "FRONTEND-LAYOUT", "页面表格统一使用共享 Table（components/ui）：fixed 布局与横向最小宽度由它按列宽计算，业务不得直接使用 Ant Table");
      }
    }
    if (bindings && ts.isNamespaceImport(bindings)) {
      buttonNames.add(`${bindings.name.text}.Button`);
      tagNames.add(`${bindings.name.text}.Tag`);
      spaceNames.add(`${bindings.name.text}.Space`);
      rowNames.add(`${bindings.name.text}.Row`);
      flexNames.add(`${bindings.name.text}.Flex`);
      formItemNames.add(`${bindings.name.text}.Form.Item`);
      alertNames.add(`${bindings.name.text}.Alert`);
      drawerNames.add(`${bindings.name.text}.Drawer`);
      modalNames.add(`${bindings.name.text}.Modal`);
      cardNames.add(`${bindings.name.text}.Card`);
      dropdownButtonNames.add(`${bindings.name.text}.Dropdown.Button`);
      tableNames.add(`${bindings.name.text}.Table`);
    }
  }
  const controlledImportNames = new Set([
    ...designTokenNames,
    ...paginationBuilderNames,
    ...tableConfigNames,
    ...columnAlignmentNames,
    ...dataTableNames,
  ]);
  const shadowDeclarations = collectBindingDeclarations(sourceFile, controlledImportNames);
  const staticArrayBindings = collectStaticArrayBindings(sourceFile);
  const staticObjectBindings = collectStaticObjectBindings(sourceFile);
  for (const declaration of shadowDeclarations) {
    report(declaration.node, "FRONTEND-COMPONENTS", `受控公共导入 ${declaration.name} 不得在嵌套作用域被同名声明遮蔽`);
  }

  const rawExportForbidden = (origin, exportedName, explicitPublicExport = false) => {
    if (!origin || origin.moduleName !== "antd" || origin.imported === "*") return false;
    if (DEPRECATED_ANT_COMPONENTS.has(origin.imported)) return true;
    if (sharedUI) {
      return !(uiPublicIndex && explicitPublicExport && origin.moduleName === "antd"
        && REVIEWED_UI_RAW_EXPORTS.has(origin.imported) && exportedName === origin.imported);
    }
    return origin.moduleName === "antd" && GOVERNED_COMPONENTS.has(origin.imported);
  };
  const businessReexportForbidden = (origin) => Boolean(origin) && !uiPublicIndex
    && (origin.moduleName === "antd" || origin.moduleName.startsWith("@/components/ui"));
  const isConstDeclaration = (declaration) => Boolean(declaration) && ts.isVariableDeclaration(declaration.owner)
    && ts.isVariableDeclarationList(declaration.owner.parent)
    && (declaration.owner.parent.flags & ts.NodeFlags.Const) !== 0
    && declaration.owner.initializer;
  const isDataTableHookCall = (node) => {
    const expression = unwrapParentheses(node);
    return ts.isCallExpression(expression)
      && references.matches(expression.expression, "@/hooks/useDataTable", "useDataTable");
  };
  const dataTableHookIdentity = (node, seen = new Set()) => {
    const expression = unwrapParentheses(node);
    if (isDataTableHookCall(expression)) return { call: expression, declarations: new Set() };
    if (!ts.isIdentifier(expression)) return undefined;
    const declaration = references.resolveIdentifier(expression);
    if (!isConstDeclaration(declaration) || seen.has(declaration.node) || declaration.bindingPath?.length
      || declaration.owner.getStart(sourceFile) >= expression.getStart(sourceFile)) return undefined;
    const identity = dataTableHookIdentity(declaration.owner.initializer, new Set(seen).add(declaration.node));
    if (identity) identity.declarations.add(declaration);
    return identity;
  };
  const hookIdentityIsSafe = (identity) => {
    if (!identity) return false;
    let changed = true;
    while (changed) {
      changed = false;
      function findAliases(node) {
        if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer
          && ts.isVariableDeclarationList(node.parent) && (node.parent.flags & ts.NodeFlags.Const) !== 0
          && ts.isIdentifier(unwrapParentheses(node.initializer))) {
          const source = references.resolveIdentifier(unwrapParentheses(node.initializer));
          const target = references.resolveIdentifier(node.name);
          if ([...identity.declarations].includes(source) && target && !identity.declarations.has(target)) {
            identity.declarations.add(target);
            changed = true;
          }
        }
        ts.forEachChild(node, findAliases);
      }
      findAliases(sourceFile);
    }
    let unsafe = false;
    function audit(node) {
      if (unsafe) return;
      if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)
        && ["assign", "defineProperty"].includes(node.expression.name.text)
        && ts.isIdentifier(node.expression.expression) && node.expression.expression.text === "Object"
        && !references.resolveIdentifier(node.expression.expression) && node.arguments[0]) {
        const root = rootReference(node.arguments[0]);
        if (root && identity.declarations.has(references.resolveIdentifier(root))) unsafe = true;
      }
      if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.EqualsToken) {
        const root = rootReference(node.left);
        if (root && root !== unwrapParentheses(node.left) && identity.declarations.has(references.resolveIdentifier(root))) unsafe = true;
      }
      ts.forEachChild(node, audit);
    }
    const rootReference = (node) => {
      let expression = unwrapParentheses(node);
      while (ts.isPropertyAccessExpression(expression) || ts.isElementAccessExpression(expression)) expression = unwrapParentheses(expression.expression);
      return ts.isIdentifier(expression) ? expression : undefined;
    };
    for (const declaration of identity.declarations) if (staticValues.isMutated(declaration)) return false;
    audit(sourceFile);
    return !unsafe;
  };
  /**
   * 同页 Hook（相对路径导入、`useXxx` 命名）可以承载表格状态机：
   * `const { table } = usePageController()` 解构出的成员视为受控 controller。
   */
  const isPageHookMember = (declaration) => {
    if (!isConstDeclaration(declaration) || declaration.bindingPath?.length !== 1) return false;
    const call = unwrapParentheses(declaration.owner.initializer);
    if (!ts.isCallExpression(call) || !ts.isIdentifier(call.expression)) return false;
    const hook = references.resolveIdentifier(call.expression);
    return Boolean(hook?.moduleName) && /^\.\.?\//.test(hook.moduleName) && /^use[A-Z]/.test(hook.imported ?? "");
  };
  /** controller 必须是（经 const 别名可追溯的）useDataTable 返回值或同页 Hook 成员，且未被改写。 */
  const isDataTableController = (node, seen = new Set()) => {
    const expression = unwrapParentheses(node);
    if (ts.isIdentifier(expression)) {
      const declaration = references.resolveIdentifier(expression);
      if (isPageHookMember(declaration)) return !staticValues.isMutated(declaration);
    }
    return hookIdentityIsSafe(dataTableHookIdentity(expression, seen));
  };
  const isTranslationFunction = (node, seen = new Set()) => {
    const expression = unwrapParentheses(node);
    if (!ts.isIdentifier(expression)) return references.matches(expression, "@/i18n", "default", ["t"]);
    const declaration = references.resolveIdentifier(expression);
    if (!isConstDeclaration(declaration) || seen.has(declaration.node)) return false;
    const path = declaration.bindingPath ?? [];
    if (path.length === 1 && path[0].kind === "property" && !ts.isComputedPropertyName(path[0].node)
      && path[0].node.text === "t" && ts.isCallExpression(unwrapParentheses(declaration.owner.initializer))) {
      return references.matches(unwrapParentheses(declaration.owner.initializer).expression, "react-i18next", "useTranslation");
    }
    return path.length === 0 && isTranslationFunction(declaration.owner.initializer, new Set(seen).add(declaration.node));
  };
  const staticPrimitive = (node, substitutions = new Map(), seen = new Set()) => {
    const expression = unwrapParentheses(node);
    if (!expression) return undefined;
    if (ts.isIdentifier(expression)) {
      const declaration = references.resolveIdentifier(expression);
      const substituted = declaration && substitutions.get(declaration);
      if (substituted) return staticPrimitive(substituted, substitutions, seen);
      if (expression.text === "undefined" && !declaration) return { value: undefined };
      if (expression.text === "NaN" && !declaration) return { value: Number.NaN };
    }
    if (expression.kind === ts.SyntaxKind.TrueKeyword) return { value: true };
    if (expression.kind === ts.SyntaxKind.FalseKeyword) return { value: false };
    if (expression.kind === ts.SyntaxKind.NullKeyword) return { value: null };
    if (ts.isStringLiteralLike(expression)) return { value: expression.text };
    if (ts.isNumericLiteral(expression)) return { value: Number(expression.text) };
    if (ts.isBigIntLiteral(expression)) return { value: BigInt(expression.text.slice(0, -1)) };
    if (ts.isObjectLiteralExpression(expression) || ts.isArrayLiteralExpression(expression)
      || ts.isArrowFunction(expression) || ts.isFunctionExpression(expression)) return { value: expression };
    if (ts.isVoidExpression(expression)) return { value: undefined };
    if (ts.isPrefixUnaryExpression(expression)) {
      const operand = staticPrimitive(expression.operand, substitutions, seen);
      if (!operand) return undefined;
      if (expression.operator === ts.SyntaxKind.ExclamationToken) return { value: !operand.value };
      if (expression.operator === ts.SyntaxKind.PlusToken) return { value: Number(operand.value) };
      if (expression.operator === ts.SyntaxKind.MinusToken) return { value: -operand.value };
      if (expression.operator === ts.SyntaxKind.TildeToken) return { value: ~operand.value };
    }
    if (ts.isBinaryExpression(expression)) {
      const left = staticPrimitive(expression.left, substitutions, seen);
      const operator = expression.operatorToken.kind;
      if (operator === ts.SyntaxKind.AmpersandAmpersandToken && left) {
        return left.value ? staticPrimitive(expression.right, substitutions, seen) : left;
      }
      if (operator === ts.SyntaxKind.BarBarToken && left) {
        return left.value ? left : staticPrimitive(expression.right, substitutions, seen);
      }
      if (operator === ts.SyntaxKind.QuestionQuestionToken && left) {
        return left.value === null || left.value === undefined ? staticPrimitive(expression.right, substitutions, seen) : left;
      }
      const right = staticPrimitive(expression.right, substitutions, seen);
      if (!left || !right) return undefined;
      try {
        switch (operator) {
          case ts.SyntaxKind.PlusToken: return { value: left.value + right.value };
          case ts.SyntaxKind.MinusToken: return { value: left.value - right.value };
          case ts.SyntaxKind.AsteriskToken: return { value: left.value * right.value };
          case ts.SyntaxKind.SlashToken: return { value: left.value / right.value };
          case ts.SyntaxKind.PercentToken: return { value: left.value % right.value };
          case ts.SyntaxKind.AsteriskAsteriskToken: return { value: left.value ** right.value };
          case ts.SyntaxKind.LessThanToken: return { value: left.value < right.value };
          case ts.SyntaxKind.LessThanEqualsToken: return { value: left.value <= right.value };
          case ts.SyntaxKind.GreaterThanToken: return { value: left.value > right.value };
          case ts.SyntaxKind.GreaterThanEqualsToken: return { value: left.value >= right.value };
          case ts.SyntaxKind.EqualsEqualsToken: return { value: left.value == right.value };
          case ts.SyntaxKind.ExclamationEqualsToken: return { value: left.value != right.value };
          case ts.SyntaxKind.EqualsEqualsEqualsToken: return { value: left.value === right.value };
          case ts.SyntaxKind.ExclamationEqualsEqualsToken: return { value: left.value !== right.value };
          default: return undefined;
        }
      } catch {
        return undefined;
      }
    }
    const resolved = staticValues.resolve(expression, seen);
    return resolved ? staticPrimitive(resolved.expression, substitutions, resolved.seen) : undefined;
  };
  const staticTruthiness = (node, substitutions = new Map(), seen = new Set()) => {
    const result = staticPrimitive(node, substitutions, seen);
    return result ? Boolean(result.value) : undefined;
  };
  const localFunctionReturns = (node, substitutions = new Map()) => {
    const expression = unwrapParentheses(node);
    if (!ts.isArrowFunction(expression) && !ts.isFunctionExpression(expression) && !ts.isFunctionDeclaration(expression)
      && !ts.isMethodDeclaration(expression) && !ts.isGetAccessorDeclaration(expression)) return undefined;
    if (!ts.isBlock(expression.body)) return [expression.body];
    const analyzeStatement = (statement) => {
      if (ts.isReturnStatement(statement)) return { continuing: false, returns: statement.expression ? [statement.expression] : [] };
      if (ts.isThrowStatement(statement)) return { continuing: false, returns: [] };
      if (ts.isBlock(statement)) return analyzeStatements(statement.statements);
      if (ts.isIfStatement(statement)) {
        const truth = staticTruthiness(statement.expression, substitutions);
        if (truth === true) return analyzeStatement(statement.thenStatement);
        if (truth === false) return statement.elseStatement
          ? analyzeStatement(statement.elseStatement)
          : { continuing: true, returns: [] };
        const left = analyzeStatement(statement.thenStatement);
        const right = statement.elseStatement
          ? analyzeStatement(statement.elseStatement)
          : { continuing: true, returns: [] };
        return { continuing: left.continuing || right.continuing, returns: [...left.returns, ...right.returns] };
      }
      return { continuing: true, returns: [] };
    };
    const analyzeStatements = (statements) => {
      const returns = [];
      let continuing = true;
      for (const statement of statements) {
        if (!continuing) break;
        const result = analyzeStatement(statement);
        returns.push(...result.returns);
        continuing = result.continuing;
      }
      return { continuing, returns };
    };
    return analyzeStatements(expression.body.statements).returns;
  };
  const staticPropertyKey = (node) => {
    if (!node) return undefined;
    if (!ts.isComputedPropertyName(node)) return node.text;
    let expression = node.expression;
    let seen = new Set();
    for (;;) {
      const value = unwrapParentheses(expression);
      if (ts.isStringLiteralLike(value) || ts.isNumericLiteral(value)) return value.text;
      const resolved = staticValues.resolve(value, seen);
      if (!resolved || resolved.expression === value) return undefined;
      expression = resolved.expression;
      seen = resolved.seen;
    }
  };
  const staticObjectExpression = (node, seen = new Set()) => {
    let expression = unwrapParentheses(node);
    let currentSeen = seen;
    for (;;) {
      if (ts.isObjectLiteralExpression(expression)) return { expression, seen: currentSeen };
      const resolved = staticValues.resolve(expression, currentSeen);
      if (!resolved || resolved.expression === expression) return undefined;
      expression = unwrapParentheses(resolved.expression);
      currentSeen = resolved.seen;
    }
  };
  const UNKNOWN_STATIC_MEMBER = Symbol("unknown-static-member");
  const staticObjectMember = (node, key, seen = new Set()) => {
    const resolved = staticObjectExpression(node, seen);
    if (!resolved || seen.has(resolved.expression)) return UNKNOWN_STATIC_MEMBER;
    const nextSeen = new Set(resolved.seen).add(resolved.expression);
    for (let index = resolved.expression.properties.length - 1; index >= 0; index -= 1) {
      const property = resolved.expression.properties[index];
      if (ts.isSpreadAssignment(property)) {
        const nested = staticObjectMember(property.expression, key, nextSeen);
        if (nested === UNKNOWN_STATIC_MEMBER) return UNKNOWN_STATIC_MEMBER;
        if (nested) return nested;
        continue;
      }
      if (staticPropertyKey(property.name) !== key) continue;
      if (ts.isPropertyAssignment(property)) return property.initializer;
      if (ts.isShorthandPropertyAssignment(property)) return property.name;
      if (ts.isMethodDeclaration(property) || ts.isGetAccessorDeclaration(property)) return property;
      return undefined;
    }
    return undefined;
  };
  const localFunctionForCall = (node, seen = new Set()) => {
    const callee = unwrapParentheses(node);
    if (ts.isArrowFunction(callee) || ts.isFunctionExpression(callee) || ts.isMethodDeclaration(callee)) return callee;
    if (seen.has(callee)) return undefined;
    const nextSeen = new Set(seen).add(callee);
    let candidate;
    if (ts.isPropertyAccessExpression(callee)) candidate = staticObjectMember(callee.expression, callee.name.text);
    else if (ts.isElementAccessExpression(callee)) {
      const key = staticPropertyKey(ts.factory.createComputedPropertyName(callee.argumentExpression));
      if (key !== undefined) candidate = staticObjectMember(callee.expression, key);
    } else if (ts.isIdentifier(callee)) {
      const declaration = references.resolveIdentifier(callee);
      if (ts.isFunctionDeclaration(declaration?.owner)) return declaration.owner;
      if (!isConstDeclaration(declaration) || !declaration.owner.initializer || staticValues.isMutated(declaration)) return undefined;
      if (declaration.bindingPath?.length === 1 && declaration.bindingPath[0].kind === "property") {
        const key = staticPropertyKey(declaration.bindingPath[0].node);
        if (key !== undefined) candidate = staticObjectMember(declaration.owner.initializer, key);
      }
      if (!candidate) candidate = staticValues.resolve(callee)?.expression ?? declaration.owner.initializer;
    }
    if (candidate === UNKNOWN_STATIC_MEMBER) return undefined;
    const expression = unwrapParentheses(candidate);
    if (!expression) return undefined;
    if (expression && expression !== callee && ts.isIdentifier(expression)) return localFunctionForCall(expression, nextSeen);
    return ts.isArrowFunction(expression) || ts.isFunctionExpression(expression) || ts.isMethodDeclaration(expression)
      ? expression
      : undefined;
  };
  const localCallReturns = (call, substitutions = new Map(), seen = new Set()) => {
    const localFunction = localFunctionForCall(call.expression);
    if (!localFunction || seen.has(localFunction)) return undefined;
    const nextSubstitutions = new Map(substitutions);
    for (const [index, parameter] of localFunction.parameters.entries()) {
      if (!ts.isIdentifier(parameter.name) || !call.arguments[index]) continue;
      const declaration = references.resolveIdentifier(parameter.name);
      if (declaration) nextSubstitutions.set(declaration, call.arguments[index]);
    }
    const nextSeen = new Set(seen).add(localFunction);
    return localFunctionReturns(localFunction, nextSubstitutions)?.map(
      (expression) => ({ expression, seen: nextSeen, substitutions: nextSubstitutions }),
    );
  };
  const isMessageBinding = (node) => {
    if (!ts.isIdentifier(node)) return false;
    const declaration = references.resolveIdentifier(node);
    return declaration?.bindingPath?.some((selector) => {
      if (selector.kind !== "property") return false;
      if (!ts.isComputedPropertyName(selector.node)) return selector.node.text === "message";
      let key = selector.node.expression;
      let seen = new Set();
      for (;;) {
        const value = unwrapParentheses(key);
        if (ts.isStringLiteralLike(value)) return value.text === "message";
        const resolved = staticValues.resolve(value, seen);
        if (!resolved || resolved.expression === value) return false;
        key = resolved.expression;
        seen = resolved.seen;
      }
    }) ?? false;
  };
  const isPreformattedError = (node, seen = new Set(), substitutions = new Map()) => {
    const expression = unwrapParentheses(node);
    if (!expression || ts.isNewExpression(expression)) return false;
    if (ts.isStringLiteralLike(expression) || ts.isTemplateExpression(expression)) return true;
    if (ts.isIdentifier(expression)) {
      const declaration = references.resolveIdentifier(expression);
      const substituted = declaration && substitutions.get(declaration);
      if (substituted) return isPreformattedError(substituted, seen, substitutions);
      if (isMessageBinding(expression)) return true;
    }
    if ((ts.isPropertyAccessExpression(expression) || ts.isPropertyAccessChain(expression)) && expression.name.text === "message") return true;
    if (ts.isElementAccessExpression(expression)) {
      let key = unwrapParentheses(expression.argumentExpression);
      let keySeen = new Set();
      for (;;) {
        if (ts.isStringLiteralLike(key) && key.text === "message") return true;
        const result = staticValues.resolve(key, keySeen);
        if (!result || result.expression === key) break;
        key = unwrapParentheses(result.expression);
        keySeen = result.seen;
      }
    }
    if (ts.isCallExpression(expression)) {
      if (isTranslationFunction(expression.expression)) return true;
      if (ts.isIdentifier(expression.expression) && expression.expression.text === "String" && !references.resolveIdentifier(expression.expression)) return true;
      if (ts.isPropertyAccessExpression(expression.expression)
        && (expression.expression.name.text === "toString"
          || (expression.expression.name.text === "stringify" && ts.isIdentifier(expression.expression.expression)
            && expression.expression.expression.text === "JSON" && !references.resolveIdentifier(expression.expression.expression)))) return true;
      if (references.matches(expression.expression, "@/utils/requestError", "extractRequestErrorMessage")) return true;
      if (ts.isPropertyAccessExpression(expression.expression)
        && /^(?:trim|trimStart|trimEnd|replace|replaceAll|toUpperCase|toLowerCase|toLocaleUpperCase|toLocaleLowerCase|slice|substring|substr|concat|padStart|padEnd|repeat|normalize|split|join)$/.test(expression.expression.name.text)) {
        const receiver = expression.expression.expression;
        if (isPreformattedError(receiver, seen, substitutions)) return true;
        if (expression.expression.name.text === "join" && ts.isArrayLiteralExpression(unwrapParentheses(receiver))) {
          return unwrapParentheses(receiver).elements.some((element) => isPreformattedError(element, seen, substitutions));
        }
      }
      const returned = localCallReturns(expression, substitutions, seen);
      if (returned) return returned.some((result) => isPreformattedError(result.expression, result.seen, result.substitutions));
      return false;
    }
    const resolved = staticValues.resolve(expression, seen);
    if (resolved) return isPreformattedError(resolved.expression, resolved.seen, substitutions);
    if (ts.isConditionalExpression(expression)) {
      const truth = staticTruthiness(expression.condition, substitutions);
      if (truth === true) return isPreformattedError(expression.whenTrue, seen, substitutions);
      if (truth === false) return isPreformattedError(expression.whenFalse, seen, substitutions);
      return isPreformattedError(expression.whenTrue, seen, substitutions) || isPreformattedError(expression.whenFalse, seen, substitutions);
    }
    if (ts.isBinaryExpression(expression)) return isPreformattedError(expression.left, seen, substitutions) || isPreformattedError(expression.right, seen, substitutions);
    return false;
  };
  const isAllowedRawError = (node, seen = new Set()) => {
    const expression = unwrapParentheses(node);
    if (!expression) return false;
    if (ts.isNewExpression(expression) && ts.isIdentifier(expression.expression) && expression.expression.text === "Error") return true;
    if (ts.isIdentifier(expression)) {
      const declaration = references.resolveIdentifier(expression);
      if (isMessageBinding(expression)) return false;
      if (declaration?.bindingPath?.some((selector) => selector.kind === "property" && staticPropertyKey(selector.node) === "error")) return true;
      if (declaration && isConstDeclaration(declaration) && !seen.has(declaration.node) && isRawErrorState(declaration, new Set(seen).add(declaration.node))) return true;
      if (!isConstDeclaration(declaration) || seen.has(declaration.node) || staticValues.isMutated(declaration)) return true;
      return isAllowedRawError(declaration.owner.initializer, new Set(seen).add(declaration.node));
    }
    if ((ts.isPropertyAccessExpression(expression) || ts.isPropertyAccessChain(expression)) && expression.name.text === "error") return true;
    if (ts.isElementAccessExpression(expression)
      && ts.isStringLiteralLike(unwrapParentheses(expression.argumentExpression))
      && unwrapParentheses(expression.argumentExpression).text === "error") return true;
    if (ts.isConditionalExpression(expression)) {
      const truth = staticTruthiness(expression.condition);
      if (truth === true) return isAllowedRawError(expression.whenTrue, seen);
      if (truth === false) return isAllowedRawError(expression.whenFalse, seen);
      return isAllowedRawError(expression.whenTrue, seen) && isAllowedRawError(expression.whenFalse, seen);
    }
    // 多个查询错误的回退合并（a ?? b / a || b）：两侧都必须是原始错误
    if (ts.isBinaryExpression(expression)
      && (expression.operatorToken.kind === ts.SyntaxKind.QuestionQuestionToken || expression.operatorToken.kind === ts.SyntaxKind.BarBarToken)) {
      return isAllowedRawError(expression.left, seen) && isAllowedRawError(expression.right, seen);
    }
    return false;
  };
  // useState 保存的错误：所有 setter 写入都必须是原始错误（或清空为 undefined/null）
  const isRawErrorState = (declaration, seen) => {
    const initializer = declaration.owner.initializer;
    if (!initializer || !ts.isCallExpression(initializer) || calleeName(initializer) !== "useState") return false;
    const path = declaration.bindingPath ?? [];
    if (path.length !== 1 || path[0].kind !== "index" || path[0].index !== 0) return false;
    if (!ts.isArrayBindingPattern(declaration.owner.name)) return false;
    const setterElement = declaration.owner.name.elements[1];
    if (!setterElement || !ts.isBindingElement(setterElement) || !ts.isIdentifier(setterElement.name)) return false;
    const setterName = setterElement.name.text;
    const writes = [];
    const collect = (node) => {
      if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === setterName
        && references.resolveIdentifier(node.expression)?.node === setterElement.name) {
        writes.push(...node.arguments);
      }
      ts.forEachChild(node, collect);
    };
    collect(sourceFile);
    return writes.length > 0 && writes.every((argument) => {
      const value = unwrapParentheses(argument);
      if (value.kind === ts.SyntaxKind.NullKeyword || (ts.isIdentifier(value) && value.text === "undefined")) return true;
      return isAllowedRawError(value, seen);
    });
  };
  const useSiteJsxEntries = (attributes) => {
    const entries = [];
    const rootObjectDeclaration = (identifier, seen = new Set()) => {
      const declaration = references.resolveIdentifier(identifier);
      if (!isConstDeclaration(declaration) || seen.has(declaration.node) || declaration.bindingPath?.length) return undefined;
      const initializer = unwrapParentheses(declaration.owner.initializer);
      if (ts.isObjectLiteralExpression(initializer)) return declaration;
      return ts.isIdentifier(initializer)
        ? rootObjectDeclaration(initializer, new Set(seen).add(declaration.node))
        : undefined;
    };
    const objectIdentity = (identifier, useNode) => {
      const root = rootObjectDeclaration(identifier);
      if (!root) return undefined;
      const declarations = new Set([root]);
      let changed = true;
      while (changed) {
        changed = false;
        function collect(node) {
          if (ts.isVariableDeclaration(node) && node.initializer && ts.isIdentifier(node.name)
            && ts.isIdentifier(unwrapParentheses(node.initializer))) {
            const source = references.resolveIdentifier(unwrapParentheses(node.initializer));
            const target = references.resolveIdentifier(node.name);
            if (declarations.has(source) && target && !declarations.has(target)
              && (!sameExecutionScope(node, useNode) || node.getStart(sourceFile) < useNode.getStart(sourceFile))) {
              declarations.add(target);
              changed = true;
            }
          }
          if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.EqualsToken
            && ts.isIdentifier(unwrapParentheses(node.left)) && ts.isIdentifier(unwrapParentheses(node.right))) {
            const source = references.resolveIdentifier(unwrapParentheses(node.right));
            const target = references.resolveIdentifier(unwrapParentheses(node.left));
            if (declarations.has(source) && target && !declarations.has(target)
              && (!sameExecutionScope(node, useNode) || node.getStart(sourceFile) < useNode.getStart(sourceFile))) {
              declarations.add(target);
              changed = true;
            }
          }
          ts.forEachChild(node, collect);
        }
        collect(sourceFile);
      }
      return { declarations, root };
    };
    const memberTarget = (node, identity) => {
      const expression = unwrapParentheses(node);
      if (!ts.isPropertyAccessExpression(expression) && !ts.isElementAccessExpression(expression)) return undefined;
      const root = unwrapParentheses(expression.expression);
      if (!ts.isIdentifier(root) || !identity.declarations.has(references.resolveIdentifier(root))) return undefined;
      if (ts.isPropertyAccessExpression(expression)) return expression.name.text;
      return staticPropertyKey(ts.factory.createComputedPropertyName(expression.argumentExpression));
    };
    const sameExecutionScope = (left, right) => nearestAncestor(left, ts.isFunctionLike) === nearestAncestor(right, ts.isFunctionLike);
    let spreadEntries;
    const reachingObjectEntries = (identifier, useNode, seen, substitutions) => {
      const identity = objectIdentity(identifier, useNode);
      if (!identity) return undefined;
      const initial = spreadEntries(identity.root.owner.initializer, seen, substitutions, true);
      if (!initial) return undefined;
      const events = [];
      const mutationConditions = (node) => {
        const conditions = [];
        let current = node;
        while (current && current !== sourceFile) {
          const parent = current.parent;
          if (ts.isIfStatement(parent)) {
            const branch = parent.thenStatement === current || isWithin(node, parent.thenStatement);
            const truth = staticTruthiness(parent.expression, substitutions);
            if (truth !== undefined && truth !== branch) return undefined;
            if (truth === undefined) conditions.push({ branch, node: parent });
          }
          current = parent;
        }
        return conditions;
      };
      const addEvent = (values, node) => {
        const conditions = mutationConditions(node);
        if (conditions) events.push({ conditions, position: node.getStart(sourceFile), values });
      };
      function audit(node) {
        const visible = !sameExecutionScope(node, useNode) || node.getStart(sourceFile) < useNode.getStart(sourceFile);
        if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.EqualsToken) {
          const key = memberTarget(node.left, identity);
          if (visible && key !== undefined) addEvent([{ name: key, expression: node.right, node, substitutions }], node);
          else if ((ts.isPropertyAccessExpression(node.left) || ts.isElementAccessExpression(node.left))
            && ts.isIdentifier(unwrapParentheses(node.left.expression))
            && identity.declarations.has(references.resolveIdentifier(unwrapParentheses(node.left.expression))) && visible) {
            addEvent([{ unknownSpread: true, node }], node);
          }
        }
        if (visible && ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)
          && ts.isIdentifier(node.expression.expression) && node.expression.expression.text === "Object"
          && !references.resolveIdentifier(node.expression.expression) && node.arguments[0]
          && ts.isIdentifier(unwrapParentheses(node.arguments[0]))
          && identity.declarations.has(references.resolveIdentifier(unwrapParentheses(node.arguments[0])))) {
          if (node.expression.name.text === "assign") {
            const values = [];
            for (const source of node.arguments.slice(1)) {
              const assigned = spreadEntries(source, seen, substitutions);
              if (assigned) values.push(...assigned);
              else values.push({ unknownSpread: true, node: source });
            }
            addEvent(values, node);
          } else if (node.expression.name.text === "defineProperty" && node.arguments[1] && node.arguments[2]) {
            const key = staticPropertyKey(ts.factory.createComputedPropertyName(node.arguments[1]));
            const descriptor = spreadEntries(node.arguments[2], seen, substitutions);
            const descriptorStates = descriptor && expandAlternatives(descriptor);
            const descriptorValues = [];
            for (const state of descriptorStates ?? []) {
              const value = lastNamedEntry(state, "value");
              const getter = lastNamedEntry(state, "get");
              const selected = [value, getter].filter(Boolean).sort((left, right) => state.indexOf(right) - state.indexOf(left))[0];
              const selectedIndex = selected && state.indexOf(selected);
              if (!selected || state.some((entry, index) => entry.unknownSpread && index > selectedIndex)) {
                descriptorValues.push({ unknownSpread: true, node });
              } else if (selected.name === "value") descriptorValues.push({ ...selected, name: key });
              else if (selected.expression) {
                const getter = selected;
              const callable = localFunctionForCall(getter.expression);
              const returned = callable && localFunctionReturns(callable, substitutions);
                if (returned?.length) descriptorValues.push(...returned.map((expression) => ({ name: key, expression, node, substitutions })));
                else descriptorValues.push({ unknownSpread: true, node });
              }
            }
            if (key === undefined || !descriptor) addEvent([{ unknownSpread: true, node }], node);
            else addEvent(descriptorValues, node);
          }
        }
        ts.forEachChild(node, audit);
      }
      audit(sourceFile);
      events.sort((left, right) => left.position - right.position);
      const branchNodes = [...new Set(events.flatMap((event) => event.conditions.map((condition) => condition.node)))];
      if (branchNodes.length > 8) return [...initial, { unknownSpread: true, node: useNode }];
      const alternatives = [];
      const count = 2 ** branchNodes.length;
      for (let mask = 0; mask < count; mask += 1) {
        const values = [...initial];
        for (const event of events) {
          const reachable = event.conditions.every((condition) => Boolean(mask & (1 << branchNodes.indexOf(condition.node))) === condition.branch);
          if (reachable) values.push(...event.values);
        }
        alternatives.push(values);
      }
      return alternatives.length === 1 ? alternatives[0] : [{ alternatives, node: useNode }];
    };
    spreadEntries = (node, seen = new Set(), substitutions = new Map(), skipReaching = false) => {
      let expression = unwrapParentheses(node);
      let currentSeen = seen;
      for (;;) {
        if (ts.isObjectLiteralExpression(expression)) break;
        if (ts.isIdentifier(expression)) {
          const declaration = references.resolveIdentifier(expression);
          const substituted = declaration && substitutions.get(declaration);
          if (substituted) {
            expression = unwrapParentheses(substituted);
            continue;
          }
          if (!skipReaching) {
            const reaching = reachingObjectEntries(expression, node, currentSeen, substitutions);
            if (reaching) return reaching;
          }
        }
        if (ts.isCallExpression(expression)) {
          const returned = localCallReturns(expression, substitutions, currentSeen);
          if (!returned?.length) return undefined;
          const alternatives = returned.map((result) => spreadEntries(result.expression, result.seen, result.substitutions));
          if (!alternatives.every(Boolean)) return undefined;
          return alternatives.length === 1 ? alternatives[0] : [{ alternatives, node: expression }];
        }
        const resolved = staticValues.resolve(expression, currentSeen);
        if (!resolved || resolved.expression === expression) return undefined;
        expression = unwrapParentheses(resolved.expression);
        currentSeen = resolved.seen;
      }
      if (seen.has(expression)) return undefined;
      const nextSeen = new Set(currentSeen).add(expression);
      const result = [];
      for (const property of expression.properties) {
        if (ts.isSpreadAssignment(property)) {
          const nested = spreadEntries(property.expression, nextSeen, substitutions, skipReaching);
          if (nested) result.push(...nested);
          else result.push({ unknownSpread: true, node: property });
          continue;
        }
        const name = propertyName(property, sourceFile);
        if (!name) return undefined;
        if (ts.isPropertyAssignment(property)) result.push({ name, expression: property.initializer, node: property, substitutions });
        else if (ts.isShorthandPropertyAssignment(property)) result.push({ name, expression: property.name, node: property, substitutions });
        else if (ts.isMethodDeclaration(property)) result.push({ name, expression: property, node: property, substitutions });
        else if (ts.isGetAccessorDeclaration(property)) {
          const returned = localFunctionReturns(property, substitutions);
          if (!returned?.length) return undefined;
          const alternatives = returned.map((expression) => [{ name, expression, node: property, substitutions }]);
          if (alternatives.length === 1) result.push(...alternatives[0]);
          else result.push({ alternatives, node: property });
        }
        else return undefined;
      }
      return result;
    };
    for (const attribute of attributes) {
      if (ts.isJsxAttribute(attribute)) {
        const initializer = attribute.initializer;
        entries.push({
          name: attribute.name.getText(sourceFile),
          expression: initializer && ts.isJsxExpression(initializer) ? initializer.expression : initializer,
          node: attribute,
        });
      } else {
        const resolved = spreadEntries(attribute.expression);
        if (resolved) entries.push(...resolved);
        else entries.push({ unknownSpread: true, node: attribute });
      }
    }
      return entries.map((entry, index) => ({ ...entry, index }));
    };
    const expandAlternatives = (values) => values.reduce((states, entry) => {
      if (!entry.alternatives) return states.map((state) => [...state, entry]);
      return states.flatMap((state) => entry.alternatives.flatMap((alternative) => (
        expandAlternatives(alternative).map((expanded) => [...state, ...expanded])
      )));
    }, [[]]);

  function visit(node) {
    let directModuleName;
    if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node))
      && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) {
      directModuleName = node.moduleSpecifier.text;
    } else if (ts.isCallExpression(node) && node.arguments.length > 0
      && ts.isStringLiteral(node.arguments[0])
      && (node.expression.kind === ts.SyntaxKind.ImportKeyword
        || (ts.isIdentifier(node.expression) && node.expression.text === "require" && !references.resolveIdentifier(node.expression)))) {
      directModuleName = node.arguments[0].text;
    }
    if (!jsonEditorComponent && directModuleName
      && (/^monaco-editor(?:\/|$)/.test(directModuleName)
        || /^@monaco-editor\/(?:react|loader)(?:\/|$)/.test(directModuleName))) {
      report(node, "FRONTEND-DATA", "Monaco 只能通过共享 JsonEditor 使用，页面不得直引运行时或重复编辑器配置");
    }
    // 条件组编辑/展示只有一个入口：react-querybuilder 只能在共享 FilterRules 内使用
    if (!filterRulesComponent && directModuleName && /^(?:react-querybuilder|@react-querybuilder\/)/.test(directModuleName)) {
      report(node, "FRONTEND-COMPONENTS", "筛选条件组统一使用共享 FilterRules（可视化为主、JSON 为辅），页面不得直引 react-querybuilder");
    }
    // 图表只做展示：不把复制之类的动作挂在图形点击上（图表文件里禁止使用剪贴板入口）
    if (usesCharts && !chartLayer && ts.isIdentifier(node) && node.text === "useCopyToClipboard" && ts.isImportSpecifier(node.parent)
      && /onChartReady|\.on\(\s*["']click["']/.test(sourceFile.text)) {
      report(node, "FRONTEND-DATA", "图表只做展示，不承载复制等动作：可复制的值放在表格/字段网格的 CopyableValue 里");
    }
    // 二次确认与即时提示不得走命令式弹窗：Modal.confirm/info/success/error/warning、modal.confirm、Modal.useModal
    // 一律拒绝——确认锚在触发按钮上的共享 Popconfirm，结果反馈走 notify*，需要停留阅读的内容用受控 <Modal open>
    if (!sharedUI && ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)
      && ts.isIdentifier(node.expression.expression) && /^[Mm]odal$/.test(node.expression.expression.text)
      && (IMPERATIVE_MODAL_METHODS.has(node.expression.name.text) || node.expression.name.text === "useModal")) {
      report(node, "FRONTEND-COMPONENTS", "禁止命令式弹窗（Modal.confirm/info/success/error/warning、modal.*、Modal.useModal）：二次确认统一共享 Popconfirm，反馈走 notify*，需停留阅读的内容用受控 <Modal open>");
    }
    // 顺序调整统一拖动排序：业务不得再用“上移/下移”箭头按钮或原生 draggable（表格用 Table.sortable，列表用 SortableList）
    if (!sharedUI && ts.isJsxSelfClosingElement(node) && ts.isIdentifier(node.tagName) && /^(?:ArrowUpOutlined|ArrowDownOutlined)$/.test(node.tagName.text)) {
      for (let current = node.parent; current && !ts.isSourceFile(current); current = current.parent) {
        if ((ts.isJsxAttribute(current) && current.name.getText(sourceFile) === "icon")) {
          report(node, "FRONTEND-COMPONENTS", "顺序调整统一用拖动排序（表格 Table.sortable / 列表 SortableList），不再逐项摆“上移/下移”箭头按钮");
          break;
        }
        if (ts.isJsxElement(current) || ts.isJsxSelfClosingElement(current)) break;
      }
    }
    if (ts.isImportDeclaration(node) && ts.isStringLiteralLike(node.moduleSpecifier)
      && /^@dnd-kit\/(?:core|sortable|utilities|modifiers)$/.test(node.moduleSpecifier.text)) {
      report(node, "FRONTEND-COMPONENTS", "拖拽只用 @dnd-kit/react 系列（react/helpers/abstract/collision）：旧的 @dnd-kit/core、sortable、utilities 已移除，不得再引入");
    }
    if (!sharedUI && ts.isJsxAttribute(node) && node.name.getText(sourceFile) === "draggable") {
      report(node, "FRONTEND-COMPONENTS", "拖动排序统一走共享 SortableList / Table.sortable（dnd-kit：指针 + 键盘），不用原生 draggable");
    }
    // 固定操作尾列由共享 Table 接管，业务不自行锁定其他列。
    if (!sharedUI && ts.isPropertyAssignment(node) && propertyName(node, sourceFile) === "fixed"
      && ts.isStringLiteralLike(node.initializer) && /^(?:left|right|start|end)$/.test(node.initializer.text)
      && node.parent && ts.isObjectLiteralExpression(node.parent)
      && node.parent.properties.some((prop) => ts.isPropertyAssignment(prop) && propertyName(prop, sourceFile) === "title")) {
      report(node, "FRONTEND-LAYOUT", "固定操作尾列由共享 Table 接管：操作列使用 key=action，业务不得自行设置 fixed");
    }
    // 列用途名称保留为兼容入口，实际表头与正文均由共享层统一左对齐。
    if (!sharedUI && ts.isObjectLiteralExpression(node)) {
      const props = node.properties.filter(ts.isPropertyAssignment);
      const has = (name) => props.some((prop) => propertyName(prop, sourceFile) === name);
      if (has("title") && (has("dataIndex") || has("render"))) {
        const align = props.find((prop) => propertyName(prop, sourceFile) === "align");
        const width = props.find((prop) => propertyName(prop, sourceFile) === "width");
        if (width && ts.isCallExpression(width.initializer)
          && ts.isPropertyAccessExpression(width.initializer.expression)
          && width.initializer.expression.name.text === "actions"
          && isImportedReference(width.initializer.expression.expression, tableConfigNames, shadowDeclarations)) {
          const key = props.find((prop) => propertyName(prop, sourceFile) === "key");
          if (!key || !ts.isStringLiteralLike(key.initializer) || key.initializer.text !== "action") {
            report(node, "FRONTEND-TABLE", "操作列必须声明 key=action，由共享 Table 固定右侧尾列并按可用宽度收起文字");
          }
        }
        if (align) {
          const value = align.initializer;
          if (!ts.isPropertyAccessExpression(value) || !ts.isIdentifier(value.expression)
            || !isImportedReference(value.expression, columnAlignmentNames, shadowDeclarations) || !/^(?:text|number|control)$/.test(value.name.text)) {
            report(align, "FRONTEND-TABLE", "列对齐统一左对齐：使用共享 columnAlign.text/number/control 兼容入口，不写裸 align 或局部覆盖");
          }
        } else if (width && ts.isPropertyAccessExpression(width.initializer)
          && width.initializer.name.text === "number"
          && isImportedReference(width.initializer.expression, tableConfigNames, shadowDeclarations)) {
          report(width, "FRONTEND-TABLE", "数值标度列须使用共享 columnAlign 用途名称，text/number/control 均为左对齐");
        }
      }
    }
    // 列宽标度：columns 数组里每列的 width 只能取 columnWidth.*（20 的倍数、全站同一标度），且恰好留一列不写宽度作为主列吸收剩余宽度
    if (!sharedUI && ts.isArrayLiteralExpression(node)) {
      const columns = node.elements.filter(ts.isObjectLiteralExpression).filter((item) => {
        const names = item.properties.filter(ts.isPropertyAssignment).map((prop) => propertyName(prop, sourceFile));
        return names.includes("title") && (names.includes("dataIndex") || names.includes("render")) && !names.includes("children");
      });
      if (columns.length >= 2) {
        const actionColumns = columns.filter((column) => column.properties.some((prop) => ts.isPropertyAssignment(prop)
          && propertyName(prop, sourceFile) === "key" && ts.isStringLiteralLike(prop.initializer) && prop.initializer.text === "action"));
        if (actionColumns.length > 1 || (actionColumns.length === 1 && columns.at(-1) !== actionColumns[0])) {
          report(node, "FRONTEND-TABLE", "表格操作列恰好一列且必须位于最后，固定右侧后所有动作始终可见");
        }
        let flexCount = 0;
        for (const column of columns) {
          const width = column.properties.filter(ts.isPropertyAssignment).find((prop) => propertyName(prop, sourceFile) === "width");
          if (!width) { flexCount += 1; continue; }
          const text = width.initializer.getText(sourceFile);
          const percent = ts.isStringLiteralLike(width.initializer) && /%$/.test(width.initializer.text);
          if (!percent && !/^columnWidth\.(?:[a-z]+|actions\(\d+(?:,\s*\d+)?\))$/.test(text)) {
            report(width, "FRONTEND-LAYOUT", `列宽只能取共享 columnWidth 标度（handle/id/badge/number/time/name/code/text/long/actions(文字数, 图标数)），不得写死 ${text}`);
          }
        }
        if (flexCount > 1) {
          report(node, "FRONTEND-LAYOUT", `表格恰好留一列不写宽度作为主列吸收剩余空间，现在有 ${flexCount} 列没有宽度`);
        }
      }
    }
    // 下拉菜单只有一个候选时没有“选”可言：直接做成一个按钮，不拆成“按钮 + 下拉箭头”
    if (!sharedUI && ts.isObjectLiteralExpression(node)) {
      const items = node.properties.find((prop) => ts.isPropertyAssignment(prop) && propertyName(prop, sourceFile) === "items");
      const isMenu = node.properties.some((prop) => propertyName(prop, sourceFile) === "onClick")
        || (ts.isJsxExpression(node.parent) && ts.isJsxAttribute(node.parent.parent) && node.parent.parent.name.getText(sourceFile) === "menu");
      if (isMenu && items && ts.isArrayLiteralExpression(items.initializer) && items.initializer.elements.length <= 1
        && !items.initializer.elements.some(ts.isSpreadElement)) {
        report(items, "FRONTEND-COMPONENTS", "下拉菜单只有一个候选项：直接用一个写明动作的按钮，不做“按钮 + 下拉”");
      }
    }
    // 表格里的长文本列（说明/备注）：不换行撑高、不撑宽列、不省略隐藏——统一 LongText 单行封顶宽度、格内左右滚动
    if (!sharedUI && ts.isObjectLiteralExpression(node)) {
      const props = node.properties.filter(ts.isPropertyAssignment);
      const dataIndex = props.find((prop) => propertyName(prop, sourceFile) === "dataIndex");
      const dataIndexText = dataIndex && ts.isStringLiteralLike(dataIndex.initializer) ? dataIndex.initializer.text : undefined;
      const hasTitle = props.some((prop) => propertyName(prop, sourceFile) === "title");
      if (hasTitle && dataIndexText && /^(?:description|remark|remarks|note|notes|comment|desc)$/.test(dataIndexText)) {
        const render = props.find((prop) => propertyName(prop, sourceFile) === "render");
        // 结构化备注（JSON 等）量大且平时不看：格内只放共享 DetailDrawerButton，在抽屉里展开
        if (!render || !/<(?:LongText|TallContent|DetailDrawerButton)\b/.test(render.getText(sourceFile))) {
          report(node, "FRONTEND-TABLE", `表格长文本列 ${dataIndexText} 统一用共享 LongText（单行、左右滚动）/TallContent（多行、上下滚动）渲染，结构化备注用 DetailDrawerButton 在抽屉里展开，不得直接输出原文换行或省略`);
        }
      }
      const referenceField = entityReferenceColumns.some((entry) => filename.endsWith(entry.file) && entry.names.includes(dataIndexText));
      if (hasTitle && referenceField) {
        const render = props.find((prop) => propertyName(prop, sourceFile) === "render");
        let linked = false;
        const findLink = (child) => {
          if ((ts.isJsxOpeningElement(child) || ts.isJsxSelfClosingElement(child)) && references.matches(child.tagName, "@/components/ui", "ActionLink")) linked = true;
          ts.forEachChild(child, findLink);
        };
        if (render) findLink(render.initializer);
        if (!linked) report(node, "FRONTEND-NAVIGATION", `已登记关联字段 ${dataIndexText} 必须用共享 ActionLink 跳转关联实体详情，不能只展示文本`);
      }
      // 单元格里的多行结构化内容（条件树、JSON）直接写在格内并由 TallContent 封顶高度；
      // “N 个字段 + 查看图标 → 弹窗”会让整列只剩一个图标，空间全浪费
      const render = props.find((prop) => propertyName(prop, sourceFile) === "render");
      if (hasTitle && render) {
        const renderText = render.getText(sourceFile);
        if (/<(?:FilterRulesSummary|FilterRules)\b/.test(renderText) && !/<TallContent\b/.test(renderText)) {
          report(render, "FRONTEND-TABLE", "单元格里的条件树直接写在格内，并用共享 TallContent 封顶高度、格内上下滚动");
        }
        // 量大且平时不看的内容（JSON 备注、原始记录）不摊在格内：只放“图标 + 查看”，在共享 DetailDrawer 里展开
        if (/<JsonPreview\b/.test(renderText) && !/<DetailDrawerButton\b/.test(renderText)) {
          report(render, "FRONTEND-TABLE", "单元格里的 JSON 只放共享 DetailDrawerButton（图标 + 查看），在抽屉里展开，不摊在格内");
        }
        if (/<IconButton\b[^>]*icon=\{<EyeOutlined/.test(renderText)) {
          report(render, "FRONTEND-COMPONENTS", "“查看”入口统一是图标 + 文字：查看细则用共享 DetailDrawerButton，跳转详情用 ActionLink，不用纯图标 IconButton");
        }
      }
    }
    // 前端整批数据的表格（pagination={false}）必须声明展示顺序：orderBy 按统一比较器排，或 order="given" 注明顺序有含义
    if (!sharedUI && ts.isJsxOpeningLikeElement(node) && references.matches(node.tagName, "@/components/ui", "Table")) {
      const attrs = node.attributes.properties.filter(ts.isJsxAttribute);
      const attr = (name) => attrs.find((item) => item.name.text === name);
      const paginationOff = attr("pagination")?.initializer && ts.isJsxExpression(attr("pagination").initializer)
        && attr("pagination").initializer.expression?.kind === ts.SyntaxKind.FalseKeyword;
      if (paginationOff && !attr("orderBy") && !attr("order") && !attr("sortable")) {
        report(node, "FRONTEND-TABLE", "前端整批数据的表格必须声明展示顺序：orderBy={(row) => 可读文案}（统一比较器）或 order=\"given\"（顺序有含义，注释原因）");
      }
    }
    // 时间只有一个入口：业务代码不得直接 import dayjs 取“现在”/解析/格式化（会按设备时区解释），
    // 也不得 new Date()、写死 "+08:00"；全部走 utils/dateTime（业务时区固定，接口串按后端时区解释）
    const dateTimeUtility = /\/src\/utils\/dateTime\.ts$/.test(filename);
    const dayjsSetup = /\/src\/i18n\/index\.ts$/.test(filename);
    if (!dateTimeUtility && !dayjsSetup && ts.isImportDeclaration(node) && ts.isStringLiteralLike(node.moduleSpecifier)
      && /^dayjs(?:\/|$)/.test(node.moduleSpecifier.text) && !node.importClause?.isTypeOnly) {
      report(node, "FRONTEND-I18N", "时间统一走 utils/dateTime（now/parseServerTime/formatDateTime/toOffsetDateTime，业务时区固定），业务代码只能 import type { Dayjs }，不得直接用 dayjs 取现在、解析或格式化");
    }
    if (!dateTimeUtility && ts.isNewExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === "Date") {
      report(node, "FRONTEND-I18N", "时间统一走 utils/dateTime 的 now()/parseServerTime()，不得 new Date()（按设备时区解释）");
    }
    if (!dateTimeUtility && ts.isStringLiteralLike(node) && /[+-]0\d:00/.test(node.text) && /\d{2}:00/.test(node.text) && /HH|:mm|T/.test(node.text)) {
      report(node, "FRONTEND-I18N", "不得写死时区偏移（如 +08:00）；提交时间用 utils/dateTime 的 toOffsetDateTime");
    }
    // 展示日期分隔符统一为 "/"：业务代码不得自写 YYYY-MM-DD/MM-DD 这类格式串，展示与 DatePicker format 只取 utils/dateTime 的常量与 formatter
    if (!dateTimeUtility && ts.isStringLiteralLike(node) && /(?:YY|\bMM)-(?:MM|DD)\b/.test(node.text)) {
      report(node, "FRONTEND-I18N", "日期展示统一用 \"/\" 分隔（2026/09/16、09/16）：用 utils/dateTime 的 formatDate/formatDateTime/formatMonthDay/formatDateLabel 与 DATE_FORMAT 等常量，不得自写 YYYY-MM-DD/MM-DD 格式串");
    }
    // 列表 → 详情 → 编辑：路由只有三种形态（<列表>/new、<列表>/detail/:key、<列表>/detail/:key/edit）
    if (/(?:^|\/)src\/routes\/index\.tsx$/.test(filename) && ts.isPropertyAssignment(node) && propertyName(node, sourceFile) === "path"
      && ts.isStringLiteralLike(node.initializer) && node.initializer.text.includes(":")
      && !/^\/?[\w/-]+\/detail\/:\w+(?:\/edit)?$/.test(node.initializer.text)) {
      report(node, "FRONTEND-NAVIGATION", "带参数的路由只能是 <列表>/detail/:key 或 <列表>/detail/:key/edit（列表 → 详情 → 编辑三步）");
    }
    const pageFile = /(?:^|\/)src\/pages\//.test(filename);
    if (pageFile && (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node))) {
      const tag = node.tagName.getText(sourceFile);
      const attrNames = node.attributes.properties.filter(ts.isJsxAttribute).map((attr) => attr.name.getText(sourceFile));
      // 详情页 / 编辑页只有一种版式：页头说明区与页签由 EntityDetailPage 给出，保存条由 EntityEditPage 给出
      if (tag === "AppPage" && attrNames.some((name) => name === "tabList" || name === "content")) {
        report(node, "FRONTEND-NAVIGATION", "业务实体详情页统一用共享 EntityDetailPage（返回 + 对象名 + 状态 + 编辑在前的操作 + 摘要条 + 字段网格 + 页签），不得用 AppPage 自拼说明区与页签");
      }
      if (tag === "SaveBar") {
        report(node, "FRONTEND-NAVIGATION", "新建/编辑页统一用共享 EntityEditPage（返回 + 表单 + 底部保存条），页面不直接摆 SaveBar");
      }
      // 可排序的项本身是一块内容时，卡片由 SortableList variant="card" 给出、手柄在卡片内；项里不再自己套 Card
      if (tag === "SortableList") {
        const renderItem = node.attributes.properties.find((attr) => ts.isJsxAttribute(attr) && attr.name.getText(sourceFile) === "renderItem");
        if (renderItem && /<Card\b/.test(renderItem.getText(sourceFile))) {
          report(node, "FRONTEND-COMPONENTS", "可排序的卡片项用 SortableList variant=\"card\"（整项即卡片、拖动手柄在卡片内），renderItem 里不再套 Card");
        }
        // card 外观的手柄由项放进首行：renderItem 必须接住第三个参数（手柄），否则卡片里就没有拖动入口
        const variant = node.attributes.properties.find((attr) => ts.isJsxAttribute(attr) && attr.name.getText(sourceFile) === "variant");
        const fn = renderItem && ts.isJsxAttribute(renderItem) && renderItem.initializer && ts.isJsxExpression(renderItem.initializer) ? renderItem.initializer.expression : undefined;
        if (variant?.getText(sourceFile).includes('"card"') && fn && (ts.isArrowFunction(fn) || ts.isFunctionExpression(fn)) && fn.parameters.length < 3) {
          report(node, "FRONTEND-COMPONENTS", "SortableList variant=\"card\" 的拖动手柄是项首行里的小组件：renderItem 接第三个参数 handle 并放进首行，不另占一列");
        }
      }
      // 编辑已有对象（带 query 读取原对象）时面包屑上一级是这个对象的详情：必须给出对象名，显示名字并链回详情
      if (tag === "EntityEditPage" && attrNames.includes("query") && !attrNames.includes("objectName")) {
        report(node, "FRONTEND-NAVIGATION", "编辑已有对象的 EntityEditPage 必须传 objectName：面包屑上一级显示对象名（与详情页标题一致）并可点回详情");
      }
      // 对象的新建 / 编辑只有一种容器：DrawerForm（统一宽度的右侧抽屉）；Modal 包 Form 且没有自定义页脚（多步向导）即拒绝
      if (tag === "Modal" && ts.isJsxOpeningElement(node) && !attrNames.includes("footer")
        && /<Form\b/.test(node.parent.getText(sourceFile))) {
        report(node, "FRONTEND-NAVIGATION", "对象的新建 / 编辑统一用共享 DrawerForm；不改动对象的查询、导出工具用 ModalForm（submitter.action 为 query / export）");
      }
      // ModalForm 只承载一次性工具动作：必须声明 submitter.action 为 query 或 export，新建 / 编辑一律 DrawerForm
      if (tag === "ModalForm" && ts.isJsxOpeningElement(node)) {
        const submitter = node.attributes.properties.find((attribute) => ts.isJsxAttribute(attribute) && attribute.name.getText(sourceFile) === "submitter");
        if (!/action:\s*["'](?:query|export)["']/.test(submitter?.getText(sourceFile) ?? "")) {
          report(node, "FRONTEND-NAVIGATION", "ModalForm 只用于不改动对象的查询 / 导出（submitter.action 为 query / export）；对象的新建与编辑统一用 DrawerForm");
        }
      }
    }
    // 页面 index.tsx 只负责组合：表格列定义放同页 columns.tsx（buildXxxColumns），不在入口文件里堆列
    if (/(?:^|\/)src\/pages\/.+\/index\.tsx$/.test(filename) && ts.isTypeReferenceNode(node)
      && /^(?:TableColumnsType|ColumnsType)$/.test(node.typeName.getText(sourceFile))) {
      report(node, "FRONTEND-COMPONENTS", "页面 index.tsx 只负责组合：表格列定义放同页 columns.tsx（导出 buildXxxColumns），不在入口文件内定义列");
    }
    // 状态标签的文案可经局部变量和翻译别名传入；沿真实词法绑定追踪，不扫描同名遮蔽函数。
    if (ts.isJsxElement(node) && (references.matches(node.openingElement.tagName, "@/components/ui", "StatusTag") || (ts.isIdentifier(node.openingElement.tagName) && node.openingElement.tagName.text === "StatusTag" && !references.resolveIdentifier(node.openingElement.tagName)))) {
      const containsActionLabel = (expression, seen = new Set()) => {
        if (!expression) return false;
        if (ts.isIdentifier(expression)) {
          const declaration = references.resolveIdentifier(expression);
          if (declaration?.owner.initializer && !seen.has(declaration.node)) {
            return containsActionLabel(declaration.owner.initializer, new Set(seen).add(declaration.node));
          }
        }
        if (ts.isCallExpression(expression)) {
          const key = staticPrimitive(expression.arguments[0])?.value;
          const callee = unwrapParentheses(expression.expression);
          const declaration = ts.isIdentifier(callee) ? references.resolveIdentifier(callee) : undefined;
          const translator = isTranslationFunction(callee) || references.matches(callee, "@/i18n", "default")
            || (ts.isIdentifier(callee) && translationNames.has(callee.text) && (!declaration || ts.isParameter(declaration.owner)));
          if (translator && typeof key === "string" && key.startsWith("common.actions.")) return true;
        }
        let found = false;
        ts.forEachChild(expression, (child) => { if (containsActionLabel(child, seen)) found = true; });
        return found;
      };
      if (node.children.some(child => containsActionLabel(child))) {
        report(node, "FRONTEND-TABLE", "状态标签写状态（common.vocab.enabled / disabled 等），不用 common.actions.* 动作动词");
      }
    }
    // 进入对象详情只有一种入口：操作列第一个“详情”（ActionLink + EyeOutlined + common.vocab.detail）；
    // 名称链接（variant="name"）只用于引用别的对象（LinkOutlined），不兼作本对象的详情入口
    if (pageFile && ts.isJsxElement(node) && node.openingElement.tagName.getText(sourceFile) === "ActionLink") {
      const opening = node.openingElement.getText(sourceFile);
      const eye = /EyeOutlined/.test(opening);
      if (eye && /variant=["']name["']/.test(opening)) {
        report(node, "FRONTEND-NAVIGATION", "进入本对象详情统一用操作列第一个“详情”（ActionLink + EyeOutlined），名称不兼作详情链接；名称链接只用于引用别的对象（LinkOutlined）");
      } else if (eye && !/common\.vocab\.detail/.test(node.children.map((child) => child.getText(sourceFile)).join(""))) {
        report(node, "FRONTEND-NAVIGATION", "详情入口文案统一为 t(\"common.vocab.detail\")（详情），不得写成查看、打开等别的说法");
      }
    }
    // 编辑入口只在详情页：列表行里不放跳转到编辑页的“编辑”，没有例外（授权配置同样是 列表 → 详情 → 编辑）
    if (pageFile && ts.isJsxOpeningElement(node) && /^(?:Button|ActionLink)$/.test(node.tagName.getText(sourceFile))
      && isInsideCellRenderer(node, sourceFile) && /EditOutlined/.test(node.getText(sourceFile))
      && /navigate\(|\bto=/.test(node.getText(sourceFile))) {
      report(node, "FRONTEND-NAVIGATION", "业务实体的编辑入口只在详情页：列表行操作列第一个是“详情”，行内不放跳转到编辑页的“编辑”");
    }
    // 列表只放识别、状态与关键指标：一张表最多 8 列（含操作列），其余属性进详情页的字段网格
    if (pageFile && ts.isArrayLiteralExpression(node) && node.elements.length > 8
      && node.elements.every((element) => ts.isObjectLiteralExpression(element) && element.properties.some((property) => ts.isPropertyAssignment(property) && propertyName(property, sourceFile) === "title"))
      && node.elements.some((element) => ts.isObjectLiteralExpression(element) && element.properties.some((property) => ts.isPropertyAssignment(property) && propertyName(property, sourceFile) === "render"))) {
      report(node, "FRONTEND-TABLE", `列表最多 8 列（当前 ${node.elements.length} 列）：只放识别、状态与关键指标，其余属性放进详情页的字段网格`);
    }
    // 只读字段不用禁用的文本框：禁用控件不能聚焦，长值放不下时既看不全也滚不动；用共享 ReadonlyValue（单行值滚动槽位）
    if (pageFile && ts.isJsxSelfClosingElement(node) && node.tagName.getText(sourceFile) === "Input"
      && node.attributes.properties.some((attribute) => ts.isJsxAttribute(attribute) && attribute.name.getText(sourceFile) === "disabled")) {
      report(node, "FRONTEND-COMPONENTS", "编辑页里不可修改的字段用共享 ReadonlyValue 只读展示，不用 disabled 的 Input（禁用控件不能聚焦，长值滚不动）");
    }
    // 不放指向不存在功能的入口：跳回首页冒充“个人中心 / 设置”之类的占位菜单即拒绝（404 页的“回首页”除外）
    if (!/(?:^|\/)src\/pages\/404Page\//.test(filename) && ts.isCallExpression(node)
      && node.expression.getText(sourceFile) === "navigate" && /^["'`]\/["'`]$/.test(node.arguments[0]?.getText(sourceFile) ?? "")) {
      report(node, "FRONTEND-NAVIGATION", "不放指向不存在功能的入口：没有对应页面的菜单项、按钮直接删掉，不用 navigate(\"/\") 占位");
    }
    // 列表不展示无业务含义的自增 ID：识别靠名称 / 标题等业务标识，自增 ID 只在详情页字段网格里出现
    if (pageFile && ts.isObjectLiteralExpression(node)
      && node.properties.some((property) => ts.isPropertyAssignment(property) && propertyName(property, sourceFile) === "title"
        && /common\.vocab\.id["']/.test(property.initializer.getText(sourceFile)))
      && node.properties.some((property) => ts.isPropertyAssignment(property) && /^(?:dataIndex|key)$/.test(propertyName(property, sourceFile) ?? ""))) {
      const field = node.properties.find(property => ts.isPropertyAssignment(property) && /^(?:dataIndex|key)$/.test(propertyName(property, sourceFile) ?? ""))?.initializer;
      const registered = externalFixedOrderTables.some(contract => contract.columns === filename.replace(/^\//, "") && contract.field === "id" && contract.order === "descend" && contract.interactive === false && contract.endpoint && contract.reason?.trim());
      if (!registered || !field || !ts.isStringLiteral(field) || field.text !== "id") report(node, "FRONTEND-TABLE", "列表不放自增 ID 列：仅明确登记的外部固定排序契约允许展示真实 ID，且由排序门禁核对实际接口及默认顺序");
    }
    // 详情页必须有字段之外的东西（派生只读信息、从属数据或状态动作）：只有可编辑字段的对象是配置条目，用列表 + 抽屉
    if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
      if (node.tagName.getText(sourceFile) === "EntityDetailPage") {
        const props = node.attributes.properties.filter(ts.isJsxAttribute).map((attribute) => attribute.name.getText(sourceFile));
        const hasChildren = ts.isJsxOpeningElement(node) && ts.isJsxElement(node.parent)
          && node.parent.children.some((child) => !(ts.isJsxText(child) && child.text.trim() === ""));
        if (!props.some((name) => ["summary", "tabs", "actions"].includes(name)) && !hasChildren) {
          report(node, "FRONTEND-NAVIGATION", "详情页要承载字段以外的信息（摘要指标、页签里的从属数据、状态动作或只读明细）；只有可编辑字段的对象是配置条目，用列表 + DrawerForm");
        }
      }
    }
    // 时间列合一：同一张表出现两个以上时间列（columnWidth.time）即拒绝——起止时间合成“开始 → 结束”，
    // 不同含义的时间（周期 / 最后同步）合成一列两行，不在列表里铺成并排的时间列
    if (ts.isArrayLiteralExpression(node)
      && node.elements.filter((element) => ts.isObjectLiteralExpression(element)
        && element.properties.some((property) => ts.isPropertyAssignment(property) && propertyName(property, sourceFile) === "width"
          && /columnWidth\.time\b/.test(property.initializer.getText(sourceFile)))).length >= 2) {
      report(node, "FRONTEND-TABLE", "一张表只保留一个时间列：起止时间合成“开始 → 结束”，不同含义的时间合成一列两行（纵向 Stack）");
    }
    // 业务实体列表的行内操作只有“详情”与危险操作：同一单元格里有详情入口（ActionLink + EyeOutlined）时，
    // 其余按钮必须是危险操作（danger / color="danger"）；启用、同步、查询、编辑等都放详情页头
    if (pageFile && ts.isJsxOpeningElement(node) && node.tagName.getText(sourceFile) === "Button" && isInsideCellRenderer(node, sourceFile)) {
      let renderer = node.parent;
      while (renderer && !(ts.isPropertyAssignment(renderer) && renderer.name.getText(sourceFile) === "render")) renderer = renderer.parent;
      const rendererText = renderer?.getText(sourceFile) ?? "";
      const hasDetailEntry = /<ActionLink\b[^>]*EyeOutlined/.test(rendererText);
      const danger = node.attributes.properties.some((attribute) => ts.isJsxAttribute(attribute)
        && (attribute.name.getText(sourceFile) === "danger" || (attribute.name.getText(sourceFile) === "color" && /danger/.test(attribute.initializer?.getText(sourceFile) ?? ""))));
      if (hasDetailEntry && !danger) {
        report(node, "FRONTEND-NAVIGATION", "有详情页的列表，行内除“详情”外只留危险操作（删除等）；其余动作放到详情页头");
      }
    }
    // 页面名只有一个来源：导航树（routes/index.tsx）同时驱动侧边栏、面包屑和一级标题。
    // AppPage 的 title 只给导航树给不出的名字（新建/编辑两态、详情页对象名），写死 t("...") 的固定标题会与菜单/面包屑分叉
    if (ts.isJsxAttribute(node) && node.name.getText(sourceFile) === "title" && node.initializer && ts.isJsxExpression(node.initializer)
      && node.initializer.expression && ts.isCallExpression(node.initializer.expression)
      && /^(?:t|i18n\.t)$/.test(node.initializer.expression.expression.getText(sourceFile))) {
      const element = node.parent.parent;
      if ((ts.isJsxOpeningElement(element) || ts.isJsxSelfClosingElement(element)) && element.tagName.getText(sourceFile) === "AppPage") {
        report(node, "FRONTEND-NAVIGATION", "页面标题与侧边栏、面包屑同源：固定页面名写在导航树（routes/index.tsx 的 label），AppPage 不传固定 title；只有新建/编辑两态或详情对象名才传");
      }
    }
    // 权限点列表只有一个视图：表格列标题为“权限点”的列表必须由共享 PermissionPointTable 渲染（搜索 + 状态计数筛选 + 统一首列 + 全局分页），
    // 业务页面不得自建权限点表格或树视图
    const permissionPointTableFile = /(?:^|\/)src\/components\/PermissionPointTable\//.test(filename);
    if (!permissionPointTableFile && ts.isPropertyAssignment(node) && propertyName(node, sourceFile) === "title"
      && ts.isCallExpression(node.initializer) && /^(?:t|i18n\.t)$/.test(node.initializer.expression.getText(sourceFile))
      && node.initializer.arguments[0] && ts.isStringLiteralLike(node.initializer.arguments[0])
      && node.initializer.arguments[0].text === "common.vocab.searchPermissions"
      && ts.isObjectLiteralExpression(node.parent)
      && node.parent.properties.some((property) => ["render", "dataIndex", "key"].includes(property.name?.getText(sourceFile) ?? ""))) {
      report(node, "FRONTEND-TABLE", "权限点列表统一用共享 PermissionPointTable（搜索 + 状态计数筛选 + 统一“权限点”首列 + 全局分页），不得自建权限点表格列");
    }
    // 换个表头也一样：列里同时有“对象”“操作”、却没有“主体”的表格就是权限点列表（有“主体”的是原始授权规则表）。
    // 例外只有导入预览：它是“当前值 → 新值”的变更对比，不是权限点状态列表
    const permissionImportDiff = /\/PermissionDefinitionImportPreview\.tsx$/.test(filename);
    if (!permissionPointTableFile && !permissionImportDiff && ts.isArrayLiteralExpression(node)) {
      const columnTitles = new Set(node.elements.flatMap((element) => {
        if (!ts.isObjectLiteralExpression(element)) return [];
        const titleProperty = element.properties.find((property) => ts.isPropertyAssignment(property) && propertyName(property, sourceFile) === "title");
        const call = titleProperty?.initializer;
        return call && ts.isCallExpression(call) && call.arguments[0] && ts.isStringLiteralLike(call.arguments[0]) ? [call.arguments[0].text] : [];
      }));
      if (columnTitles.has("common.vocab.object") && columnTitles.has("common.vocab.action") && !columnTitles.has("common.vocab.subject")) {
        report(node, "FRONTEND-TABLE", "列出对象 + 操作的表格就是权限点列表，统一用共享 PermissionPointTable（首列显示权限定义名称与 obj · act），不得自建“对象/操作”表格；原始授权规则表须带“主体”列");
      }
    }
    if (/(?:^|\/)src\/pages\//.test(filename) && ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier) && node.moduleSpecifier.text === "antd"
      && node.importClause?.namedBindings && ts.isNamedImports(node.importClause.namedBindings)
      && node.importClause.namedBindings.elements.some((element) => (element.propertyName ?? element.name).text === "Tree")) {
      report(node, "FRONTEND-TABLE", "业务页面不使用 Ant Tree：层级/权限点列表用共享表格视图（PermissionPointTable、目录树行等），不另做树视图");
    }
    // 展示顺序只有一个比较器：业务代码不得直接 localeCompare / new Intl.Collator，统一走 utils/collation 的 compareText/sortByText
    const collationUtility = /\/src\/utils\/collation\.ts$/.test(filename);
    if (!collationUtility && ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression) && node.expression.name.text === "localeCompare") {
      report(node, "FRONTEND-TABLE", "排序比较统一走 utils/collation 的 compareText/sortByText（中文拼音、数字按数值、忽略大小写），业务代码不得直接 localeCompare——同样内容在不同地方顺序会不一样");
    }
    if (!collationUtility && ts.isNewExpression(node) && ts.isPropertyAccessExpression(node.expression)
      && ts.isIdentifier(node.expression.expression) && node.expression.expression.text === "Intl" && node.expression.name.text === "Collator") {
      report(node, "FRONTEND-TABLE", "排序比较器只在 utils/collation 定义一次，业务代码不得另建 Intl.Collator");
    }
    // 表格单元格里的标签集合：不换行摊开（撑高行）、不折叠 +N（藏信息），统一 InlineList 单行左右滚动、默认按文案排序
    if (!sharedUI && ts.isJsxElement(node) && ts.isIdentifier(node.openingElement.tagName)
      && /^(?:Space|Stack)$/.test(node.openingElement.tagName.text)
      && node.openingElement.attributes.properties.some((item) => ts.isJsxAttribute(item) && item.name.getText(sourceFile) === "wrap")
      && isInsideCellRenderer(node, sourceFile)
      && /\.map\(/.test(node.getText(sourceFile)) && /<(?:StatusTag|MetadataTag|Tag)\b/.test(node.getText(sourceFile))) {
      report(node, "FRONTEND-TABLE", "表格单元格里的标签集合统一用共享 InlineList（单行、放不下左右滚动、默认按文案排序），不得用 Space/Stack wrap 换行摊开");
    }
    if (!sharedUI && ts.isPropertyAccessExpression(node) && ts.isIdentifier(node.expression)
      && node.expression.text === "navigator" && node.name.text === "clipboard") {
      report(node, "FRONTEND-COMPONENTS", "剪贴板写入只能通过共享 useCopyToClipboard/CopyableValue，业务代码不得直接访问 navigator.clipboard");
    }
    // 操作组顺序：同一组（JSX 兄弟或数组）内中性动作在前、危险动作在后，删除永远最后
    if (!sharedUI && (ts.isJsxElement(node) || ts.isArrayLiteralExpression(node))) {
      const items = ts.isJsxElement(node) ? node.children.filter((child) => !ts.isJsxText(child)) : node.elements;
      const describe = (item) => {
        const el = ts.isJsxElement(item) ? item.openingElement : ts.isJsxSelfClosingElement(item) ? item : undefined;
        if (!el) return undefined;
        const tag = el.tagName.getText(sourceFile);
        if (tag === "Popconfirm" && ts.isJsxElement(item)) {
          for (const child of item.children) { const inner = describe(child); if (inner) return inner; }
          return undefined;
        }
        if (!/^(?:Button|IconButton|ActionLink)$/.test(tag)) return undefined;
        const attrs = el.attributes.getText(sourceFile);
        return { danger: /color=\{?"danger"/.test(attrs), remove: /<DeleteOutlined/.test(attrs) };
      };
      const actions = items.map(describe).filter(Boolean);
      if (actions.length >= 2 && ts.isJsxElement(node)) {
        const containerTag = node.openingElement.tagName.getText(sourceFile);
        if (!/^(?:ResponsiveActions|Popconfirm)$/.test(containerTag)) {
          report(node, "FRONTEND-COMPONENTS", "并列的多个操作（Button/IconButton/ActionLink）必须放在共享 ResponsiveActions 内（flex 居中对齐、统一间距、窄屏整项换行），不得用 div/Space/Fragment 加空 span 间隔拼排");
        }
      }
      if (actions.length >= 2) {
        const firstDanger = actions.findIndex((a) => a.danger);
        const lastNeutral = actions.map((a) => !a.danger).lastIndexOf(true);
        const removeIdx = actions.findIndex((a) => a.remove);
        if ((firstDanger >= 0 && lastNeutral > firstDanger) || (removeIdx >= 0 && removeIdx !== actions.length - 1)) {
          report(node, "FRONTEND-COMPONENTS", "操作组顺序统一：中性动作（查看/编辑/启用/同步）在前，危险动作（重置/禁用/下线）在后，删除永远最后");
        }
      }
    }
    // 批量写操作必须走后端批量接口：Promise.all/allSettled 包住 .map(…)（或数组里展开的多个 .map(…)）
    // 逐条调用写接口（post/put/delete/create/update/remove 前缀的服务函数）即拒绝；并发读取不在此列。
    if (!sharedUI && ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)
      && ts.isIdentifier(node.expression.expression) && node.expression.expression.text === "Promise"
      && ["all", "allSettled"].includes(node.expression.name.text)) {
      const argument = node.arguments[0];
      const isMapCall = (candidate) => candidate && ts.isCallExpression(candidate) && ts.isPropertyAccessExpression(candidate.expression)
        && candidate.expression.name.text === "map";
      const mapCalls = isMapCall(argument) ? [argument]
        : argument && ts.isArrayLiteralExpression(argument)
          ? argument.elements.map((element) => (ts.isSpreadElement(element) ? element.expression : element)).filter(isMapCall)
          : [];
      for (const mapCall of mapCalls) {
        let loopsService = false;
        const scan = (inner) => {
          if (loopsService) return;
          if (ts.isCallExpression(inner) && ts.isIdentifier(inner.expression)) {
            const origin = references.origin(inner.expression);
            if (origin && SERVICES_MODULE.test(origin.moduleName)
              && /^(?:post|put|delete|create|update|remove)/i.test(origin.imported === "default" ? inner.expression.text : origin.imported)) loopsService = true;
          }
          ts.forEachChild(inner, scan);
        };
        scan(mapCall);
        if (loopsService) {
          report(node, "FRONTEND-DATA", "批量写操作不得循环调用单条接口；由后端提供批量接口，前端一次提交并展示成功/失败计数");
          break;
        }
      }
    }
    // 小数位全局上限三位：业务代码不得直接 toFixed/toLocaleString，统一走 @/utils/number
    const numberUtility = /\/src\/utils\/number\.ts$/.test(filename);
    if (!numberUtility && ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)
      && ["toFixed", "toLocaleString"].includes(node.expression.name.text)) {
      report(node, "FRONTEND-DATA", `数值展示不得直接 ${node.expression.name.text}；使用 @/utils/number 的 formatDecimal/formatInteger/formatPercent/formatCurrency（小数位上限三位）`);
    }
    // 筛选下拉“空即全部”：不得再造 value:"all"/"" 且文案为“全部/不限/任意”的哨兵选项，清除用 allowClear
    if (!sharedUI && ts.isObjectLiteralExpression(node)) {
      const props = node.properties.filter(ts.isPropertyAssignment);
      const valueProp = props.find((prop) => (propertyName(prop, sourceFile) ?? "") === "value");
      const labelProp = props.find((prop) => (propertyName(prop, sourceFile) ?? "") === "label");
      const valueText = valueProp ? valueProp.initializer.getText(sourceFile) : "";
      const labelText = labelProp ? labelProp.initializer.getText(sourceFile) : "";
      if (valueProp && labelProp && /^(?:"all"|""|"\*"|undefined|null)$/.test(valueText.trim()) && (/"(?:全部|不限|任意|All|Any)"/.test(labelText) || /["'][^"']*\.(?:all|any|unlimited)["']/.test(labelText))) {
        report(node, "FRONTEND-TABLE", "筛选条件以空值代表全部：删除“全部/不限”哨兵选项，用 allowClear 清除条件");
      }
    }
    if (usesCharts && !chartLayer && ts.isStringLiteralLike(node) && node.text === "common.chart.other") {
      report(node, "FRONTEND-DATA", "图表不得把数据折叠成“其他”：全部系列/分片都要画出，颜色由 40 档派生色板按顺序分配，条目多则滚动");
    }
    if (ts.isPropertyAssignment(node)) {
      const name = propertyName(node, sourceFile) ?? "";
      if (usesCharts && !chartLayer && (isInsideChartOption(node, sourceFile) || CHART_OPTION_ROOTS.has(name))) {
        // 图表外观由共享主题接管：业务 option 不得手写提示框/图例/坐标轴样式、字号、缩放与工具箱
        if (CHART_THEME_ONLY_PROPERTY.has(name)) report(node, "FRONTEND-DATA", `图表外观由共享主题（components/ReactEcharts/chartTheme）统一，业务 option 不得手写 ${name}`);
        if (CHART_FORBIDDEN_FEATURE.has(name) && node.initializer.kind !== ts.SyntaxKind.FalseKeyword) report(node, "FRONTEND-DATA", `图表不提供 ${name}：不做缩放/放大/类型切换，形态与范围由页面筛选决定`);
        if (name === "formatter" && isFunctionLike(node.initializer) && isInsideTooltipOption(node, sourceFile)) {
          report(node, "FRONTEND-DATA", "提示框只用 ECharts 自带的 valueFormatter（chartValueFormatters）与 dataset 维度名，不手写 HTML formatter");
        }
        if (name === "color" && isCyclingPaletteIndex(node.initializer, sourceFile)) {
          report(node, "FRONTEND-DATA", "分类色按固定顺序由主题的 40 档派生色板分配，不得按索引取模循环取色");
        }
      }
      // 版式统一由共享入口（withSharedLayout）决定：图例固定顶部一行分页，网格上下左右随图例/轴名留白，环形圆心随图例下移；
      // 业务 legend 只能声明 data/show/selected，grid 只能声明 containLabel/width/height，pie 不得设 center/radius
      if (usesCharts && !chartLayer && node.parent && ts.isObjectLiteralExpression(node.parent) && node.parent.parent && ts.isPropertyAssignment(node.parent.parent)) {
        const owner = propertyName(node.parent.parent, sourceFile);
        if (owner === "legend" && !/^(?:data|show|selected|selectedMode)$/.test(name)) {
          report(node, "FRONTEND-DATA", `图例位置与溢出方式由共享入口统一（顶部一行、分页），业务 legend 不得设置 ${name}`);
        }
      }
      if (usesCharts && !chartLayer && /^(?:center|radius)$/.test(name) && node.parent && ts.isObjectLiteralExpression(node.parent)
        && node.parent.properties.some((item) => ts.isPropertyAssignment(item) && propertyName(item, sourceFile) === "type" && ts.isStringLiteralLike(item.initializer) && item.initializer.text === "pie")) {
        report(node, "FRONTEND-DATA", `环形图的圆心与半径由共享主题/入口统一，业务不得设置 ${name}`);
      }
      // 网格留白只由共享入口与主题决定
      // （例外：网格自带 width/height 的内容定几何图，以及坐标轴全部隐藏的迷你图，本就没有留白概念）
      if (usesCharts && !chartLayer && /^(?:left|right|top|bottom)$/.test(name) && node.parent && ts.isObjectLiteralExpression(node.parent)
        && node.parent.parent && ts.isPropertyAssignment(node.parent.parent) && propertyName(node.parent.parent, sourceFile) === "grid"
        && !node.parent.properties.some((item) => ts.isPropertyAssignment(item) && /^(?:width|height)$/.test(propertyName(item, sourceFile) ?? ""))
        && !axesHidden(node.parent.parent, sourceFile)) {
        report(node, "FRONTEND-DATA", `图表网格留白由共享入口按图例/轴名统一，业务 option 不得设置 grid.${name}`);
      }
      // 类目轴标签列按内容定宽（categoryAxisLabel）：写死 axisLabel.width 会在名称很短时留下大片空白
      if (usesCharts && !chartLayer && name === "width" && ts.isNumericLiteral(node.initializer)
        && node.parent && ts.isObjectLiteralExpression(node.parent) && node.parent.parent && ts.isPropertyAssignment(node.parent.parent)
        && propertyName(node.parent.parent, sourceFile) === "axisLabel") {
        report(node, "FRONTEND-DATA", "类目轴标签宽度不得写死：用 categoryAxisLabel(names) 按最长名称定宽并封顶");
      }
      // 轴名与图例重复：有图例且系列有名字时，值轴不再写 name（轴末尾的轴名会挤出网格、溢出卡片）
      if (usesCharts && !chartLayer && name === "name" && node.parent && ts.isObjectLiteralExpression(node.parent)
        && isInsideAxisOption(node, sourceFile) && optionHasLegend(node, sourceFile)) {
        report(node, "FRONTEND-DATA", "有图例的图表不再写值轴 name：轴的含义由图例说明，轴末轴名会溢出网格");
      }
      // 突出显示的取值顺序：库自带可选项里选合适的（emphasis.focus 的枚举值，只在共享主题里选）→ 库默认 →
      // 都不满足才在共享层统一定制。业务 option 不得碰高亮；任何层都不得手写高亮样式（emphasis.itemStyle/blur/select/shadowStyle）
      if ((usesCharts || chartLayer) && (isInsideChartOption(node, sourceFile) || chartLayer)) {
        if (/^(?:blur|select|shadowStyle)$/.test(name)) {
          report(node, "FRONTEND-DATA", `图表突出显示不得手写 ${name} 样式：只能在共享主题里选用 emphasis.focus/blurScope 的内置选项`);
        }
        if (name === "emphasis") {
          if (!chartLayer) report(node, "FRONTEND-DATA", "业务 option 不得设置 emphasis：突出显示由共享主题按系列类型选定内置选项");
          else if (!ts.isObjectLiteralExpression(node.initializer)
            || node.initializer.properties.some((item) => !ts.isPropertyAssignment(item) || !/^(?:focus|blurScope)$/.test(propertyName(item, sourceFile) ?? "") || !ts.isStringLiteralLike(item.initializer))) {
            report(node, "FRONTEND-DATA", "共享主题的 emphasis 只能选 focus/blurScope 的内置选项（字符串枚举），不得手写 itemStyle/label/scale 等高亮样式");
          }
        }
        if (name === "blurScope" && ts.isStringLiteralLike(node.initializer) && !/^(?:coordinateSystem|series|global)$/.test(node.initializer.text)) {
          report(node, "FRONTEND-DATA", `blurScope 只能取 coordinateSystem/series/global，不得用 "${node.initializer.text}"`);
        }
        // 悬停必须有聚焦效果：focus 只能从 self/series/adjacency 里选，none（只提亮所指图元）不够醒目
        if (name === "focus" && ts.isStringLiteralLike(node.initializer) && !/^(?:self|series|adjacency)$/.test(node.initializer.text)) {
          report(node, "FRONTEND-DATA", `focus 只能选 self/series/adjacency，不得用 "${node.initializer.text}"：悬停必须把所指图元从其余内容里聚焦出来`);
        }
      }
      // 共享主题里每种系列类型都必须选定一个 focus（不选就落回 none）
      if (chartLayer && CHART_SERIES_TYPES.has(name) && ts.isObjectLiteralExpression(node.initializer)
        && node.parent && ts.isObjectLiteralExpression(node.parent) && node.parent.parent && (ts.isReturnStatement(node.parent.parent) || ts.isVariableDeclaration(node.parent.parent))) {
        const emphasis = node.initializer.properties.find((item) => ts.isPropertyAssignment(item) && propertyName(item, sourceFile) === "emphasis");
        if (!emphasis) report(node, "FRONTEND-DATA", `共享主题的 ${name} 系列必须选定 emphasis.focus（self/series/adjacency），否则悬停没有聚焦效果`);
      }
      if (name === "formatter" && ts.isStringLiteralLike(node.initializer) && /\{[cd]\}/.test(node.initializer.text)) {
        report(node.initializer, "FRONTEND-DATA", "图表数值不得用 {c}/{d} 字符串模板直出原始值；用函数 formatter 经 formatDecimal/formatPercent 限制小数位");
      }
      if (DIMENSION_PROPERTY.test(name) && containsRawDimension(node.initializer, staticValues)) report(node.initializer, "FRONTEND-THEME", "字号、圆角和间距必须使用设计标度");
      if (MARGIN_PROPERTY.test(name) && containsUnaryMinus(node.initializer)) report(node.initializer, "FRONTEND-LAYOUT", "禁止使用负外边距补救布局；由父布局或组件变体管理间距");
      // 间隔只由容器 gap 表达：业务层禁止 margin（清零除外），改用共享 Stack/ContentStack/PageStack/ResponsiveActions
      if (!sharedUI && MARGIN_PROPERTY.test(name) && !isZeroDimension(node.initializer) && isInsideJsxStyle(node, sourceFile)) {
        report(node, "FRONTEND-LAYOUT", "业务层禁止用 margin 制造间隔：把同级元素放进共享 Stack（gap=page/block/control/tight）或 ResponsiveActions，由容器 gap 统一间距");
      }
      // gap 类间距只有四档角色：24/16/8/4（page/block/control/tight）
      if (!sharedUI && /^(?:gap|rowGap|columnGap)$/.test(name) && !isRoleSpacingToken(node.initializer)) {
        report(node, "FRONTEND-LAYOUT", "gap 只能取四档角色间距 designTokens.space.xl/lg/sm/xs（24/16/8/4），其余档位不用于组件之间的间隔");
      }
      if (!themeSource && name === "fontFamily" && !isDesignFontToken(node.initializer, designTokenNames, shadowDeclarations)) report(node.initializer, "FRONTEND-THEME", "字体族必须直接使用统一设计 token");
      if (isColorProperty(name) && containsRawColorExpression(node.initializer, sourceFile, staticValues)) report(node.initializer, "FRONTEND-THEME", "颜色必须使用设计角色");
      // 遮罩色是半透明黑，只能做背景/阴影/遮罩；用作文字或边框在暗色下就是“黑字”
      if (/^(?:color|textColor|valueColor|labelColor|borderColor|iconColor)$/.test(name) && /--ds-color-scrim/.test(node.initializer.getText(sourceFile))) {
        report(node.initializer, "FRONTEND-THEME", "scrim 遮罩色不得用作文字/边框颜色；文字只能用 text/text-secondary/text-tertiary");
      }
      if (!isColorProperty(name) && isPrivatePaletteProperty(node, sourceFile)) report(node.initializer, "FRONTEND-THEME", "私有调色板不得定义裸颜色；颜色必须来自统一设计角色");
      if (isInsideOrdinaryChartColor(node.initializer, sourceFile)) report(node.initializer, "FRONTEND-DATA", "普通图表系列只能使用 designTokens.color.data 数据色，不得借用状态色");
      if (VIEWPORT_HEIGHT_PROPERTY.has(name) && LEGACY_VIEWPORT_HEIGHT.test(node.initializer.getText(sourceFile)) && isInsideJsxStyle(node, sourceFile)) report(node.initializer, "FRONTEND-LAYOUT", "DOM 高度使用动态视口单位 dvh，禁止旧 vh");
      if (name.includes(".ant-")) report(node.name, "FRONTEND-THEME", "CSS-in-JS 禁止覆盖 Ant Design 内部 DOM");
      if (name === "textOverflow" && /["']ellipsis["']/.test(node.initializer.getText(sourceFile))) report(node, "FRONTEND-TOOLTIP", "过长内容统一在自身范围内左右滚动（单行值用 AtomicValue，单元格长说明用 LongText），不省略、不靠悬停 Tooltip 看全文");
      if (name === "ellipsis" && node.initializer.kind === ts.SyntaxKind.TrueKeyword) report(node, "FRONTEND-TOOLTIP", "过长内容统一在自身范围内左右滚动（单行值用 AtomicValue，单元格长说明用 LongText），不省略、不靠悬停 Tooltip 看全文");
      if (name === "placeholder" && !sharedUI && isJsxAttributeObject(node)) report(node, "FRONTEND-COPY", "输入控件不使用 placeholder：字段名由 label 表达，格式与影响放 extra/help 常驻说明");
    }
    if (ts.isShorthandPropertyAssignment(node)) {
      const name = node.name.text;
      if (DIMENSION_PROPERTY.test(name) && containsRawDimension(node.name, staticValues)) report(node, "FRONTEND-THEME", "字号、圆角和间距必须使用设计标度");
      if (isColorProperty(name) && containsRawColorExpression(node.name, sourceFile, staticValues)) report(node, "FRONTEND-THEME", "颜色必须使用设计角色");
    }
    if (
      ts.isJsxAttribute(node)
      && MARGIN_PROPERTY.test(node.name.getText(sourceFile))
      && node.initializer
      && ts.isJsxExpression(node.initializer)
      && node.initializer.expression
      && containsUnaryMinus(node.initializer.expression)
    ) {
      report(node.initializer, "FRONTEND-LAYOUT", "禁止使用负外边距补救布局；由父布局或组件变体管理间距");
    }
    if (ts.isVariableDeclaration(node)
      && ts.isIdentifier(node.name)
      && /(?:chart|series).*colou?rs?/i.test(node.name.text)
      && node.initializer
      && SEMANTIC_STATUS_COLOR.test(node.initializer.getText(sourceFile))) {
      report(node.initializer, "FRONTEND-DATA", "普通图表色板只能派生自 designTokens.color.data");
    }
    if (ts.isVariableDeclaration(node)
      && ts.isObjectBindingPattern(node.name)
      && node.initializer
      && references.origin(node.initializer)?.moduleName === "antd"
      && references.origin(node.initializer)?.imported === "*") {
      for (const element of node.name.elements) {
        const imported = element.propertyName?.getText(sourceFile) ?? element.name.getText(sourceFile);
        if (DEPRECATED_ANT_COMPONENTS.has(imported) || (!sharedUI && GOVERNED_COMPONENTS.has(imported))) {
          report(element, "FRONTEND-COMPONENTS", `${imported} 必须从共享组件入口引入`);
        }
      }
    }
    if (ts.isPropertyAccessExpression(node)
      && references.origin(node)?.moduleName === "antd"
      && (DEPRECATED_ANT_COMPONENTS.has(references.origin(node)?.imported)
        || (!sharedUI && GOVERNED_COMPONENTS.has(references.origin(node)?.imported)))) {
      report(node, "FRONTEND-COMPONENTS", `${references.origin(node).imported} 必须从共享组件入口引入`);
    }
    if (ts.isExportDeclaration(node) && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) {
      const moduleName = node.moduleSpecifier.text;
      const normalizedModuleName = normalizeImportSource(moduleName, filename);
      if (!uiPublicIndex && normalizedModuleName.startsWith("@/components/ui")) {
        report(node, "FRONTEND-COMPONENTS", "禁止从共享 UI 入口或深层模块重新导出；调用方必须直接使用 @/components/ui 公共入口");
      }
      if (moduleName === "antd") {
        const reviewedPublicExports = uiPublicIndex && moduleName === "antd" && node.exportClause && ts.isNamedExports(node.exportClause)
          && node.exportClause.elements.every((entry) => {
            const imported = (entry.propertyName ?? entry.name).text;
            return REVIEWED_UI_RAW_EXPORTS.has(imported) && entry.name.text === imported;
          });
        if (!reviewedPublicExports) report(node, "FRONTEND-COMPONENTS", `禁止从 ${moduleName} 重新导出组件；仅公共 UI 入口的受审 allowlist 可导出`);
      }
      const governed = moduleName === "antd" ? GOVERNED_COMPONENTS
        : moduleName === "@/components/ui" ? new Set(["PageContainer"])
          : undefined;
      if (governed) {
        if (!node.exportClause || ts.isNamespaceExport(node.exportClause)) {
          report(node, "FRONTEND-COMPONENTS", `禁止从 ${moduleName} 透传受控组件；必须从共享组件入口显式导出`);
        } else if (ts.isNamedExports(node.exportClause)) {
          for (const entry of node.exportClause.elements) {
            const imported = (entry.propertyName ?? entry.name).text;
            const reviewedUiExport = sharedUI && uiPublicIndex && moduleName === "antd"
              && REVIEWED_UI_RAW_EXPORTS.has(imported) && entry.name.text === imported;
            if ((governed.has(imported) || (sharedUI && /^[A-Z]/.test(imported))) && !reviewedUiExport) {
              report(entry, "FRONTEND-COMPONENTS", `${imported} 不得从上游组件库重新导出`);
            }
          }
        }
      }
    }
    if (ts.isExportDeclaration(node) && !node.moduleSpecifier && node.exportClause && ts.isNamedExports(node.exportClause)) {
      for (const entry of node.exportClause.elements) {
        const local = entry.propertyName ?? entry.name;
        const origin = references.origin(local);
        if (businessReexportForbidden(origin)) {
          report(entry, "FRONTEND-COMPONENTS", `${origin.imported} 保留了受控组件来源，禁止通过本地别名重新导出`);
          continue;
        }
        if (rawExportForbidden(origin, entry.name.text, true)) {
          report(entry, "FRONTEND-COMPONENTS", `${origin.imported} 不得通过本地别名重新导出`);
        }
      }
    }
    if (ts.isExportAssignment(node)) {
      const origin = references.origin(node.expression);
      if (businessReexportForbidden(origin) || rawExportForbidden(origin, "default")) report(node, "FRONTEND-COMPONENTS", `${origin.imported} 不得作为原始组件导出`);
    }
    if (ts.isVariableDeclaration(node)
      && ts.isVariableStatement(node.parent.parent)
      && node.parent.parent.modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword)
      && ts.isIdentifier(node.name)) {
      const origin = references.origin(node.name);
      if (businessReexportForbidden(origin) || rawExportForbidden(origin, node.name.text)) report(node, "FRONTEND-COMPONENTS", `${origin.imported} 不得通过变量别名导出`);
    }
    if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
      const moduleName = node.moduleSpecifier.text;
      const normalizedModuleName = normalizeImportSource(moduleName, filename);
      const bindings = node.importClause?.namedBindings;
      if (!cronCycleUtility && (moduleName === "cronstrue" || moduleName.startsWith("cronstrue/") || moduleName === "cron-parser")) {
        report(node, "FRONTEND-DATA", "Cron 解析、校验与描述只能通过 @/utils/cronCycle 统一入口使用");
      }
      if (!sharedUI && !/\/src\/layouts\//.test(filename) && moduleName === "react-router" && bindings && ts.isNamedImports(bindings)
        && bindings.elements.some((entry) => (entry.propertyName ?? entry.name).text === "Link")) {
        report(node, "FRONTEND-COMPONENTS", "站内可点击链接统一使用共享 ActionLink（图标 + 文字，窄屏仅图标），业务层不得直接使用 react-router Link");
      }
      if (!sharedUI && (normalizedModuleName.startsWith("@/components/ui") || /(?:^|\/)components\/ui\/.+/.test(moduleName))
        && moduleName !== "@/components/ui") report(node, "FRONTEND-COMPONENTS", "基础组件和配置必须从 @/components/ui 公共入口导入，禁止深层或非规范路径导入");
      if (bindings && ts.isNamedImports(bindings)) for (const entry of bindings.elements) {
        const imported = (entry.propertyName ?? entry.name).text;
        if (moduleName === "antd" && (DEPRECATED_ANT_COMPONENTS.has(imported) || (!sharedUI && GOVERNED_COMPONENTS.has(imported)))) report(entry, "FRONTEND-COMPONENTS", `${imported} 必须从共享组件入口引入`);
        if (moduleName === "antd" && imported === "Skeleton") report(entry, "FRONTEND-COMPONENTS", "加载态统一使用共享 LoadingState/LoadingOverlay/LoadingIndicator（Ant Spin），不使用骨架屏 Skeleton");
        if (!sharedUI && normalizedModuleName === "@/components/ui" && imported === "PageContainer") report(entry, "FRONTEND-COMPONENTS", "PageContainer 迁移别名已移除；页面根统一使用 AppPage");
      }
    }
    if (pageSource) {
      const declarationName = ts.isFunctionDeclaration(node) && node.name
        ? node.name.text
        : ts.isVariableDeclaration(node) && ts.isIdentifier(node.name)
          && node.initializer && (ts.isArrowFunction(node.initializer) || ts.isFunctionExpression(node.initializer))
          ? node.name.text
          : undefined;
      if (declarationName && /(?:cron.*(?:valid|parse|format|describe)|(?:valid|parse|format|describe).*cron)/i.test(declarationName)) {
        report(node, "FRONTEND-DATA", "页面不得自写 Cron 校验或描述 helper；统一使用 @/utils/cronCycle");
      }
    }
    if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
      const tag = node.tagName.getText(sourceFile);
      const matches = (names, moduleName, imported, path = []) => (names.has(tag) || references.origin(node.tagName))
        && references.matches(node.tagName, moduleName, imported, path);
      const isButtonTag = matches(buttonNames, "antd", "Button");
      const isTagTag = matches(tagNames, "antd", "Tag");
      const isSemanticTag = matches(semanticTagNames, "@/components/ui", "StatusTag")
        || matches(semanticTagNames, "@/components/ui", "MetadataTag");
      const isSpaceTag = matches(spaceNames, "antd", "Space");
      const isRowTag = matches(rowNames, "antd", "Row");
      const isFlexTag = matches(flexNames, "antd", "Flex");
      const isFormItemTag = matches(formItemNames, "antd", "Form", ["Item"]);
      // 表单字段并排只用共享 FormGrid（按表单自身宽度排 3 / 2 / 1 列）；Row / Col 按视口断点手排，放进分栏或抽屉就挤成一列或撑不满
      if (isFormItemTag && !sharedUI) {
        for (let ancestor = node.parent; ancestor && !ts.isSourceFile(ancestor); ancestor = ancestor.parent) {
          if (ts.isJsxElement(ancestor) && references.matches(ancestor.openingElement.tagName, "antd", "Col")) {
            report(node, "FRONTEND-LAYOUT", "表单字段并排使用共享 FormGrid（按表单自身宽度自动 3 / 2 / 1 列），不要用 Row / Col 手排");
            break;
          }
        }
      }
      const isAlertTag = matches(alertNames, "antd", "Alert");
      const isDrawerTag = matches(drawerNames, "antd", "Drawer");
      const isModalTag = matches(modalNames, "antd", "Modal");
      const isCardTag = matches(cardNames, "antd", "Card");
      const isSurfaceCardTag = isCardTag;
      const isDropdownButtonTag = matches(dropdownButtonNames, "antd", "Dropdown", ["Button"]);
      const isTableTag = matches(tableNames, "antd", "Table") || references.matches(node.tagName, "@/components/ui", "Table");
      const isDataTableTag = matches(dataTableNames, "@/components/ui", "DataTable");
      const isModalFormTag = matches(modalFormNames, "@/components/ui", "ModalForm");
      const isDrawerFormTag = matches(drawerFormNames, "@/components/ui", "DrawerForm");
      const isResponsiveTabsTag = matches(responsiveTabsNames, "@/components/ui", "ResponsiveTabs");
      const isTooltipTag = matches(tooltipNames, "@/components/ui", "Tooltip")
        || matches(tooltipNames, "antd", "Tooltip");
      const isQueryFeedbackTag = references.matches(node.tagName, "@/components/ui", "QueryFeedback")
        || references.matches(node.tagName, "@/components/ui", "QueryErrorAlert")
        || references.matches(node.tagName, "@/components/ui", "TableQueryBoundary");
      const isListTag = references.matches(node.tagName, "antd", "List");
      // Skeleton 及其子组件（Skeleton.Button 等）都属骨架屏，origin 解析到 antd.Skeleton 即拒绝
      const isSkeletonTag = references.origin(node.tagName)?.moduleName === "antd"
        && references.origin(node.tagName)?.imported === "Skeleton";
      const radioOrigin = references.origin(node.tagName);
      const isRadioGroupTag = radioOrigin?.moduleName === "antd" && radioOrigin.imported === "Radio"
        && radioOrigin.path[0] === "Group";
      const attributes = node.attributes.properties;
      const publicUiOrigin = references.origin(node.tagName);
      const publicUiName = publicUiOrigin?.moduleName.startsWith("@/components/ui/") && publicUiOrigin.imported === "default"
        ? nodePath.posix.basename(publicUiOrigin.moduleName)
        : publicUiOrigin?.imported;
      const isGovernedPublicUiTag = publicUiOrigin?.moduleName.startsWith("@/components/ui") && GOVERNED_PUBLIC_UI.has(publicUiName);
      const governedBusinessComponent = isGovernedPublicUiTag || isButtonTag || isTagTag || isSemanticTag || isSpaceTag || isRowTag || isFlexTag
        || isFormItemTag || isAlertTag || isDrawerTag || isModalTag || isCardTag || isDropdownButtonTag || isTableTag
        || isDataTableTag || isModalFormTag || isDrawerFormTag || isResponsiveTabsTag || isTooltipTag || isQueryFeedbackTag || isListTag;
      if (!sharedUI && governedBusinessComponent && attributes.some(ts.isJsxSpreadAttribute)) {
        report(node, "FRONTEND-COMPONENTS", "业务层受控组件禁止 JSX spread；显式传递必要属性，共享封装的透传属性必须由后置受控属性覆盖");
      }
      const flattenedAttributes = useSiteJsxEntries(attributes);
      const attributeAlternatives = expandAlternatives(flattenedAttributes);
      const hasAttribute = (attributeName) => attributes.some((item) => ts.isJsxAttribute(item) && item.name.getText(sourceFile) === attributeName);
      const hasKnownAttribute = (attributeName) => attributeAlternatives.some((state) => state.some((item) => item.name === attributeName));
      const reportUnsafeReplacementSpread = (attributeName, componentName) => {
        if (hasKnownAttribute(attributeName) && attributeAlternatives.some((state) => hasUnsafeTrailingSpread(state, [attributeName]))) {
          report(node, "FRONTEND-COMPONENTS", `${componentName} 的运行时 spread 不得覆盖 ${attributeName}；将 spread 放在显式属性前或改用可静态解析的属性对象`);
        }
      };
      if (isQueryFeedbackTag) {
        for (const alternative of attributeAlternatives) {
          const error = lastNamedEntry(alternative, "error");
          const errorIndex = error && alternative.indexOf(error);
          const mayBeOverridden = error && alternative.some((entry, index) => entry.unknownSpread && index > errorIndex);
          if (error?.expression && !mayBeOverridden && !isAllowedRawError(error.expression)) {
            report(error.node, "FRONTEND-COMPONENTS", "查询反馈 error 必须传原始错误对象；预格式化文本显式包装为 new Error(...)");
            break;
          }
        }
      }
      const hasHref = node.attributes.properties.some(
        (item) => ts.isJsxAttribute(item) && item.name.getText(sourceFile) === "href",
      );
      if (tag === "a" && !hasHref) {
        report(node, "FRONTEND-COMPONENTS", "导航使用 Link 或真实 href，站内动作使用 Button");
      }
      if (isAlertTag && hasKnownAttribute("message")) {
        report(node, "FRONTEND-COMPONENTS", "Ant Design Alert 使用 title，禁止已弃用的 message 属性");
      }
      // 业务层的错误展示只有一个通道：QueryErrorAlert/QueryFeedback；Alert type="error" 只存在于共享实现内部
      if (!sharedUI && isAlertTag
        && jsxStringAttributeValue(attributes.find((item) => ts.isJsxAttribute(item) && item.name.getText(sourceFile) === "type")) === "error") {
        report(node, "FRONTEND-FEEDBACK", "业务层禁止 Alert type=\"error\"：加载/查询失败统一用 QueryErrorAlert（通用文案 + 可选重试），写操作失败走 notifyActionFailed 右上常驻通知");
      }
      if (isAlertTag) reportUnsafeReplacementSpread("title", "Alert");
      if (isDrawerTag && hasKnownAttribute("width")) {
        report(node, "FRONTEND-COMPONENTS", "Ant Design Drawer 使用 size，禁止已弃用的 width 属性");
      }
      if (isDrawerTag) reportUnsafeReplacementSpread("size", "Drawer");
      if (isModalTag && hasKnownAttribute("destroyOnClose")) {
        report(node, "FRONTEND-COMPONENTS", "Ant Design Modal 使用 destroyOnHidden，禁止已弃用的 destroyOnClose 属性");
      }
      if (isModalTag) reportUnsafeReplacementSpread("destroyOnHidden", "Modal");
      const isActionButton = matches(buttonNames, "antd", "Button") || tag === "Button" || references.matches(node.tagName, "@/components/ui", "IconButton");
      const isActionLink = references.matches(node.tagName, "@/components/ui", "ActionLink");
      // 同一动作文案必须配同一图标：ActionLink 与按钮同规（“编辑”永远是 EditOutlined，不因载体是链接而换图标）
      if (!sharedUI && isActionLink) {
        const iconAttr = attributes.find((item) => ts.isJsxAttribute(item) && item.name.getText(sourceFile) === "icon");
        const iconExpr = iconAttr && ts.isJsxAttribute(iconAttr) && iconAttr.initializer && ts.isJsxExpression(iconAttr.initializer) ? iconAttr.initializer.expression : undefined;
        const iconName = iconExpr && ts.isJsxSelfClosingElement(iconExpr) ? iconExpr.tagName.getText(sourceFile) : undefined;
        const actionKey = actionKeyOfButton(node, sourceFile);
        const expectedIcon = actionKey ? ACTION_ICON_BY_NAME[actionKey] : undefined;
        if (expectedIcon && iconName && iconName !== expectedIcon) {
          report(node, "FRONTEND-COMPONENTS", `动作“${actionKey}”全站统一用 ${expectedIcon}，不得改用 ${iconName}（链接与按钮同规）`);
        }
      }
      if (!sharedUI && isActionButton) {
        // 颜色与图标的语义对应：危险图标（删除/禁用/清空）必须配 color="danger"；同一动作文案必须配同一图标
        const iconAttr = attributes.find((item) => ts.isJsxAttribute(item) && item.name.getText(sourceFile) === "icon");
        const iconExpr = iconAttr && ts.isJsxAttribute(iconAttr) && iconAttr.initializer && ts.isJsxExpression(iconAttr.initializer) ? iconAttr.initializer.expression : undefined;
        const iconName = iconExpr && ts.isJsxSelfClosingElement(iconExpr) ? iconExpr.tagName.getText(sourceFile) : undefined;
        const colorValue = jsxStringAttributeValue(attributes.find((item) => ts.isJsxAttribute(item) && item.name.getText(sourceFile) === "color"), sourceFile);
        if (iconName && DANGER_ICONS.has(iconName) && colorValue !== "danger") {
          report(node, "FRONTEND-COMPONENTS", `${iconName} 是危险动作图标，按钮必须 color="danger"（红色）并显式 variant`);
        }
        const actionKey = actionKeyOfButton(node, sourceFile);
        const expectedIcon = actionKey ? ACTION_ICON_BY_NAME[actionKey] : undefined;
        if (expectedIcon && iconName && iconName !== expectedIcon) {
          report(node, "FRONTEND-COMPONENTS", `动作“${actionKey}”全站统一用 ${expectedIcon}，不得改用 ${iconName}`);
        }
        // 页面级保存/取消只有一个入口：共享 SaveBar（仅在脏状态渲染，干净退出由页头返回承担）；弹窗/抽屉用 Modal okText 或 ModalForm/DrawerForm
        if (actionKey === "save" || actionKey === "revert") {
          report(node, "FRONTEND-NAVIGATION", "页面级保存/取消修改统一走共享 SaveBar，业务层不得自己摆保存按钮；弹窗内用 Modal okText / ModalForm / DrawerForm");
        }
        // 按钮几何只由 size 决定：业务层用 style 改内边距/高度/字号会让同一操作组里的按钮上下左右错位
        const styleAttr = attributes.find((item) => ts.isJsxAttribute(item) && item.name.getText(sourceFile) === "style");
        const styleExpr = styleAttr && ts.isJsxAttribute(styleAttr) && styleAttr.initializer && ts.isJsxExpression(styleAttr.initializer) ? styleAttr.initializer.expression : undefined;
        if (styleExpr && ts.isObjectLiteralExpression(styleExpr)) {
          const geometry = styleExpr.properties.filter((prop) => ts.isPropertyAssignment(prop) && BUTTON_GEOMETRY_STYLE_KEYS.test(prop.name.getText(sourceFile)));
          if (geometry.length > 0) {
            report(styleAttr, "FRONTEND-COMPONENTS", `按钮几何（${geometry.map((prop) => prop.name.getText(sourceFile)).join("/")}）由 size 与共享层统一决定，业务层不得用 style 改内边距/高度/字号——会与同组按钮错位；换行长文本用 ActionLink 或表格列宽解决`);
          }
        }
      }
      if (!sharedUI && isActionButton) {
        const hasBareDanger = attributes.some((item) => ts.isJsxAttribute(item)
          && item.name.getText(sourceFile) === "danger");
        if (hasBareDanger) {
          report(node, "FRONTEND-COMPONENTS", "危险按钮统一写 color=\"danger\"，禁止 danger 布尔属性分叉写法");
        }
        // Ant 6 只有 color 与 variant 同时给出时颜色才生效；带 type 时 color 会被忽略，语义色随之丢失。
        const hasColor = hasKnownAttribute("color");
        const hasVariant = hasKnownAttribute("variant");
        const hasType = hasKnownAttribute("type");
        if (hasColor && (!hasVariant || hasType)) {
          report(node, "FRONTEND-COMPONENTS", "Button 指定 color 时必须同时显式给出 variant 且不能再写 type，否则 Ant 会忽略语义色");
        }
        // 图标和文字属于同一个按钮表面，不得只给文字另套标签或彩色边框。
        if (ts.isJsxElement(node.parent)) {
          const inspectLabelSurface = (child) => {
            if (ts.isJsxOpeningElement(child) || ts.isJsxSelfClosingElement(child)) {
              const name = child.tagName.getText(sourceFile);
              const style = child.attributes.properties.find((item) => ts.isJsxAttribute(item)
                && item.name.getText(sourceFile) === "style");
              if (/^(?:Tag|StatusTag|MetadataTag|Badge)$/.test(name) || semanticTagNames.has(name)
                || references.matches(child.tagName, "antd", "Tag") || references.matches(child.tagName, "antd", "Badge")
                || (style && /\b(?:background(?:Color)?|border(?:Color|Radius|Width)?)\s*:/.test(style.getText(sourceFile)))) {
                report(child, "FRONTEND-COMPONENTS", "按钮图标与文字必须在同一表面，禁止只给文字另套标签、背景或边框");
              }
            }
            ts.forEachChild(child, inspectLabelSurface);
          };
          node.parent.children.forEach(inspectLabelSurface);
        }
        if (!hasKnownAttribute("icon")) {
          report(node, "FRONTEND-COMPONENTS", "操作按钮统一图标 + 文字：Button 必须显式传 icon；纯图标动作使用 IconButton");
        }
      }
      if (!sharedUI && tag === "DataTable" && !hasJsxAncestorNamed(node, "TablePanel")) {
        report(node, "FRONTEND-TABLE", "完整表格必须放在共享 TablePanel 内（标题/查询/汇总/表格/分页切带、表格贴边无内圈圆角），不得直接放进 Card 正文或裸放");
      }
      if (rendersCharts && !chartLayer && /^(?:Card|ChartCard)$/.test(tag)) {
        const titleAttr = attributes.find((item) => ts.isJsxAttribute(item) && item.name.getText(sourceFile) === "title");
        const expr = titleAttr?.initializer && ts.isJsxExpression(titleAttr.initializer) ? titleAttr.initializer.expression : undefined;
        if (expr && ts.isCallExpression(expr) && ts.isIdentifier(expr.expression) && expr.expression.text === "t") {
          report(titleAttr, "FRONTEND-COPY", "图表标题统一由 chartTitle 拼接（维度 + 指标 + 形态），不得各页手写标题文案");
        }
      }
      const inQueryForm = (() => {
        for (let parent = node.parent; parent; parent = parent.parent) {
          if (ts.isJsxElement(parent) && references.matches(parent.openingElement.tagName, "@/components/ui", "QueryForm")) return true;
        }
        return false;
      })();
      if (!sharedUI && inQueryForm && references.matches(node.tagName, "antd", "Form", ["Item"])) {
        const name = lastNamedEntry(attributeAlternatives[0] ?? [], "name");
        const fieldName = name?.expression && staticPrimitive(name.expression)?.value;
        if (entityFilterFields.some((entry) => filename.endsWith(entry.file) && entry.names.includes(fieldName))) {
          let enumerated = false;
          const findEnum = (child) => {
            if ((ts.isJsxOpeningElement(child) || ts.isJsxSelfClosingElement(child)) && references.matches(child.tagName, "@/components/ui", "FilterSelect")) {
              const kind = lastNamedEntry(useSiteJsxEntries(child.attributes.properties), "kind");
              if (kind?.expression && staticPrimitive(kind.expression)?.value === "enum") enumerated = true;
            }
            ts.forEachChild(child, findEnum);
          };
          ts.forEachChild(node.parent, findEnum);
          if (!enumerated) report(node, "FRONTEND-TABLE", `已登记实体筛选 ${fieldName} 必须使用 FilterSelect kind=enum 多选，不能退回填空或单选`);
        }
      }
      const requiredScopeField = (() => {
        for (let parent = node.parent; parent; parent = parent.parent) {
          if (!ts.isJsxElement(parent) || !references.matches(parent.openingElement.tagName, "antd", "Form", ["Item"])) continue;
          const rules = lastNamedEntry(useSiteJsxEntries(parent.openingElement.attributes.properties), "rules");
          const array = rules?.expression && staticPrimitive(rules.expression)?.value;
          return Boolean(array && ts.isArrayLiteralExpression(array) && array.elements.some((rule) => {
            const object = staticPrimitive(rule)?.value;
            return object && ts.isObjectLiteralExpression(object) && object.properties.some((property) => ts.isPropertyAssignment(property) && propertyName(property, sourceFile) === "required" && staticPrimitive(property.initializer)?.value === true);
          }));
        }
        return false;
      })();
      if (!sharedUI && references.matches(node.tagName, "antd", "Select") && inQueryForm) {
        report(node, "FRONTEND-TABLE", "查询区下拉统一使用共享 FilterSelect 并声明 kind（enum 多选 / pair 二元状态单选 / scope 必填作用域），页面不得自行决定单选多选");
      }
      if (!sharedUI && references.matches(node.tagName, "@/components/ui", "FilterSelect")) {
        const kindAttr = attributes.find((item) => ts.isJsxAttribute(item) && item.name.getText(sourceFile) === "kind");
        const kindText = kindAttr?.initializer && ts.isStringLiteral(kindAttr.initializer) ? kindAttr.initializer.text : undefined;
        if (!["enum", "pair", "scope"].includes(kindText)) report(node, "FRONTEND-TABLE", "FilterSelect 必须以字符串字面量声明 kind：enum / pair / scope");
        if (kindText === "scope" && !requiredScopeField) report(node, "FRONTEND-TABLE", "scope 只用于必填的数据集作用域：Form.Item 必须声明 required 校验，普通筛选不得伪装成作用域");
        if (kindText === "pair" && hasKnownAttribute("loadOptions")) report(node, "FRONTEND-TABLE", "实体候选不按当前数量改成 pair：远程候选使用 enum 多选");
        for (const alternative of attributeAlternatives) {
          const options = lastNamedEntry(alternative, "options");
          const array = options?.expression && staticPrimitive(options.expression)?.value;
          if (array && ts.isArrayLiteralExpression(array)) {
            if (kindText === "pair" && !array.elements.some(ts.isSpreadElement) && array.elements.length !== 2) report(node, "FRONTEND-TABLE", "kind=\"pair\" 只用于恰好两个互斥值的维度；三值及以上枚举必须 kind=\"enum\" 多选");
            const checkOption = (expression) => {
              const value = staticPrimitive(expression)?.value;
              if (value && ts.isArrayLiteralExpression(value)) { value.elements.forEach((item) => checkOption(ts.isSpreadElement(item) ? item.expression : item)); return; }
              if (!value || !ts.isObjectLiteralExpression(value)) return;
              const props = lastNamedEntry(useSiteJsxEntries([ts.factory.createJsxSpreadAttribute(value)]), "value");
              const key = props?.expression && staticPrimitive(props.expression);
              if (key && (key.value === "" || key.value === undefined || key.value === null || key.value === "*")) report(options.node, "FRONTEND-TABLE", "筛选条件以空值代表全部：删除空值哨兵选项，用 allowClear 清除条件");
            };
            array.elements.forEach((item) => checkOption(ts.isSpreadElement(item) ? item.expression : item));
          }
        }
      }
      if (!sharedUI && (tag === "Popconfirm" || isModalTag)) {
        for (const item of attributes) {
          if (!ts.isJsxAttribute(item) || !/^(?:okButtonProps|cancelButtonProps)$/.test(item.name.getText(sourceFile))) continue;
          const expr = item.initializer && ts.isJsxExpression(item.initializer) ? item.initializer.expression : undefined;
          if (expr && ts.isObjectLiteralExpression(expr) && expr.properties.some((prop) => ts.isPropertyAssignment(prop)
            && prop.name.getText(sourceFile) === "icon" && /^(?:null|undefined|false)$/.test(prop.initializer.getText(sourceFile)))) {
            report(item, "FRONTEND-COMPONENTS", "确定/取消按钮的图标由共享层统一注入，业务层不得置空 okButtonProps/cancelButtonProps.icon");
          }
        }
      }
      if (!sharedUI && tag === "Popconfirm") {
        const titleAttr = attributes.find((item) => ts.isJsxAttribute(item) && item.name.getText(sourceFile) === "title");
        if (titleAttr) {
          const expr = titleAttr.initializer && ts.isJsxExpression(titleAttr.initializer)
            ? titleAttr.initializer.expression : titleAttr.initializer;
          const text = expr ? expr.getText(sourceFile) : "";
          if (!text.includes("common.confirm.execute")) {
            report(node, "FRONTEND-COMPONENTS", "二次确认标题必须统一引用 common.confirm.execute；具体影响放 description");
          }
        }
      }
      if (!sharedUI && (matches(buttonNames, "antd", "Button") || tag === "Button")) {
        const hasDanger = attributes.some((item) => ts.isJsxAttribute(item) && item.name.getText(sourceFile) === "color"
          && item.initializer && ts.isStringLiteral(item.initializer) && item.initializer.text === "danger");
        if (hasDanger && !dangerButtonConfirmed(node)) {
          report(node, "FRONTEND-COMPONENTS", "危险操作必须二次确认：用共享 Popconfirm 包裹触发按钮（唯一形式，不用 Modal.confirm）");
        }
      }
      const inputOrigin = references.origin(node.tagName);
      const clearable = inputOrigin?.moduleName === "antd" && CLEARABLE_INPUT_TAGS.has(inputOrigin.imported);
      if (!sharedUI && clearable) {
        const clearEntries = attributeAlternatives.map((state) => lastNamedEntry(state, "allowClear"));
        if (clearEntries.some((entry) => !entry) || attributeAlternatives.some((state) => hasUnsafeTrailingSpread(state, ["allowClear"]))) {
          report(node, "FRONTEND-COMPONENTS", `输入控件 ${tag} 必须显式声明 allowClear;语义上不可清除时写 allowClear={false} 并保持注释说明`);
        }
        if (inQueryForm && clearEntries.some((entry) => entry?.expression && staticPrimitive(entry.expression)?.value === false)) {
          report(node, "FRONTEND-TABLE", "查询条件必须可清空；必填作用域使用共享 FilterSelect kind=scope 并声明 required 校验");
        }
      }
      if (!sharedUI) {
        const colorAttribute = attributes.find((item) => ts.isJsxAttribute(item) && item.name.getText(sourceFile) === "color");
        const colorValue = colorAttribute && ts.isJsxAttribute(colorAttribute) && colorAttribute.initializer
          && ts.isStringLiteral(colorAttribute.initializer) ? colorAttribute.initializer.text : undefined;
        if (colorValue !== undefined && ANT_PRESET_COLOR.test(colorValue)) {
          report(node, "FRONTEND-THEME", `组件预设色板 ${JSON.stringify(colorValue)} 未纳入双主题设计标度；使用语义 token、StatusTag 或默认变体`);
        }
      }
      if (isCardTag && hasKnownAttribute("bordered")) {
        report(node, "FRONTEND-COMPONENTS", "Ant Design Card 使用 variant，禁止已弃用的 bordered 属性");
      }
      if (isCardTag) reportUnsafeReplacementSpread("variant", "Card");
      if (isTagTag && hasKnownAttribute("bordered")) {
        report(node, "FRONTEND-COMPONENTS", "Ant Design Tag 使用 variant=\"filled\"，禁止已弃用的 bordered 属性");
      }
      if (isTagTag) reportUnsafeReplacementSpread("variant", "Tag");
      if (isSemanticTag && hasKnownAttribute("bordered")) {
        report(node, "FRONTEND-COMPONENTS", "StatusTag 与 MetadataTag 禁止透传已弃用的 bordered；使用 variant");
      }
      if (isSemanticTag) reportUnsafeReplacementSpread("variant", tag);
      if (isModalFormTag) {
        const modalProps = lastNamedEntry(flattenedAttributes, "modalProps");
        const modalEntries = modalProps?.expression
          ? staticObjectEntries(modalProps.expression, node, staticObjectBindings, sourceFile)
          : undefined;
        if (modalEntries?.some((entry) => entry.name === "destroyOnClose")) {
          report(modalProps.node, "FRONTEND-COMPONENTS", "ModalForm.modalProps 使用 destroyOnHidden，禁止已弃用的 destroyOnClose 属性");
        }
      }
      if (isDrawerFormTag) {
        if (hasKnownAttribute("width")) {
          report(node, "FRONTEND-COMPONENTS", "DrawerForm 禁止 width；使用 drawerProps.size，避免向 Ant Design Drawer 透传已弃用属性");
        }
        const drawerProps = lastNamedEntry(flattenedAttributes, "drawerProps");
        const drawerEntries = drawerProps?.expression
          ? staticObjectEntries(drawerProps.expression, node, staticObjectBindings, sourceFile)
          : undefined;
        if (drawerEntries?.some((entry) => entry.name === "width")) {
          report(drawerProps.node, "FRONTEND-COMPONENTS", "DrawerForm.drawerProps 禁止已弃用的 width；使用 size");
        }
        if (drawerEntries && hasUnsafeTrailingSpread(drawerEntries.map((entry, index) => ({ ...entry, index })), ["size"])) {
          report(drawerProps.node, "FRONTEND-COMPONENTS", "DrawerForm.drawerProps 的运行时 spread 不得覆盖 size；将 spread 放在显式 size 前或使用统一封装");
        }
        if (drawerProps && hasUnsafeTrailingSpread(flattenedAttributes, ["drawerProps"])) {
          report(node, "FRONTEND-COMPONENTS", "DrawerForm 的运行时 spread 不得覆盖 drawerProps；将 spread 放在显式 drawerProps 前或使用统一封装");
        }
      }
      if (isDropdownButtonTag) {
        report(node, "FRONTEND-COMPONENTS", "禁止已弃用的 Dropdown.Button；使用 Space.Compact、Dropdown 与 Button 组合");
      }
      if (isFormItemTag && (hasKnownAttribute("name") || flattenedAttributes.some((item) => item.unknownSpread))) {
        const formItem = ts.isJsxOpeningElement(node) && ts.isJsxElement(node.parent)
          ? node.parent
          : undefined;
        const children = formItem?.children.filter(
          (child) => !ts.isJsxText(child) || child.getText(sourceFile).trim() !== "",
        ) ?? [];
        const child = children[0];
        const childTag = child && ts.isJsxElement(child)
          ? child.openingElement.tagName.getText(sourceFile)
          : child && ts.isJsxSelfClosingElement(child)
            ? child.tagName.getText(sourceFile)
            : undefined;
        const invalidBindableChildren = (
          children.length !== 1
          || ts.isJsxFragment(child)
          || (childTag && /^(?:div|span|p|section|article|main)$/.test(childTag))
        );
        if (invalidBindableChildren) {
          report(node, "FRONTEND-COMPONENTS", "带 name 的 Form.Item 必须只有一个可绑定子组件；说明和编辑器工具栏放在外层 Form.Item");
        }
        if (hasKnownAttribute("name") && hasUnsafeTrailingSpread(flattenedAttributes, ["name"])) {
          report(node, "FRONTEND-COMPONENTS", "运行时 spread 不得覆盖 Form.Item.name；将 spread 放在 name 前或改用可静态解析的属性对象");
        }
      }
      if (isButtonTag && isPureIconButton(node, sourceFile, iconNames)) {
        report(node, "FRONTEND-COMPONENTS", "纯图标按钮必须使用共享 IconButton，由 label 同源生成可访问名称与 Tooltip");
      }
      if (isResponsiveTabsTag) {
        const items = attributes.find((item) => ts.isJsxAttribute(item) && item.name.getText(sourceFile) === "items");
        const itemsExpression = items?.initializer && ts.isJsxExpression(items.initializer)
          ? items.initializer.expression
          : undefined;
        const classifications = [];
        if (itemsExpression) classifications.push(classifyTabsItems(itemsExpression, node, staticArrayBindings, sourceFile));
        for (const spread of attributes.filter((item) => ts.isJsxSpreadAttribute(item))) {
          const classification = classifyTabsSpread(spread.expression, node, staticObjectBindings, staticArrayBindings, sourceFile);
          if (classification !== "none") classifications.push(classification);
        }
        if (classifications.length) {
          const classification = classifications.includes("unknown") || new Set(classifications).size > 1
            ? "unknown"
            : classifications[0];
          const variant = jsxStringAttributeValue(attributes.find(
            (item) => ts.isJsxAttribute(item) && item.name.getText(sourceFile) === "variant",
          ));
          if (classification === "navigation-only" && variant && variant !== "navigation-only") {
            report(node, "FRONTEND-COMPONENTS", "无 children 的 ResponsiveTabs items 只能使用 navigation-only 模式");
          } else if (classification === "unknown" && !variant) {
            report(node, "FRONTEND-COMPONENTS", "动态 ResponsiveTabs items 必须显式声明 default 或 navigation-only 模式");
          }
        }
      }
      const spacingAttribute = isSpaceTag ? "size" : isRowTag ? "gutter" : isFlexTag ? "gap" : undefined;
      if (spacingAttribute) {
        const spacingEntries = attributeAlternatives.map((state) => ({ attribute: lastNamedEntry(state, spacingAttribute), state }));
        const invalid = spacingEntries.find(({ attribute }) => attribute?.expression && containsRawDimension(attribute.expression, staticValues));
        if (invalid) {
          const { attribute } = invalid;
          report(attribute.node, "FRONTEND-THEME", `${tag}.${spacingAttribute} 必须使用统一间距标度`);
        }
        const offRole = spacingEntries.find(({ attribute }) => attribute?.expression && !isRoleSpacingToken(attribute.expression));
        if (!sharedUI && offRole) {
          report(offRole.attribute.node, "FRONTEND-LAYOUT", `${tag}.${spacingAttribute} 只能取四档角色间距 designTokens.space.xl/lg/sm/xs（24/16/8/4）`);
        }
        if (spacingEntries.some(({ attribute, state }) => attribute && hasUnsafeTrailingSpread(state, [spacingAttribute]))) {
          report(node, "FRONTEND-THEME", `${tag} 的运行时 spread 不得覆盖 ${spacingAttribute}；将 spread 放在显式间距属性前或使用统一封装`);
        }
      }
      if (isSpaceTag && hasKnownAttribute("direction")) {
        report(node, "FRONTEND-COMPONENTS", "Ant Space 使用 orientation，禁止已弃用的 direction");
      }
      if (isSpaceTag) reportUnsafeReplacementSpread("orientation", "Space");
      if (!sharedUI && isDataTableTag) {
        for (const tableAttributes of attributeAlternatives) {
          const controller = lastNamedEntry(tableAttributes, "controller");
          if (!controller || !controller.expression || !isDataTableController(controller.expression)) {
            report(controller?.node ?? node, "FRONTEND-TABLE", "DataTable.controller 必须直接来自 useDataTable 的返回值");
          }
          if (hasUnsafeTrailingSpread(tableAttributes, ["controller"])) {
            report(node, "FRONTEND-TABLE", "DataTable 的运行时 spread 不得覆盖受控 controller");
          }
        }
      }
      if (!sharedUI && isTableTag) {
        for (const tableAttributes of attributeAlternatives) {
          if (hasUnsafeTrailingSpread(tableAttributes, ["scroll", "pagination"])) {
          report(node, "FRONTEND-LAYOUT", `${tag} 的运行时 spread 不得提供或覆盖 scroll、pagination；将其放在显式共享配置前或使用统一封装`);
          }
        // 横向浏览与 fixed 布局由共享 Table 按列宽计算，业务不得自己传 scroll / tableLayout（需要纵向视口用 scrollY）
        for (const key of ["scroll", "tableLayout"]) {
          const entry = lastNamedEntry(tableAttributes, key);
          if (entry) report(entry.node ?? node, "FRONTEND-LAYOUT", `表格的 ${key} 由共享 Table 按列宽统一计算，业务不得自行设置（纵向视口用 scrollY）`);
        }
        const pagination = lastNamedEntry(tableAttributes, "pagination");
        const paginationText = pagination?.expression?.getText(sourceFile) ?? "";
        const paginationDisabled = pagination?.expression?.kind === ts.SyntaxKind.FalseKeyword;
        const paginationExpression = pagination?.expression;
        const usesPaginationBuilder = paginationExpression
          && ts.isCallExpression(paginationExpression)
          && isImportedReference(paginationExpression.expression, paginationBuilderNames, shadowDeclarations);
        const paginationOptions = usesPaginationBuilder && paginationExpression.arguments[0]
          ? unwrapParentheses(paginationExpression.arguments[0])
          : undefined;
        const validPaginationOptions = !paginationOptions || (ts.isObjectLiteralExpression(paginationOptions)
          && paginationOptions.properties.every((property) => !ts.isSpreadAssignment(property)
            && property.name && TABLE_PAGINATION_OPTION_KEYS.has(propertyName(property, sourceFile))));
        if (!paginationDisabled && !usesPaginationBuilder) {
          report(node, "FRONTEND-LAYOUT", "页面表格分页必须使用 buildTablePagination；小型无分页表显式使用 pagination={false}");
        }
        if (usesPaginationBuilder && !validPaginationOptions) {
          report(pagination.node, "FRONTEND-LAYOUT", "buildTablePagination 仅接收分页状态字段，禁止展示配置、动态对象或 spread");
        }
        if (/\b(?:defaultPageSize|pageSizeOptions|showSizeChanger|showTotal|showQuickJumper|responsive|showLessItems|locale)\s*:/.test(paginationText)) {
          report(pagination.node, "FRONTEND-LAYOUT", "页面不得覆写分页显示配置；只传 current、pageSize、total、onChange 等业务状态");
        }
        }
      }
      if (isTooltipTag && !sharedUI) {
        report(node, "FRONTEND-TOOLTIP", "操作提示类 Tooltip 已全站移除；过长数据用 AtomicValue/LongText 左右滚动，说明文字用 Form.Item tooltip 或共享 HelpTip 问号");
      }
      if (isTooltipTag) {
        const title = attributes.find((item) => ts.isJsxAttribute(item) && item.name.getText(sourceFile) === "title");
        const expression = title?.initializer && ts.isJsxExpression(title.initializer)
          ? title.initializer.expression
          : undefined;
        if (expression && (/\.\s*(?:map|join)\s*\(|<\/?[A-Za-z]|<>/.test(expression.getText(sourceFile)) || ts.isArrayLiteralExpression(expression))) {
          report(title, "FRONTEND-TOOLTIP", "结构化、多项或交互内容必须使用 Popover、Drawer 或常驻正文");
        }
      }
      if (hasAttribute("ellipsis")) report(node, "FRONTEND-TOOLTIP", "过长内容统一在自身范围内左右滚动（单行值用 AtomicValue，单元格长说明用 LongText），不省略、不靠悬停 Tooltip 看全文");
      if (isListTag) report(node, "FRONTEND-COMPONENTS", "Ant Design 6 已弃用 List；使用语义列表、Table 或原生结构");
      if (!sharedUI && isRadioGroupTag && hasKnownAttribute("buttonStyle")) {
        report(node, "FRONTEND-COMPONENTS", "取值单选按钮组统一默认描边样式，禁止 buttonStyle（solid 等）");
      }
      if (!sharedUI && isSurfaceCardTag) {
        // 框套框：卡片直接位于另一张卡片之内（Modal/Drawer/Popover 等浮层是新表面，不计入）
        const element = ts.isJsxOpeningElement(node) ? node.parent : node;
        let ancestor = element.parent;
        let portalBoundary = false;
        let nestedInCard = false;
        while (ancestor && !nestedInCard && !portalBoundary) {
          if (ts.isJsxElement(ancestor)) {
            const ancestorTag = ancestor.openingElement.tagName;
            const ancestorName = ancestorTag.getText(sourceFile).replace(/^.*\./, "");
            if (/^(Modal|Drawer|Popover|Popconfirm|Tooltip|ModalForm|DrawerForm)$/.test(ancestorName)) portalBoundary = true;
            else if (references.matches(ancestorTag, "antd", "Card")) nestedInCard = true;
          }
          ancestor = ancestor.parent;
        }
        if (nestedInCard) report(node, "FRONTEND-LAYOUT", "禁止卡片套卡片：内层区块用 SectionHeader + ContentStack、SummaryStrip 或弱表面底色分层，不再叠加边框");
        // 卡片正文只有一个自带外框的切换控件（ViewSwitch）时，外层卡片是多余的框；line 页签无外框，卡内页签是目标形态
        const children = ts.isJsxElement(element) ? element.children.filter((child) => !(ts.isJsxText(child) && child.text.trim() === "") && !(ts.isJsxExpression(child) && !child.expression)) : [];
        let single = children.length === 1 ? children[0] : undefined;
        for (let depth = 0; single && ts.isJsxElement(single) && depth < 6; depth += 1) {
          const wrapperName = single.openingElement.tagName.getText(sourceFile).replace(/^.*\./, "");
          if (!/^(Row|Col|Space|Flex|div|ContentStack)$/.test(wrapperName)) break;
          const inner = single.children.filter((child) => !(ts.isJsxText(child) && child.text.trim() === "") && !(ts.isJsxExpression(child) && !child.expression));
          single = inner.length === 1 ? inner[0] : undefined;
        }
        const singleTag = single && (ts.isJsxElement(single) || ts.isJsxSelfClosingElement(single))
          ? (ts.isJsxElement(single) ? single.openingElement : single).tagName
          : undefined;
        if (singleTag && references.matches(singleTag, "@/components/ui", "ViewSwitch")) {
          report(node, "FRONTEND-LAYOUT", "ViewSwitch 自带 choice-group 外框，不得再用 Card 包一层");
        }
      }
      if (!sharedUI && references.matches(node.tagName, "@/components/ui", "InformationFieldGrid") && hasKnownAttribute("flush")) {
        // flush 网格贴边填满卡片正文：宿主必须是零内边距的 Card，且网格是正文唯一内容
        const element = ts.isJsxOpeningElement(node) ? node.parent : node;
        const host = element.parent && ts.isJsxElement(element.parent) ? element.parent : undefined;
        const hostTag = host?.openingElement.tagName;
        const hostIsCard = hostTag && references.matches(hostTag, "antd", "Card");
        const hostStyles = host?.openingElement.attributes.properties.find((item) => ts.isJsxAttribute(item) && item.name.getText(sourceFile) === "styles");
        const flushHost = Boolean(hostStyles && /body\s*:\s*\{[^}]*padding\s*:\s*0\b/.test(hostStyles.getText(sourceFile)));
        const siblings = host ? host.children.filter((child) => !(ts.isJsxText(child) && child.text.trim() === "") && !(ts.isJsxExpression(child) && !child.expression)) : [];
        if (!hostIsCard || !flushHost || siblings.length !== 1) {
          report(node, "FRONTEND-LAYOUT", "InformationFieldGrid flush 只能作为零内边距 Card（styles.body.padding 为 0）的唯一正文内容，其它位置使用默认圆角面板");
        }
      }
      if (!sharedUI && references.matches(node.tagName, "antd", "Col")) {
        const spanAttribute = attributes.find((item) => ts.isJsxAttribute(item) && item.name.getText(sourceFile) === "span");
        const spanText = spanAttribute?.initializer?.getText(sourceFile) ?? "";
        const spanValue = Number(spanText.replace(/[{}"']/g, ""));
        const hasBreakpoint = ["xs", "sm", "md", "lg", "xl", "xxl", "flex"].some(hasKnownAttribute);
        if (Number.isFinite(spanValue) && spanValue < 24 && !hasBreakpoint) {
          report(node, "FRONTEND-LAYOUT", "Col 固定 span 在窄屏把标签和控件挤成多行；用 xs/sm/md 响应式列宽让布局降列");
        }
        // 卡片/图表并排：Col 的 xs/sm/lg 按视口断点分列，侧栏展开时内容区更窄，卡片被挤窄、内容溢出边界
        const colElement = ts.isJsxOpeningElement(node) ? node.parent : undefined;
        const wrapsCard = colElement?.children.some((child) => {
          const tag = ts.isJsxElement(child) ? child.openingElement.tagName : ts.isJsxSelfClosingElement(child) ? child.tagName : undefined;
          return Boolean(tag) && /(?:^|\.)\w*Card$/.test(tag.getText(sourceFile));
        });
        const responsiveSpan = ["xs", "sm", "md", "lg", "xl", "xxl"].some(hasKnownAttribute);
        if (wrapsCard && responsiveSpan) {
          report(node, "FRONTEND-LAYOUT", "卡片与图表并排统一用共享 ResponsiveGrid（按自身可用宽度选列数、不留孤儿行）；Col 响应式列按视口断点分列，侧栏展开时会把卡片挤窄");
        }
      }
      if (!sharedUI && !project.statisticExemptions.some((exemption) => filename.endsWith(exemption)) && references.matches(node.tagName, "antd", "Statistic")) {
        report(node, "FRONTEND-COMPONENTS", "业务层不得用 Ant Statistic 摆放单个标签+数字；关键数据用 SummaryStrip，批量键值用 InformationFieldGrid（数据总览 KPI 卡除外）");
      }
      if (!sharedUI && (references.matches(node.tagName, "antd", "DatePicker") || references.matches(node.tagName, "antd", "DatePicker", ["RangePicker"]))) {
        report(node, "FRONTEND-COMPONENTS", "时间范围/日期选择只有共享 RangePicker/FieldDatePicker 一个入口（统一弹层防越界、格式与快捷预设），业务层不得直用 Ant DatePicker/RangePicker");
      }
      if (isSkeletonTag) report(node, "FRONTEND-COMPONENTS", "加载态统一使用共享 LoadingState/LoadingOverlay/LoadingIndicator（Ant Spin），不使用骨架屏 Skeleton");
    }
    // 大候选集接口（项目在 design-system.project.json 登记，如主体检索）不得无参全量拉取：必须带 keyword/limit 或精确列表
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression)
      && (largeCandidateApis.names ?? []).some((name) => references.matches(node.expression, largeCandidateApis.module, name))
      && node.arguments.length === 0) {
      report(node, "FRONTEND-DATA", "大候选集接口不得无参全量拉取：大规模候选必须按 keyword + limit 实时检索，或按精确列表描述");
    }
    if (ts.isJsxAttribute(node)) {
      const name = node.name.getText(sourceFile);
      const opening = node.parent.parent;
      const tag = opening.tagName?.getText(sourceFile);
      const isButtonTag = references.matches(opening.tagName, "antd", "Button");
      const isTagTag = references.matches(opening.tagName, "antd", "Tag");
      const attributes = opening.attributes.properties;
      const hasAttribute = (attributeName) => attributes.some((item) => ts.isJsxAttribute(item) && item.name.getText(sourceFile) === attributeName);
      if (name === "type" && isButtonTag && node.initializer) {
        const value = ts.isStringLiteral(node.initializer) ? node.initializer.text : ts.isJsxExpression(node.initializer) && ts.isStringLiteralLike(node.initializer.expression) ? node.initializer.expression.text : undefined;
        if (value === "link" && !hasAttribute("href")) report(node, "FRONTEND-COMPONENTS", "站内动作使用 Button，链接样式需要真实 href");
      }
      if (name === "placeholder" && !sharedUI) report(node, "FRONTEND-COPY", "输入控件不使用 placeholder：字段名由 label 表达，格式与影响放 extra/help 常驻说明");
      // 候选项与已选标签必须完整展开：不折叠成 +N、不截断标签文本
      if (/^(?:maxTagCount|maxTagTextLength)$/.test(name)) report(node, "FRONTEND-COMPONENTS", `多选控件不得 ${name}：已选标签完整展开，数量多时在控件内滚动`);
      // 切换类控件按内容收口：业务层不得给 ViewSwitch 写死 width（写死会把末项裁掉）；等分用 block
      if (!sharedUI && name === "style" && references.matches(opening.tagName, "@/components/ui", "ViewSwitch")
        && /\b(?:width|minWidth|maxWidth)\b/.test(node.initializer?.getText(sourceFile) ?? "")) {
        report(node, "FRONTEND-LAYOUT", "ViewSwitch 按内容收口，不得写死 width；需要占满时用 block");
      }
      // 多选只有两个入口：共享 MultiSelect（行内一行展示、点击进弹窗编辑）与查询区的 FilterSelect（筛选条件用 Ant 默认多选形态），
      // 其余地方不得自开 Ant Select 的 multiple/tags
      if (name === "mode" && !/\/src\/components\/ui\/(?:MultiSelect|FilterSelect)\.tsx$/.test(filename)
        && references.matches(opening.tagName, "antd", "Select")) {
        report(node, "FRONTEND-COMPONENTS", "多选控件统一使用共享 MultiSelect，不得直接给 Select 传 mode");
      }
      if (!sharedUI && name === "rowSelection" && (references.matches(opening.tagName, "antd", "Table") || references.matches(opening.tagName, "@/components/ui", "DataTable"))) report(node, "FRONTEND-TABLE", "表格不提供多选与批量操作：写操作在行内或详情页逐条完成，不得开启 rowSelection");
      // 静态字段说明收进标签旁问号；extra 只留给随状态变化的提示（条件表达式）
      if (name === "extra" && references.matches(opening.tagName, "antd", "Form", ["Item"]) && node.initializer) {
        const extraValue = ts.isJsxExpression(node.initializer) ? node.initializer.expression : node.initializer;
        const staticText = extraValue && (ts.isStringLiteralLike(extraValue)
          || (ts.isCallExpression(extraValue) && /^(?:t|i18n\.t)$/.test(extraValue.expression.getText(sourceFile))));
        if (staticText) report(node, "FRONTEND-TOOLTIP", "静态字段说明用 Form.Item tooltip（标签旁问号），不得常驻在 extra；extra 只用于随状态变化的提示");
      }
      if (name === "precision" && node.initializer && ts.isJsxExpression(node.initializer) && node.initializer.expression
        && ts.isNumericLiteral(node.initializer.expression) && Number(node.initializer.expression.text) > 3) {
        report(node, "FRONTEND-DATA", "小数位全局上限三位：precision 不得超过 3");
      }
      if (name === "copyable" && !sharedUI && !references.matches(opening.tagName, "@/components/ui", "AtomicValue")) report(node, "FRONTEND-COMPONENTS", "复制统一使用共享 CopyableValue 或 AtomicValue copyable，禁止 Typography copyable 或自绘复制入口");
      if (name === "title" && (isButtonTag || tag === "span" || tag === "div")) report(node, "FRONTEND-TOOLTIP", "禁止原生 title；过长内容用 AtomicValue/LongText 左右滚动，说明用 HelpTip 问号");
      if (!sharedUI && name === "color" && isTagTag) report(node, "FRONTEND-THEME", "Tag 状态颜色必须由共享语义组件决定");
    }
    ts.forEachChild(node, visit);
  }
  visit(sourceFile);
  inspectFeedbackDiscipline(sourceFile, references, report, filename);
  return errors;
}

/** 提前提取 message 会丢失 HTTP 状态；追踪直接成员与不可变局部别名。 */
function containsExtractedErrorMessage(expression, references, seen = new Set()) {
  const node = unwrapParentheses(expression);
  if (!node) return false;
  if (ts.isPropertyAccessExpression(node) && node.name.text === "message") return true;
  if (ts.isElementAccessExpression(node) && ts.isStringLiteralLike(unwrapParentheses(node.argumentExpression))
    && unwrapParentheses(node.argumentExpression).text === "message") return true;
  if (ts.isIdentifier(node)) {
    const declaration = references.resolveIdentifier(node);
    if (!declaration || seen.has(declaration.node) || !ts.isVariableDeclaration(declaration.owner)
      || !ts.isVariableDeclarationList(declaration.owner.parent)
      || !(declaration.owner.parent.flags & ts.NodeFlags.Const) || !declaration.owner.initializer) return false;
    if (declaration.bindingProperty === "message") return true;
    return containsExtractedErrorMessage(declaration.owner.initializer, references, new Set(seen).add(declaration.node));
  }
  // 不追踪新构造的结构化错误对象；共享入口仍可读取其中保留的状态和响应体。
  if (ts.isObjectLiteralExpression(node)) return false;
  let found = false;
  ts.forEachChild(node, (child) => { if (containsExtractedErrorMessage(child, references, seen)) found = true; });
  return found;
}

/** FRONTEND-FEEDBACK：通知入口唯一、只由用户动作触发。 */
function inspectFeedbackDiscipline(sourceFile, references, report, filename) {
  const normalized = filename.replace(/\\/g, "/");
  const rawAllowed = FEEDBACK_ALLOWED_RAW_FILES.test(normalized);
  const serviceLayer = /\/src\/services\//.test(normalized) || /\/src\/utils\/request\.ts$/.test(normalized);
  for (const statement of sourceFile.statements) {
    if (!ts.isImportDeclaration(statement) || !ts.isStringLiteral(statement.moduleSpecifier)) continue;
    const moduleName = statement.moduleSpecifier.text;
    const bindings = statement.importClause?.namedBindings;
    if (!bindings || !ts.isNamedImports(bindings)) continue;
    if ((moduleName === "antd" || moduleName === "@/utils/antdStatic") && !rawAllowed) {
      for (const entry of bindings.elements) {
        const imported = (entry.propertyName ?? entry.name).text;
        if (imported === "message" || imported === "notification") report(entry, "FRONTEND-FEEDBACK", "反馈只走 @/utils/feedback 的 notifyActionSuccess/notifyActionFailed/notifyWarning，禁止直接使用 antd message/notification");
      }
    }
  }
  function visit(node) {
    if (ts.isCallExpression(node)) {
      const entry = [...FEEDBACK_ENTRY_NAMES].find((name) => references.matches(node.expression, "@/utils/feedback", name));
      if (entry) {
        if (serviceLayer) report(node, "FRONTEND-FEEDBACK", "服务层与请求层不弹通知：失败以异常抛给动作处理函数");
        const violation = feedbackCallViolation(node);
        if (violation) report(node, "FRONTEND-FEEDBACK", violation);
        if (entry === "notifyActionFailed" && containsExtractedErrorMessage(node.arguments[1], references)) {
          report(node, "FRONTEND-FEEDBACK", "失败通知传原始错误对象，不得提前提取 message 或通过字符串转换丢失 HTTP 状态");
        }
        if (entry === "notifyActionSuccess") {
          for (let ancestor = node.parent; ancestor && !ts.isSourceFile(ancestor); ancestor = ancestor.parent) {
            if (isAnyFunctionNode(ancestor)) break;
            if (ts.isCatchClause(ancestor)) { report(node, "FRONTEND-FEEDBACK", "catch 分支不得报成功：失败路径用 notifyActionFailed"); break; }
          }
        }
      }
      if (ts.isPropertyAccessExpression(node.expression) && ["success", "error", "warning", "info", "open"].includes(node.expression.name.text)) {
        const receiver = node.expression.expression;
        const isAppFeedback = ts.isIdentifier(receiver) && /^(?:message|notification|messageApi|notificationApi)$/.test(receiver.text)
          && !references.resolveIdentifier(receiver)?.moduleName?.startsWith("@/utils/feedback");
        if (isAppFeedback && !rawAllowed) report(node, "FRONTEND-FEEDBACK", "反馈只走 @/utils/feedback，禁止直接调用 message/notification 实例");
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(sourceFile);
}

export function inspectCss(source, { filename = "style.css", tokenSource = false } = {}) {
  const errors = [];
  if (!filename.endsWith(".css")) {
    return [{ line: 1, rule: "FRONTEND-STYLE", message: "样式文件统一为普通 CSS，Less/Sass 等预处理器文件不得存在" }];
  }
  let root;
  try {
    root = postcss.parse(source);
  } catch (error) {
    return [{ line: error.line ?? 1, rule: "FRONTEND-THEME", message: `样式无法解析：${error.reason ?? error.message}` }];
  }
  const report = (node, rule, message) => errors.push({ line: node.source?.start?.line ?? 1, rule, message });
  const customProperties = new Map();
  root.walkDecls((declaration) => {
    if (!declaration.prop.startsWith("--")) return;
    const definitions = customProperties.get(declaration.prop) ?? [];
    definitions.push(declaration);
    customProperties.set(declaration.prop, definitions);
  });
  const privateDesignVariable = (name, seen = new Set()) => {
    if (/^--(?:ds|ant)-/.test(name)) return true;
    if (seen.has(name)) return false;
    const next = new Set(seen).add(name);
    return (customProperties.get(name) ?? []).some((declaration) => {
      if (RAW_LENGTH.test(declaration.value) || containsRawColor(declaration.value)) return true;
      return [...declaration.value.matchAll(/var\(\s*(--[\w-]+)/gi)]
        .some((match) => privateDesignVariable(match[1], next));
    });
  };
  root.walkAtRules((rule) => {
    // 容器查询只属于共享层：按自身宽度分列的阈值集中在 components/ui（ResponsiveGrid 等），业务样式不得各自定义
    if (rule.name === "container" && !/(?:^|\/)src\/components\/ui\//.test(filename)) {
      report(rule, "FRONTEND-LAYOUT", "容器查询（@container）只允许写在共享层 components/ui；卡片/图表按宽度分列用 ResponsiveGrid");
    }
    if (rule.name === "media" && !tokenSource) {
      for (const match of rule.params.matchAll(/\((?:min|max)-width:\s*([\d.]+)px\)/gi)) {
        if (![480, 640, 768].includes(Number(match[1]))) report(rule, "FRONTEND-STYLE", `CSS 断点必须使用 480/640/768 三档（与 designTokens.breakpoint 同源），当前为 ${match[1]}px`);
      }
    }
  });
  root.walkRules((rule) => {
    // 业务层禁止覆盖 Ant 内部 DOM;共享层(components/ui)在自己包装类作用域内
    // 用后代选择器接管 Ant 结构是合法的统一机制(与学助系统同构)。
    const isUiLayer = /(?:^|\/)src\/components\/ui\//.test(filename.replace(/\\/g, "/"));
    if (!isUiLayer && /\.ant-[\w-]+/.test(rule.selector)) report(rule, "FRONTEND-THEME", "业务层禁止覆盖 Ant Design 内部 DOM；结构接管应提升到 components/ui 共享层");
    // ant-* / hljs-* 类属于第三方库自身命名,不参与 ds- 前缀所有权判定。
    const classTokens = [...rule.selector.matchAll(/(?<![\w-])\.([a-zA-Z][\w-]*)/g)].map((match) => match[1]).filter((token) => !token.startsWith("ant-") && !token.startsWith("hljs-"));
    if (classTokens.length === 0) return;
    const isSharedLayer = /(?:^|\/)src\/(?:components|layouts)\//.test(filename.replace(/\\/g, "/"));
    const isPageLayer = /(?:^|\/)src\/pages\//.test(filename.replace(/\\/g, "/"));
    // 共享层包装第三方库时，可在自己的 ds- 根选择器之下引用该库的类名（如 .ds-filter-rules .ruleGroup）
    const scopedUnderOwnRoot = rule.selector.split(",").every((selector) => /^\s*\.ds-[\w-]+(?:\s|[>+~])/.test(selector));
    if (isSharedLayer && !scopedUnderOwnRoot && classTokens.some((token) => !token.startsWith("ds-"))) {
      report(rule, "FRONTEND-STYLE", `共享层类名必须使用 ds- 前缀（第三方库类名只能出现在自己的 ds- 根选择器之下）：${rule.selector}`);
    }
    if (isPageLayer && classTokens.some((token) => token.startsWith("ds-"))) {
      report(rule, "FRONTEND-STYLE", `ds- 前缀为共享层保留，页面样式不得占用：${rule.selector}`);
    }
  });
  root.walkRules((rule) => {
    // 用边框色做底、以 gap 露出分隔线的“切割面板”：必须圆角裁切且分隔线与外框同线宽，
    // 否则内部方块会在圆角处露出直角和缝隙，看起来像多个板块硬拼成一个。
    const decls = new Map((rule.nodes ?? []).filter((node) => node.type === "decl").map((node) => [node.prop, node.value.trim()]));
    const dividerBackground = /var\(--ds-color-border(?:-strong)?\)/.test(decls.get("background") ?? decls.get("background-color") ?? "");
    if (!dividerBackground || !decls.has("gap")) return;
    const radius = decls.get("border-radius");
    if (radius && radius !== "0") {
      if (!/^(?:hidden|clip)$/.test(decls.get("overflow") ?? "")) report(rule, "FRONTEND-LAYOUT", "切割面板：圆角外框必须 overflow: clip 裁切内部单元，不能让内部方块露出直角");
      if (!/^(?:var\(--ant-line-width\)|1px)$/.test(decls.get("gap") ?? "")) report(rule, "FRONTEND-LAYOUT", "切割面板：分隔线 gap 必须与外框同为 var(--ant-line-width)，不得用更粗的缝隙拼接");
    }
  });
  root.walkDecls((declaration) => {
    if (declaration.prop === "scrollbar-width" && declaration.value !== "none" && !filename.endsWith("/components/ui/scrollbar.css")) {
      report(declaration, "FRONTEND-STYLE", "滚动条尺寸只在共享 scrollbar.css 声明，标准 thin / WebKit 2px，不能分散覆写");
    }
    if (declaration.important) report(declaration, "FRONTEND-THEME", "禁止使用 !important");
    if (!tokenSource && isColorProperty(declaration.prop) && containsRawColor(declaration.value)) report(declaration, "FRONTEND-THEME", "颜色必须使用设计角色");
    if (!tokenSource && /^(?:color|border(?:-[a-z]+)?-color|outline-color|caret-color|text-decoration-color)$/.test(declaration.prop) && /--ds-color-scrim/.test(declaration.value)) {
      report(declaration, "FRONTEND-THEME", "scrim 遮罩色不得用作文字/边框颜色；文字只能用 text/text-secondary/text-tertiary");
    }
    if (!tokenSource && CSS_DIMENSION_PROPERTY.test(declaration.prop) && RAW_LENGTH.test(declaration.value)) report(declaration, "FRONTEND-THEME", "CSS 字号、圆角和间距必须使用设计标度");
    if (CSS_MARGIN_PROPERTY.test(declaration.prop) && CSS_NEGATIVE_EXPRESSION.test(declaration.value)) report(declaration, "FRONTEND-LAYOUT", "禁止使用负外边距补救布局；由父布局或组件变体管理间距");
    const cssIsUiLayer = /(?:^|\/)src\/components\/ui\//.test(filename.replace(/\\/g, "/"));
    if (!tokenSource && !cssIsUiLayer && CSS_MARGIN_PROPERTY.test(declaration.prop) && !declaration.value.trim().split(/\s+/).every((part) => /^(?:0(?:px)?|auto)$/.test(part))) {
      report(declaration, "FRONTEND-LAYOUT", "业务 CSS 禁止用 margin 制造间隔：由共享 Stack/ContentStack 等容器的 gap 统一间距");
    }
    if (!tokenSource && !cssIsUiLayer && /^(?:gap|row-gap|column-gap)$/.test(declaration.prop)
      && /--ds-space-(?:2|12|32|40)\b/.test(declaration.value)) {
      report(declaration, "FRONTEND-LAYOUT", "gap 只能取四档角色间距 --ds-space-24/16/8/4");
    }
    if (!tokenSource
      && declaration.prop === "font-family"
      && !CSS_FONT_FAMILY_TOKEN.test(declaration.value.trim())) {
      report(declaration, "FRONTEND-THEME", "CSS 字体族必须使用统一设计 token");
    }
    if (!tokenSource
      && declaration.prop === "font"
      && !fontShorthandUsesToken(declaration.value)) {
      report(declaration, "FRONTEND-THEME", "CSS 字体族必须使用统一设计 token");
    }
    if (!tokenSource && declaration.prop.startsWith("--")) {
      // 第三方库的配置变量（如 react-querybuilder 的 --rqb-*）允许在共享组件里桥接到设计 token：
      // 值只能由 var(--ds-*)/var(--ant-*) 组成，不得出现裸数值或颜色；--ds-/--ant- 自身仍只能在 token 源定义
      const sharedComponentLayer = /(?:^|\/)src\/components\//.test(filename.replace(/\\/g, "/"));
      const bridgesTokens = sharedComponentLayer && !/^--(?:ds|ant)-/.test(declaration.prop)
        && /^(?:\s*var\(\s*--(?:ds|ant)-[\w-]+\s*\)\s*)+$/.test(declaration.value.trim());
      if (privateDesignVariable(declaration.prop) && !bridgesTokens) {
        report(declaration, "FRONTEND-THEME", "设计 token 只能在唯一 token 源定义");
      }
    }
    if (!tokenSource && /var\(\s*--ant-(?:font-size|border-radius)/.test(declaration.value)) report(declaration, "FRONTEND-THEME", "业务样式不得直接引用 Ant Design 尺寸变量");
    if (!tokenSource && declaration.prop === "text-overflow" && /ellipsis/i.test(declaration.value)) report(declaration, "FRONTEND-TOOLTIP", "过长内容统一在自身范围内左右滚动（单行值用 AtomicValue，单元格长说明用 LongText），不省略、不靠悬停 Tooltip 看全文");
    // 横向滚动槽位的样式只在 overflowScroll.css：其他样式文件不得自行写“溢出后才可滚”的规则
    if (!tokenSource
      && !/(?:^|\/)src\/components\/ui\/overflowScroll\.css$/.test(filename.replace(/\\/g, "/"))
      && declaration.parent?.type === "rule"
      && /\[data-overflowing/.test(declaration.parent.selector)) {
      report(declaration, "FRONTEND-TOOLTIP", "横向滚动槽位统一登记在 components/ui/overflowSlots.ts，样式只写在 overflowScroll.css，不在组件里各自声明");
    }
    // 过长单项只有一种处理：单行滚动。断词折行只允许用于句子 / 段落，规则内须有“正文折行”注释说明这是正文
    if (!tokenSource
      && ((declaration.prop === "overflow-wrap" && /anywhere|break-word/i.test(declaration.value))
        || (declaration.prop === "word-break" && /break-all|break-word/i.test(declaration.value)))
      && !(declaration.parent?.nodes ?? []).some((node) => node.type === "comment" && /正文折行/.test(node.text))) {
      report(declaration, "FRONTEND-TOOLTIP", "过长单项（名称、标识、值、选项、标签、标题）统一单行左右滚动，不断词折行；句子 / 段落折行须在规则内注明“正文折行”");
    }
    if (!tokenSource
      && (declaration.prop === "overflow" || declaration.prop === "overflow-x")
      && /^\s*(?:hidden|clip)(?:\s|$)/i.test(declaration.value)
      && declaration.parent?.type === "rule"
      && declaration.parent.selector.split(",").some((selector) => /^(?:html|body|#root|\.ds-page-root)$/.test(selector.trim()))) {
      report(declaration, "FRONTEND-LAYOUT", "页面根不得隐藏或裁切横向溢出；应由具体内容区域持有滚动");
    }
  });
  return errors;
}

function cssVariableReferences(source, filename) {
  const references = [];
  const definitions = [];
  const addVars = (value, lineForOffset) => {
    for (const match of value.matchAll(/var\(\s*(--ds-[\w-]+)/gi)) {
      references.push({ name: match[1], line: lineForOffset(match.index ?? 0) });
    }
  };
  const addNames = (value, lineForOffset, target) => {
    for (const match of value.matchAll(/--ds-[\w-]+/gi)) {
      target.push({ name: match[0], line: lineForOffset(match.index ?? 0) });
    }
  };
  if (filename.endsWith(".css")) {
    let root;
    try {
      root = postcss.parse(source);
    } catch {
      return { definitions, references };
    }
    root.walkDecls((declaration) => addVars(declaration.value, () => declaration.source?.start?.line ?? 1));
    root.walkAtRules((rule) => addVars(rule.params, () => rule.source?.start?.line ?? 1));
    return { definitions, references };
  }
  const sourceFile = ts.createSourceFile(filename, source, ts.ScriptTarget.Latest, true, filename.endsWith("tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  function visit(node) {
    if (ts.isStringLiteralLike(node)
      || node.kind === ts.SyntaxKind.TemplateHead
      || node.kind === ts.SyntaxKind.TemplateMiddle
      || node.kind === ts.SyntaxKind.TemplateTail) {
      const value = node.text ?? "";
      const lineForOffset = (offset) => sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile) + offset).line + 1;
      addVars(value, lineForOffset);
      if (ts.isStringLiteralLike(node) && ts.isCallExpression(node.parent) && node.parent.arguments[0] === node) {
        if (ts.isPropertyAccessExpression(node.parent.expression)) {
          if (node.parent.expression.name.text === "getPropertyValue") addNames(value, lineForOffset, references);
          if (node.parent.expression.name.text === "setProperty") addNames(value, lineForOffset, definitions);
        }
        // readCssColorToken 是设计标度认可的运行时读取入口，视为真实引用。
        if (ts.isIdentifier(node.parent.expression) && node.parent.expression.text === "readCssColorToken") addNames(value, lineForOffset, references);
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(sourceFile);
  return { definitions, references };
}

/**
 * 两档机制互斥：一个列表页（或列表页里的一个页签，各算一页）有详情入口（ActionLink + EyeOutlined）即为业务实体列表，
 * 新建与编辑走 <列表>/new、<列表>/detail/:key/edit 页面。判定按文件：含 DrawerForm、或含非查询 / 导出的 ModalForm 的文件，
 * 若它自身或它直接引入的同目录模块（如 ./columns）有详情入口，即拒绝；配置条目页签（如权限定义）的抽屉放在自己的文件里不受影响。
 */
export function inspectEntityListForms(files) {
  const errors = [];
  const bySource = new Map(files.map((file) => [file.filename.replace(/\\/g, "/"), file]));
  const hasDetailEntry = (source) => /<ActionLink\b[^>]*EyeOutlined/.test(source);
  const objectForm = (source) => source.split("\n").findIndex((text) => /<DrawerForm\b/.test(text)
    || (/<ModalForm\b/.test(text) && !/action:\s*["'](?:query|export)["']/.test(source)));
  const resolveLocal = (from, specifier) => {
    const base = from.slice(0, from.lastIndexOf("/") + 1) + specifier.replace(/^\.\//, "");
    return [`${base}.tsx`, `${base}.ts`, `${base}/index.tsx`, `${base}/index.ts`].map((candidate) => bySource.get(candidate)).find(Boolean);
  };
  for (const [filename, file] of bySource) {
    const line = objectForm(file.source);
    if (line < 0) continue;
    const imported = [...file.source.matchAll(/from\s+["'](\.\/[^"']+)["']/g)].map((match) => resolveLocal(filename, match[1])).filter(Boolean);
    if ([file, ...imported].some((candidate) => hasDetailEntry(candidate.source))) {
      errors.push({ filename: file.filename, line: line + 1, rule: "FRONTEND-NAVIGATION", message: "有详情页的业务实体列表不用弹窗 / 抽屉表单：新建走 <列表>/new，编辑走详情页的“编辑”" });
    }
  }
  return errors;
}

/**
 * 横向滚动槽位单一来源：overflowSlots.ts 的 SCROLL_SLOTS 与 overflowScroll.css 的两组规则（默认不滚 / 溢出后可滚）逐条一致。
 */
export function inspectScrollSlots({ slotsSource, cssSource }) {
  const errors = [];
  // 读取真实字符串节点，选择器里的属性引号不能被误当成槽位项。
  const source = ts.createSourceFile(slotsSource.filename, slotsSource.source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  let listed = [];
  const visit = (node) => {
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.name.text === "SCROLL_SLOTS") {
      let value = node.initializer;
      while (value && (ts.isAsExpression(value) || ts.isParenthesizedExpression(value))) value = value.expression;
      if (value && ts.isArrayLiteralExpression(value) && value.elements.every(ts.isStringLiteralLike)) listed = value.elements.map((item) => item.text);
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  if (listed.some((selector) => selector.includes("ds-information-grid"))) {
    errors.push({ filename: slotsSource.filename, line: 1, rule: "FRONTEND-LAYOUT", message: "详情键值信息必须完整折行，不能登记为横向滚动槽" });
  }
  if (listed.length === 0) {
    errors.push({ filename: slotsSource.filename, line: 1, rule: "FRONTEND-TOOLTIP", message: "未找到 SCROLL_SLOTS 槽位清单" });
    return errors;
  }
  const base = new Set();
  const marked = new Set();
  postcss.parse(cssSource.source).walkRules((rule) => {
    for (const selector of rule.selector.split(/,(?![^(]*\))/).map((item) => item.trim())) {
      if (selector.endsWith('[data-overflowing="true"]')) marked.add(selector.slice(0, -'[data-overflowing="true"]'.length));
      else if (rule.nodes.some((node) => node.type === "decl" && node.prop === "overflow-x" && node.value === "hidden")) base.add(selector);
    }
  });
  const normalizeSelector = (selector) => selector.replace(/\s+/g, " ").trim();
  const same = (set) => { const normalized = new Set([...set].map(normalizeSelector)); return normalized.size === listed.length && listed.every((selector) => normalized.has(normalizeSelector(selector))); };
  if (!same(base)) errors.push({ filename: cssSource.filename, line: 1, rule: "FRONTEND-TOOLTIP", message: "overflowScroll.css 的默认槽位规则必须与 SCROLL_SLOTS 逐条一致" });
  if (!same(marked)) errors.push({ filename: cssSource.filename, line: 1, rule: "FRONTEND-TOOLTIP", message: "overflowScroll.css 的 [data-overflowing] 规则必须与 SCROLL_SLOTS 逐条一致" });
  return errors;
}

/**
 * 尺寸 token 的刻度：间距、圆角、控件高度取 4 的倍数（只有 --ds-space-2 细线间距例外），
 * 结构宽度取 20 的倍数；引用其他 token 的派生值不在此校验。
 */
export function sizeTokenScaleIssue(name, value) {
  const kind = /^--ds-(space|radius|control|layout)-/.exec(name)?.[1];
  if (!kind) return null;
  const px = /^\s*(\d+(?:\.\d+)?)px\s*$/.exec(value)?.[1];
  if (px === undefined) return null;
  const size = Number(px);
  if (kind === "layout") return size % 20 === 0 ? null : `结构宽度 ${name}: ${value} 必须是 20 的倍数`;
  if (name === "--ds-space-2" && size === 2) return null;
  return size % 4 === 0 ? null : `尺寸 ${name}: ${value} 必须是 4 的倍数（只有 --ds-space-2 细线间距例外）`;
}

export function inspectCssVariableContract({ tokenSource, consumers }) {
  const errors = [];
  // token 源是 src/design/tokens.css：亮色定义在 :root，暗色经 [data-theme="dark"] 覆盖同名变量。
  const tokenRoot = postcss.parse(tokenSource.source);
  const published = new Map();
  let lightBlock;
  let darkBlock;
  tokenRoot.walkRules((rule) => {
    for (const selector of rule.selector.split(",")) {
      const trimmed = selector.trim();
      if (trimmed === ":root") lightBlock = rule;
      if (trimmed === ':root[data-theme="dark"]') darkBlock = rule;
    }
  });
  const report = (line, message) => errors.push({ filename: tokenSource.filename, line, rule: "FRONTEND-THEME", message });
  if (!lightBlock) {
    report(1, "token 源必须定义 :root 亮色变量块");
  } else {
    const scheme = lightBlock.nodes?.find((node) => node.type === "decl" && node.prop === "color-scheme");
    if (scheme?.value.trim() !== "light") report(scheme ? scheme.source.start.line : lightBlock.source.start.line, ":root 亮色块必须声明 color-scheme: light");
    for (const node of lightBlock.nodes ?? []) {
      if (node.type !== "decl" || !node.prop.startsWith("--") || !/^--ds-[\w-]+$/.test(node.prop)) continue;
      if (published.has(node.prop)) report(node.source.start.line, `CSS 变量 ${node.prop} 在 token 源重复发布`);
      else published.set(node.prop, node.source.start.line);
      const scaleIssue = sizeTokenScaleIssue(node.prop, node.value);
      if (scaleIssue) report(node.source.start.line, scaleIssue);
    }
  }
  if (!darkBlock) {
    report(1, "token 源必须定义 :root[data-theme=\"dark\"] 暗色覆盖块");
  } else {
    const scheme = darkBlock.nodes?.find((node) => node.type === "decl" && node.prop === "color-scheme");
    if (scheme?.value.trim() !== "dark") report(scheme ? scheme.source.start.line : darkBlock.source.start.line, "暗色块必须声明 color-scheme: dark");
    for (const node of darkBlock.nodes ?? []) {
      if (node.type !== "decl" || !node.prop.startsWith("--")) continue;
      if (!published.has(node.prop)) report(node.source.start.line, `暗色覆盖变量 ${node.prop} 不在亮色发布清单中`);
    }
  }
  const used = new Set();
  // token 源内部的派生链与上下文改绑都是真实使用方：品牌种子只发布一次，
  // primary 各档和反色语义色通过 var() 形成闭包，最终仍须有外部消费者。
  tokenRoot.walkDecls((decl) => {
    for (const match of decl.value.matchAll(/var\((--ds-[\w-]+)/g)) used.add(match[1]);
  });
  for (const consumer of consumers) {
    const occurrences = cssVariableReferences(consumer.source, consumer.filename);
    for (const definition of occurrences.definitions) {
      errors.push({ filename: consumer.filename, line: definition.line, rule: "FRONTEND-THEME", message: `CSS 变量 ${definition.name} 只能由 src/design/tokens.css 发布` });
    }
    for (const reference of occurrences.references) {
      if (!published.has(reference.name)) {
        errors.push({ filename: consumer.filename, line: reference.line, rule: "FRONTEND-THEME", message: `CSS 变量 ${reference.name} 未由 src/design/tokens.css 发布` });
      } else {
        used.add(reference.name);
      }
    }
  }
  const entry = consumers.find((consumer) => /(?:^|\/)src\/main\.tsx$/.test(consumer.filename));
  let startupInstalled = false;
  if (entry) {
    const entryFile = ts.createSourceFile(entry.filename, entry.source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    for (const statement of entryFile.statements) {
      if (ts.isImportDeclaration(statement)
        && ts.isStringLiteral(statement.moduleSpecifier)
        && /[./]design\/tokens\.css$/.test(statement.moduleSpecifier.text)) {
        startupInstalled = true;
        break;
      }
    }
  }
  if (!startupInstalled) {
    errors.push({ filename: entry?.filename ?? "src/main.tsx", line: 1, rule: "FRONTEND-THEME", message: "main.tsx 必须真实导入 src/design/tokens.css 以在挂载前发布设计变量" });
  }
  for (const [name, line] of published) {
    if (!used.has(name)) errors.push({ filename: tokenSource.filename, line, rule: "FRONTEND-THEME", message: `已发布 CSS 变量 ${name} 没有真实使用方` });
  }
  return errors;
}

/**
 * 字号六档职责制(FRONTEND-THEME):token 源的字号梯级冻结为
 * 12/14/16/20/24/28,新增中间档必须先修订规范与本清单。
 */
const TYPOGRAPHY_SCALE = new Map([
  ["sizeXs", 12],
  ["sizeBody", 14],
  ["sizeLg", 16],
  ["sizeTitle", 20],
  ["sizePageTitle", 24],
  ["sizeMetric", 28],
]);

export function inspectTypographyScale(tokenSource, filename = "src/design/tokens.ts") {
  const errors = [];
  const sourceFile = ts.createSourceFile(filename, tokenSource, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  let fontConfig;
  const visit = (node) => {
    if (ts.isPropertyAssignment(node)
      && ts.isIdentifier(node.name) && node.name.text === "font"
      && ts.isObjectLiteralExpression(node.initializer)) {
      fontConfig = node.initializer;
      return;
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  if (!fontConfig) {
    errors.push({ filename, line: 1, rule: "FRONTEND-THEME", message: "token 源必须定义 font 字号梯级" });
    return errors;
  }
  for (const property of fontConfig.properties) {
    if (!ts.isPropertyAssignment(property) || !ts.isIdentifier(property.name)) continue;
    const name = property.name.text;
    if (name === "family" || name === "mono") continue;
    const expected = TYPOGRAPHY_SCALE.get(name);
    const literal = property.initializer;
    if (expected === undefined) {
      const line = sourceFile.getLineAndCharacterOfPosition(property.getStart(sourceFile)).line + 1;
      errors.push({ filename, line, rule: "FRONTEND-THEME", message: `字号梯级 ${name} 不在六档职责制内;新增档位必须先修订规范与 TYPOGRAPHY_SCALE 清单` });
    } else if (!ts.isNumericLiteral(literal) || Number(literal.text) !== expected) {
      const line = sourceFile.getLineAndCharacterOfPosition(property.getStart(sourceFile)).line + 1;
      errors.push({ filename, line, rule: "FRONTEND-THEME", message: `字号档 ${name} 必须保持 ${expected}px,与规范六档职责制一致` });
    }
  }
  return errors;
}

/**
 * Ant 主题映射的完整性检查：Menu 组件配置了亮色 item/group 键时,
 * 必须同时映射对应的 dark* 变体,否则收起态侧栏等 dark 菜单场景会
 * 回退到 Ant 内置默认色,逃逸出设计标度(FRONTEND-THEME)。
 */
export function inspectAntThemeMapping(themeSource, filename = "src/config/theme.ts") {
  const errors = [];
  const sourceFile = ts.createSourceFile(filename, themeSource, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const pairs = [
    ["itemColor", "darkItemColor"],
    // 分组选中标题是独立 token(无 dark 变体对),漏配会在暗色下回退为算法黑。
    ["itemSelectedColor", "subMenuItemSelectedColor"],
    ["itemHoverColor", "darkItemHoverColor"],
    ["itemHoverBg", "darkItemHoverBg"],
    ["itemSelectedColor", "darkItemSelectedColor"],
    ["itemSelectedBg", "darkItemSelectedBg"],
    ["groupTitleColor", "darkGroupTitleColor"],
  ];
  const findMenuConfig = (node) => {
    let found;
    const visit = (current) => {
      if (ts.isPropertyAssignment(current)
        && ts.isIdentifier(current.name) && current.name.text === "Menu"
        && ts.isObjectLiteralExpression(current.initializer)) {
        found = current.initializer;
        return;
      }
      ts.forEachChild(current, visit);
    };
    visit(node);
    return found;
  };
  const menu = findMenuConfig(sourceFile);
  if (!menu) {
    errors.push({ filename, line: 1, rule: "FRONTEND-THEME", message: "Ant 主题必须映射 Menu 组件 token" });
    return errors;
  }
  const keys = new Set(menu.properties
    .filter(ts.isPropertyAssignment)
    .map((property) => (ts.isIdentifier(property.name) ? property.name.text : undefined))
    .filter(Boolean));
  for (const [lightKey, darkKey] of pairs) {
    if (keys.has(lightKey) && !keys.has(darkKey)) {
      const line = sourceFile.getLineAndCharacterOfPosition(
        menu.properties.find((property) => ts.isPropertyAssignment(property)
          && ts.isIdentifier(property.name) && property.name.text === lightKey).getStart(sourceFile),
      ).line + 1;
      errors.push({ filename, line, rule: "FRONTEND-THEME", message: `Menu 组件映射了 ${lightKey} 但缺少成对的 ${darkKey};dark 菜单场景会回退到 Ant 默认色` });
    }
    if (keys.has(darkKey) && !keys.has(lightKey)) {
      const line = sourceFile.getLineAndCharacterOfPosition(
        menu.properties.find((property) => ts.isPropertyAssignment(property)
          && ts.isIdentifier(property.name) && property.name.text === darkKey).getStart(sourceFile),
      ).line + 1;
      errors.push({ filename, line, rule: "FRONTEND-THEME", message: `Menu 组件映射了 ${darkKey} 但缺少成对的 ${lightKey}` });
    }
  }
  const inspectTable = (node) => {
    if (ts.isPropertyAssignment(node) && ts.isIdentifier(node.name) && node.name.text === "Table"
      && ts.isObjectLiteralExpression(node.initializer)) {
      const header = node.initializer.properties.find(property => ts.isPropertyAssignment(property)
        && ts.isIdentifier(property.name) && property.name.text === "headerBg");
      if (!header || header.initializer.getText(sourceFile) !== "token.color.surface") {
        errors.push({ filename, line: sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1,
          rule: "FRONTEND-TABLE", message: "Table.headerBg 必须映射不透明的 token.color.surface，固定尾列表头不得透出横向滚过的其他列" });
      }
    }
    ts.forEachChild(node, inspectTable);
  };
  inspectTable(sourceFile);
  return errors;
}

export function inspectDependencies(dependencies) {
  return Object.keys(dependencies).filter((name) => SECOND_COMPONENT_SYSTEM.test(name));
}

/** 校验 package.json 未引入第二套样式机制（FRONTEND-STYLE）。 */
export function inspectStyleDependencies(dependencies) {
  return Object.keys(dependencies).filter((name) => SECOND_STYLE_SYSTEM.test(name));
}

/**
 * 数据页面信息架构（FRONTEND-INFOARCH）：
 * - 同一张图（同一组 chartTitle 槽位）不得同时出现在数据总览与深度分析；
 * - 数据总览只放项目配置登记的一级指标（不放派生指标）。
 * 输入是 `{ filename, source }` 列表，只看 design-system.project.json 里声明的总览页与深度分析页下的 chartTitle 字面量调用。
 */
const infoArch = project.infoArch?.applicability === "none" ? null : (project.infoArch ?? {});

function chartTitleSignatures(source, filename) {
  const sourceFile = ts.createSourceFile(filename, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const found = [];
  const visit = (node) => {
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === "chartTitle"
      && node.arguments[0] && ts.isObjectLiteralExpression(node.arguments[0])) {
      const parts = { dimension: "", metric: "", form: "" };
      let dynamic = false;
      for (const property of node.arguments[0].properties) {
        if (!ts.isPropertyAssignment(property)) continue;
        const name = propertyName(property, sourceFile);
        const init = property.initializer;
        if (ts.isStringLiteralLike(init)) parts[name] = init.text;
        else if (ts.isArrayLiteralExpression(init) && init.elements.every(ts.isStringLiteralLike)) parts[name] = init.elements.map((item) => item.text).join("+");
        else dynamic = true;
      }
      found.push({ ...parts, dynamic, line: sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1 });
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return found;
}

export function inspectDataPageArchitecture(sources, arch = infoArch) {
  if (!arch?.overviewPage || !arch?.analysisPage) return [];
  const overviewMetrics = new Set(arch.overviewMetrics ?? []);
  const overviewPage = new RegExp(`(?:^|/)${escapeForRegExp(arch.overviewPage)}`);
  const analysisPage = new RegExp(`(?:^|/)${escapeForRegExp(arch.analysisPage)}`);
  const errors = [];
  const overview = new Map();
  const analysis = new Map();
  for (const { filename, source } of sources) {
    const page = overviewPage.test(filename) ? overview
      : analysisPage.test(filename) ? analysis : undefined;
    if (!page || !/\.tsx?$/.test(filename)) continue;
    for (const signature of chartTitleSignatures(source, filename)) {
      const key = `${signature.dimension}|${signature.metric}|${signature.form}`;
      if (!signature.dynamic) page.set(key, { filename, line: signature.line });
      if (page === overview && !signature.dynamic) {
        const metrics = signature.metric.split("+").filter(Boolean);
        if (metrics.some((metric) => !overviewMetrics.has(metric))) {
          errors.push({ filename, line: signature.line, rule: "FRONTEND-INFOARCH", message: `数据总览只放 design-system.project.json 已登记的一级指标，派生指标（${signature.metric}）放到深度分析对应对象页签` });
        }
      }
    }
  }
  for (const [key, where] of overview) {
    const twin = analysis.get(key);
    if (twin) errors.push({ filename: twin.filename, line: twin.line, rule: "FRONTEND-INFOARCH", message: `同一张图（${key}）已在数据总览（${where.filename}）出现，深度分析不得重复摆放` });
  }
  return errors;
}
