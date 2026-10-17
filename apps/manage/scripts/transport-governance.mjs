import ts from "typescript";
export const isTransportModule = (filename, modules = []) => modules.some((entry) => filename.replaceAll("\\","/").endsWith("/" + entry.module));
export function serializerBindings(sourceFile, modules = []) {
  const names = new Set();
  for (const node of sourceFile.statements.filter(ts.isImportDeclaration)) {
    const entry = modules.find((item) => item.imports?.includes(node.moduleSpecifier.text));
    if (!entry || !node.importClause?.namedBindings || !ts.isNamedImports(node.importClause.namedBindings)) continue;
    for (const binding of node.importClause.namedBindings.elements) if (entry.serializers.includes(binding.propertyName?.text ?? binding.name.text)) names.add(binding.name.text);
  }
  return names;
}
export function isVisibleSerializer(node, names) {
  if (!ts.isIdentifier(node) || !names.has(node.text)) return false;
  for (let parent = node.parent; parent; parent=parent.parent) {
    // 比较产生布尔状态，不是日期文字；如当前月份禁用、日历格 inMonth。
    if (ts.isBinaryExpression(parent) && [ts.SyntaxKind.EqualsEqualsToken, ts.SyntaxKind.EqualsEqualsEqualsToken, ts.SyntaxKind.ExclamationEqualsToken, ts.SyntaxKind.ExclamationEqualsEqualsToken, ts.SyntaxKind.LessThanToken, ts.SyntaxKind.GreaterThanToken, ts.SyntaxKind.LessThanEqualsToken, ts.SyntaxKind.GreaterThanEqualsToken].includes(parent.operatorToken.kind)) return false;
    // 事件处理器中的提交调用属于传输，不是可见展示。
    if (ts.isFunctionLike(parent) || ts.isImportDeclaration(parent)) return false;
    if (ts.isJsxExpression(parent) || ts.isJsxAttribute(parent)) return true;
  }
  return false;
}
export function inspectTransportModules(modules, { exists, read }) {
  if (!Array.isArray(modules)) return ["transportModules 必须是数组"];
  const errors = [], seen = new Set();
  for (const entry of modules) {
    if (typeof entry?.module !== "string" || !/^src\/[\w/-]+\.ts$/.test(entry.module) || !exists(entry.module)) { errors.push("传输模块不存在或非法"); continue; }
    if (seen.has(entry.module)) errors.push("传输模块重复登记：" + entry.module); seen.add(entry.module);
    if (!Array.isArray(entry.imports) || !entry.imports.length || entry.imports.some((item)=>typeof item!=="string"||!item)) errors.push("传输模块须登记准确导入入口：" + entry.module);
    if (typeof entry.reason !== "string" || !entry.reason.trim() || typeof entry.contract !== "string" || !entry.contract.startsWith("docs/") || entry.contract.includes("..") || !exists(entry.contract)) { errors.push("传输模块缺少实际业务契约：" + entry.module); continue; }
    const ast=ts.createSourceFile(entry.module,read(entry.module),ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
    const exports=new Set();
    for(const statement of ast.statements) {
      if (!statement.modifiers?.some((mod)=>mod.kind===ts.SyntaxKind.ExportKeyword)) continue;
      if(ts.isFunctionDeclaration(statement)&&statement.name) exports.add(statement.name.text);
      if(ts.isVariableStatement(statement)) for(const declaration of statement.declarationList.declarations) if(ts.isIdentifier(declaration.name)) exports.add(declaration.name.text);
    }
    const serializers=entry.serializers ?? [], parsers=entry.parsers ?? [];
    if(!Array.isArray(serializers)||!serializers.length||!Array.isArray(parsers)) errors.push("传输模块必须分类登记 serializers/parsers：" + entry.module);
    for(const name of [...serializers,...parsers]) if(!exports.has(name)) errors.push("传输函数未在模块实际导出：" + name);
    const contract=read(entry.contract);
    function visit(node) {
      if(ts.isJsxElement(node)||ts.isJsxSelfClosingElement(node)) errors.push("传输模块必须为纯数据边界，不包含界面：" + entry.module);
      if(ts.isStringLiteralLike(node)&&/(?:YY|\bMM)-(?:MM|DD)\b/.test(node.text)&&!contract.includes(node.text)) errors.push("传输格式未在业务契约声明：" + node.text);
      ts.forEachChild(node,visit);
    }
    visit(ast);
  }
  return errors;
}
