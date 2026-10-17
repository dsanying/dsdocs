import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";
const frontend = fileURLToPath(new URL("../", import.meta.url));
const catalog = JSON.parse(readFileSync(new URL("./component-selection.json", import.meta.url), "utf8"));
import { publicExports, inspectComponentCatalog } from "./component-catalog.mjs";
const errors = inspectComponentCatalog(publicExports(readFileSync(path.join(frontend,catalog.publicIndex),"utf8")),catalog);
for (const entry of [...catalog.exports,...catalog.specialized]) if (!existsSync(path.join(frontend,entry.source))) errors.push("组件源码不存在：" + entry.source);
function walk(root) {
  return readdirSync(root,{withFileTypes:true}).flatMap((e)=> e.isDirectory()?walk(path.join(root,e.name)): /\.(?:tsx?|jsx?)$/.test(e.name)?[path.join(root,e.name)]:[]);
}
const usage = new Map();
let scanned = 0;
for (const file of walk(path.join(frontend,"src"))) {
  scanned++;
  const source = ts.createSourceFile(file,readFileSync(file,"utf8"),ts.ScriptTarget.Latest,true,file.endsWith("tsx")?ts.ScriptKind.TSX:ts.ScriptKind.TS);
  for (const statement of source.statements.filter(ts.isImportDeclaration)) {
    const module = statement.moduleSpecifier.text;
    if (!/(?:^@\/components\/ui$|^.*\/components\/ui$)/.test(module) || !statement.importClause?.namedBindings || !ts.isNamedImports(statement.importClause.namedBindings)) continue;
    for (const entry of statement.importClause.namedBindings.elements) {
      const name = entry.propertyName?.text ?? entry.name.text;
      const consumer = path.relative(frontend,file).replaceAll("\\","/");
      const paths = usage.get(name) ?? new Set(); paths.add(consumer); usage.set(name,paths);
    }
  }
}
const report = { publicExports:catalog.exports.length, runtimeEntrypoints:catalog.exports.filter((e)=>e.kind==="value").length, specialized:catalog.specialized.length, scanned, usage:[...usage].sort(([a],[b])=>a.localeCompare(b)).map(([name,files])=>({name,files:[...files].sort()})), errors };
if (process.argv.includes("--check")) {
  if (errors.length) console.error(errors.join("\n"));
  else console.log("组件目录与真实公共 API 一致：" + report.publicExports + " 导出，" + report.scanned + " 源文件");
} else console.log(JSON.stringify(report,null,2));
if (errors.length) process.exitCode=1;
