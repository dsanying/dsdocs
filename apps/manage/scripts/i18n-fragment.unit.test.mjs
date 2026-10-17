import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import ts from "typescript";

// 执行真实函数声明；替换初始化环境以检验片段与外层 factory 使用同一个固定 translator。
const source = readFileSync(new URL("../src/i18n/index.ts", import.meta.url), "utf8");
const ast = ts.createSourceFile("index.ts", source, ts.ScriptTarget.Latest, true);
const declaration = ast.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === "tFragment");
assert.ok(declaration, "tFragment 真实实现不存在");
const code = ts.transpileModule(declaration.getText(ast), { compilerOptions: { module:ts.ModuleKind.CommonJS, target:ts.ScriptTarget.ES2022 } }).outputText;
const globalCalls = [];
const i18n = { t:(key, options) => { globalCalls.push({ key, options }); return `global:${key}`; } };
const module = { exports:{} };
new Function("exports", "i18n", code)(module.exports, i18n);
const { tFragment } = module.exports;

test("传入固定语言 translator 后不读取全局语言，参数和片段排版选项保留", () => {
  const calls = [];
  const fixedT = (key, options) => { calls.push({ key, options }); return `fixed:${key}`; };
  const before = globalCalls.length;
  const options = { count:2, interpolation:{ escapeValue:false }, applyPostProcessor:true };
  assert.equal(tFragment("example.suffix", options, fixedT), "fixed:example.suffix");
  assert.equal(globalCalls.length, before);
  assert.deepEqual(calls, [{ key:"example.suffix", options:{ ...options, applyPostProcessor:false } }]);
  assert.equal(options.applyPostProcessor, true);
});

test("无显式 translator 的原有调用保留默认 i18n 和片段排版行为", () => {
  assert.equal(tFragment("example.suffix"), "global:example.suffix");
  assert.deepEqual(globalCalls.at(-1), { key:"example.suffix", options:{ applyPostProcessor:false } });
});
