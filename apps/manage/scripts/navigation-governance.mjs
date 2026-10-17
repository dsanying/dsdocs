import ts from "typescript";
const normalized = (route) => "/" + route.replace(/^\/+|\/+$/g, "");
export function isBusinessRoute(route, filename, contracts = []) {
  return contracts.some((entry) => normalized(entry.path) === normalized(route)
    && filename.replaceAll("\\", "/").endsWith("/" + entry.definition));
}
/** 非 CRUD 的深链和业务作用域必须有实际路由定义与持续维护的契约证据。 */
export function inspectBusinessRoutes(contracts, { exists, read }) {
  if (!Array.isArray(contracts)) return ["业务路由登记必须是数组"];
  const errors = [], registered = new Set();
  for (const entry of contracts) {
    if (typeof entry?.path !== "string" || !entry.path.includes(":") || /\/detail\//.test(entry.path)) {
      errors.push("业务路由登记仅用于非实体的参数化 workflow/scope 路由"); continue;
    }
    if (!["workflow", "scope"].includes(entry.kind) || typeof entry.reason !== "string" || !entry.reason.trim()) errors.push("业务路由须明确 kind 和业务原因：" + entry.path);
    const key = normalized(entry.path) + "|" + entry.definition;
    if (registered.has(key)) errors.push("业务路由重复登记：" + entry.path);
    registered.add(key);
    if (typeof entry.definition !== "string" || !/^src\/[\w./-]+\.(?:tsx?|jsx?)$/.test(entry.definition) || entry.definition.includes("..") || !exists(entry.definition)) {
      errors.push("业务路由定义文件不存在或非法：" + entry.path); continue;
    }
    if (typeof entry.contract !== "string" || !/^docs\/[\w\u0080-\uffff/ .-]+\.md$/.test(entry.contract) || entry.contract.includes("..") || !exists(entry.contract)) {
      errors.push("业务路由契约文档不存在或非法：" + entry.path); continue;
    }
    if (!read(entry.contract).includes(normalized(entry.path))) errors.push("业务契约没有声明确切路径：" + entry.path);
    const source = ts.createSourceFile(entry.definition, read(entry.definition), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    let found = false;
    function visit(node) {
      if (ts.isPropertyAssignment(node) && node.name.getText(source) === "path" && ts.isStringLiteralLike(node.initializer) && normalized(node.initializer.text) === normalized(entry.path)) found = true;
      ts.forEachChild(node, visit);
    }
    visit(source);
    if (!found) errors.push("业务路由未在登记文件实际定义：" + entry.path);
  }
  return errors;
}
