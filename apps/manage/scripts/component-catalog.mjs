import ts from "typescript";
export function publicExports(source) {
  const file = ts.createSourceFile("index.ts", source, ts.ScriptTarget.Latest, true);
  return file.statements.filter(ts.isExportDeclaration).flatMap((node) => {
    if (!node.exportClause || !ts.isNamedExports(node.exportClause) || !node.moduleSpecifier) return [];
    return node.exportClause.elements.map((entry) => ({ name: entry.name.text, kind: node.isTypeOnly || entry.isTypeOnly ? "type" : "value", module: node.moduleSpecifier.text }));
  });
}
export function inspectComponentCatalog(actual, catalog) {
  const errors = [];
  const key = (entry) => [entry.name,entry.kind,entry.module].join("|");
  const expected = catalog.exports.map(key), current = actual.map(key);
  if (new Set(expected).size !== expected.length) errors.push("组件目录存在重复导出");
  for (const entry of actual) if (!expected.includes(key(entry))) errors.push("公共导出未登记：" + entry.name);
  for (const entry of catalog.exports) {
    if (!current.includes(key(entry))) errors.push("目录导出与真实入口不一致：" + entry.name);
    if (!entry.selection?.trim() || !entry.source?.startsWith("src/components/ui/")) errors.push("组件选型缺少真实源码或用途：" + entry.name);
  }
  const names = new Set();
  for (const entry of catalog.specialized ?? []) {
    if (!entry.name?.trim() || names.has(entry.name)) errors.push("专项组件必须唯一命名：" + entry.name);
    names.add(entry.name);
    const retained = entry.adoption === "native-compatible" && Array.isArray(entry.packages) && entry.packages.length > 0
      && entry.packages.every(name => typeof name === "string" && /^(?:@[a-z0-9._-]+\/)?[a-z0-9._-]+$/.test(name));
    const sourcePattern = retained ? /^src\/[^\\]+\.(?:ts|tsx)$/ : /^src\/(?:shared\/)?components\/[^\\]+\.(?:ts|tsx)$/;
    if (!entry.selection?.trim() || !sourcePattern.test(entry.source ?? "")
      || entry.source.split("/").some(part => part === ".." || part === ".")) errors.push("专项组件选型缺少共享源码或用途：" + entry.name);
  }
  return errors;
}
