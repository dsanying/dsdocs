import path from "node:path";
import ts from "typescript";

const unwrap = node => node && (ts.isParenthesizedExpression(node) || ts.isAsExpression(node) || ts.isSatisfiesExpression(node)) ? unwrap(node.expression) : node;
const literal = node => { const value = unwrap(node); return value && ts.isStringLiteral(value) ? value.text : undefined; };
const prop = (node, name) => node.properties?.find(item => ts.isPropertyAssignment(item) && (item.name.getText().replace(/["']/g, "") === name))?.initializer;
const attribute = (node, name) => {
  const attr = node.attributes.properties.find(item => ts.isJsxAttribute(item) && item.name.getText() === name);
  return attr?.initializer && (ts.isJsxExpression(attr.initializer) ? attr.initializer.expression : attr.initializer);
};
const translation = node => { const value = unwrap(node); return value && ts.isCallExpression(value) && value.arguments.length && literal(value.arguments[0]); };
const each = (node, visit) => { visit(node); ts.forEachChild(node, child => each(child, visit)); };
const normalize = file => file.replace(/^\//, "").replace(/\\/g, "/");

/** 每个真实查询字段须绑定真实列或详情标识；自动发现 QueryForm 及其抽出的局部字段组件，不依赖页面白名单。 */
export function inspectQueryFieldBindings(sources) {
  const documents = new Map(sources.filter(({ filename }) => /\.tsx?$/.test(filename)).map(({ filename, source }) => {
    const file = normalize(filename);
    return [file, { file, ast: ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX), source }];
  }));
  const issues = [];
  const report = (doc, node, message) => issues.push({ filename: doc.file, line: doc.ast.getLineAndCharacterOfPosition(node.getStart()).line + 1, rule: "FRONTEND-TABLE", message });
  const imports = doc => {
    const map = new Map();
    for (const statement of doc.ast.statements) {
      if (!ts.isImportDeclaration(statement) || !ts.isStringLiteral(statement.moduleSpecifier)) continue;
      const clause = statement.importClause;
      const module = statement.moduleSpecifier.text;
      if (clause?.name) map.set(clause.name.text, { module, name: "default" });
      if (clause?.namedBindings && ts.isNamedImports(clause.namedBindings)) for (const item of clause.namedBindings.elements) map.set(item.name.text, { module, name: (item.propertyName ?? item.name).text });
      if (clause?.namedBindings && ts.isNamespaceImport(clause.namedBindings)) map.set(clause.namedBindings.name.text, { module, namespace: true });
    }
    return map;
  };
  const maps = new Map([...documents].map(([file, doc]) => [file, imports(doc)]));
  const matches = (doc, tag, module, name) => {
    const text = tag.getText(doc.ast).split(".");
    const imported = maps.get(doc.file).get(text[0]);
    return imported?.module === module && ((imported.namespace ? text.slice(1).join(".") : [imported.name, ...text.slice(1)].join(".")) === name);
  };
  const resolveFile = (doc, relative) => {
    const base = relative.startsWith("@/") ? `src/${relative.slice(2)}` : relative ? path.posix.normalize(path.posix.join(path.posix.dirname(doc.file), relative)) : doc.file;
    return [base, `${base}.tsx`, `${base}.ts`, `${base}/index.tsx`].find(candidate => documents.has(candidate));
  };
  const columns = new Map();
  const details = new Set();
  for (const doc of documents.values()) each(doc.ast, node => {
    if (!ts.isObjectLiteralExpression(node)) return;
    const key = literal(prop(node, "dataIndex")) ?? literal(prop(node, "key"));
    if (!key) return;
    if (prop(node, "title")) columns.set(`${doc.file}#${key}`, { label: translation(prop(node, "title")) });
    if (prop(node, "label") && prop(node, "value")) details.add(`${doc.file}#${key}`);
  });
  const visitedFields = new Set();
  const scan = (doc, tree, external = false) => each(tree, node => {
    if (!ts.isJsxOpeningElement(node) && !ts.isJsxSelfClosingElement(node)) return;
    if (matches(doc, node.tagName, "antd", "Form.Item")) {
      const field = literal(attribute(node, "name"));
      if (!field) return;
      const position = `${doc.file}:${node.pos}`;
      if (visitedFields.has(position)) return;
      visitedFields.add(position);
      const purpose = literal(attribute(node, "data-filter-purpose"));
      const binding = literal(attribute(node, "data-filter-column"));
      const owner = ts.isJsxOpeningElement(node) ? node.parent : node;
      let kind;
      let hasInput = false;
      each(owner, child => {
        if (!ts.isJsxOpeningElement(child) && !ts.isJsxSelfClosingElement(child)) return;
        if (matches(doc, child.tagName, "@/components/ui", "FilterSelect")) kind = literal(attribute(child, "kind"));
        if (matches(doc, child.tagName, "antd", "Input") || matches(doc, child.tagName, "@/components/ui", "SearchInput")) hasInput = true;
      });
      if (purpose === "scope") {
        const rulesNode = unwrap(attribute(node, "rules"));
        const required = rulesNode && ts.isArrayLiteralExpression(rulesNode)
          && rulesNode.elements.some((el) => ts.isObjectLiteralExpression(el) && el.properties.some((p) => ts.isPropertyAssignment(p) && p.name.getText() === "required" && p.initializer.kind === ts.SyntaxKind.TrueKeyword));
        if (!required) report(doc, node, `查询字段 ${field} 声明 scope 必填作用域时必须带 required 校验规则`);
        if (kind === "scope") return;
        if (!binding) return; // 无候选来源的必填作用域允许自由文本输入
      }
      if (!binding) {
        if (purpose !== "keyword") { report(doc, node, `查询字段 ${field} 必须用 data-filter-column 绑定真实列；跨字段关键词用 data-filter-purpose=keyword 豁免，必填作用域显式声明 data-filter-purpose=scope`); return; }
        if (!hasInput) report(doc, node, `关键词查询 ${field} 必须是自由文本输入，不得给实体多选虚报用途`);
        const freeLabel = translation(attribute(node, "label"));
        if (freeLabel && freeLabel !== "common.vocab.search") report(doc, node, `跨字段关键词查询 ${field} 不绑定单列，标签必须统一使用 common.vocab.search，不得自造文案`);
        return;
      }
      const [filePart, keyPart] = binding.split("#");
      const targetFile = resolveFile(doc, filePart);
      const target = targetFile && `${targetFile}#${keyPart}`;
      if (purpose === "identifier") {
        if (!hasInput || !details.has(target)) report(doc, node, `标识查询 ${field} 必须绑定真实详情字段，不能用 identifier 绕过不存在的列`);
        return;
      }
      const column = columns.get(target);
      if (!column) { report(doc, node, `查询字段 ${field} 绑定的列 ${binding} 不存在（只接受真实 title + dataIndex/key 列定义）`); return; }
      if (purpose && !["keyword", "range"].includes(purpose)) report(doc, node, `查询字段 ${field} 的用途必须为 keyword / range / identifier / scope`);
      if (purpose === "keyword" && !hasInput) report(doc, node, `关键词查询 ${field} 必须是自由文本输入，不得给实体多选虚报用途`);
      const label = translation(attribute(node, "label"));
      if (label && column.label && label !== column.label) report(doc, node, `查询字段 ${field} 与对应列必须使用同一文案键：${label} ≠ ${column.label}`);
    }
    // QueryForm 抽出的字段组件沿真实局部导入进入扫描；共享 UI 控件不进入，避免把内部字段当业务查询。
    const imported = maps.get(doc.file).get(node.tagName.getText(doc.ast));
    if (imported && (imported.module.startsWith(".") || imported.module.startsWith("@/pages/"))) {
      const file = resolveFile(doc, imported.module);
      const childDoc = documents.get(file);
      if (childDoc && !external) scan(childDoc, childDoc.ast, true);
    }
  });
  for (const doc of documents.values()) each(doc.ast, node => {
    if (ts.isJsxElement(node) && matches(doc, node.openingElement.tagName, "@/components/ui", "QueryForm")) scan(doc, node);
  });
  return issues;
}
