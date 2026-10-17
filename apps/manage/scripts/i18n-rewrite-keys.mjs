import ts from "typescript";

/** 精确改写字面键，单/双引号与无插值模板同等处理；不碰注释、子串和动态模板。 */
export function rewriteLiteralKeys(source, rename, filename = "source.tsx") {
  const kind = filename.endsWith(".json") ? ts.ScriptKind.JSON : filename.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
  const ast = ts.createSourceFile(filename, source, ts.ScriptTarget.Latest, true, kind);
  const replacements = [];
  function visit(node) {
    if (ts.isStringLiteralLike(node) && rename.has(node.text)) {
      const replacement = rename.get(node.text);
      if (!/^[a-zA-Z0-9_.-]+$/.test(replacement)) throw new Error("翻译键必须为静态语义路径：" + replacement);
      const quote = source[node.getStart(ast)];
      replacements.push({ start: node.getStart(ast), end: node.getEnd(), text: quote + replacement + quote });
    }
    ts.forEachChild(node, visit);
  }
  visit(ast);
  for (const edit of replacements.reverse()) source = source.slice(0, edit.start) + edit.text + source.slice(edit.end);
  return source;
}
