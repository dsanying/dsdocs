import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import ts from "typescript";
import { fileURLToPath } from "node:url";

const sourceRoot = fileURLToPath(new URL("../src/", import.meta.url));
const MAX_DISPLAYED_CANDIDATES = 20;

export function analyzeSource(source, filename = "source.tsx") {
  const sourceFile = ts.createSourceFile(
    filename,
    source,
    ts.ScriptTarget.Latest,
    true,
    filename.endsWith("x") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
  let hooks = 0;
  let stateHooks = 0;
  let jsxNodes = 0;
  let transforms = 0;
  let serviceImports = 0;
  function visit(node) {
    if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)
      && /(?:^|\/)(?:services?|request)(?:\/|$)/.test(node.moduleSpecifier.text)) serviceImports += 1;
    if (ts.isJsxElement(node) || ts.isJsxSelfClosingElement(node)) jsxNodes += 1;
    if (ts.isCallExpression(node)) {
      if (ts.isIdentifier(node.expression) && /^use[A-Z]/.test(node.expression.text)) {
        hooks += 1;
        if (["useState", "useReducer"].includes(node.expression.text)) stateHooks += 1;
      }
      if (ts.isPropertyAccessExpression(node.expression)
        && ["map", "filter", "reduce", "sort"].includes(node.expression.name.text)) transforms += 1;
    }
    ts.forEachChild(node, visit);
  }
  visit(sourceFile);
  const lines = sourceFile.getLineAndCharacterOfPosition(sourceFile.end).line + 1;
  const responsibilities = [serviceImports > 0, stateHooks > 0, jsxNodes > 0, transforms > 2].filter(Boolean).length;
  const hookDensity = Number(((hooks / lines) * 100).toFixed(1));
  const signals = [];
  if (lines >= 1000) signals.push(`规模 ${lines} 行`);
  if (hooks >= 20) signals.push(`Hook 调用 ${hooks} 次（每百行 ${hookDensity}）`);
  if (lines >= 500 && responsibilities >= 3) signals.push(`${lines} 行内同时出现 ${responsibilities} 类职责信号`);
  return { filename, lines, hooks, hookDensity, responsibilities, signals };
}

function walk(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const target = path.join(directory, entry.name);
    return entry.isDirectory() ? walk(target) : [target];
  });
}

export function collectCandidates(files) {
  return files
    .map(({ filename, source }) => analyzeSource(source, filename))
    .filter(({ signals }) => signals.length > 0)
    .sort((left, right) => right.signals.length - left.signals.length || right.lines - left.lines);
}

function run() {
  const files = walk(sourceRoot)
    .filter((target) => /\.(?:ts|tsx)$/.test(target) && !target.endsWith(".d.ts"))
    .map((target) => ({ filename: path.relative(sourceRoot, target), source: readFileSync(target, "utf8") }));
  const candidates = collectCandidates(files);
  console.log("[report:structure] INFO 非阻断候选；需按职责、状态所有权和复用边界人工判断");
  if (candidates.length === 0) {
    console.log("[report:structure] INFO 未发现达到提示阈值的候选");
    return;
  }
  for (const candidate of candidates.slice(0, MAX_DISPLAYED_CANDIDATES)) {
    console.log(`[report:structure] CANDIDATE ${candidate.filename} — ${candidate.signals.join("；")}`);
  }
  const omitted = Math.max(0, candidates.length - MAX_DISPLAYED_CANDIDATES);
  console.log(`[report:structure] SUMMARY ${candidates.length} candidates${omitted ? `, ${omitted} omitted` : ""} (non-blocking)`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) run();
