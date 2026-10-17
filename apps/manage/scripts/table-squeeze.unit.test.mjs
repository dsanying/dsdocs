import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import ts from "typescript";

// 运行生产纯函数 AST，隔离浏览器量字/i18n 依赖，防止测试自己重新实现收紧算法。
const text = readFileSync(new URL("../src/components/ui/tableConfig.ts", import.meta.url), "utf8");
const source = ts.createSourceFile("tableConfig.ts", text, ts.ScriptTarget.Latest, true);
const names = new Set(["contentFitWidth", "squeezedFitWidth", "actionIconOnlyWidth"]);
const functions = source.statements.filter(node => ts.isFunctionDeclaration(node) && names.has(node.name?.text));
assert.equal(functions.length, names.size);
const code = ts.transpileModule(`const HEADER_CELL_CHROME = 32; const WIDTH_STEP = 20; const SHORT_CONTENT_MAX_WIDTH = 320;\n${functions.map(node => node.getText(source)).join("\n")}\nexport { squeezedFitWidth, actionIconOnlyWidth };`, { compilerOptions: { target: ts.ScriptTarget.ESNext, module: ts.ModuleKind.ESNext } }).outputText;
const { squeezedFitWidth, actionIconOnlyWidth } = await import(`data:text/javascript;base64,${Buffer.from(code).toString("base64")}`);

test("少数长值收回声明宽度，短值仍完整展示", () => {
  assert.equal(squeezedFitWidth([150, 900], 60, 240), 240);
  assert.equal(squeezedFitWidth([250, 900], 60, 240), 300);
});

test("全部为短内容时不改变常规适配宽度", () => {
  assert.equal(squeezedFitWidth([100, 120], 60, 240), 160);
  assert.equal(squeezedFitWidth([260], 60, 240), 300);
});

test("标题宽度是下限；全为长值时保持声明宽度", () => {
  assert.equal(squeezedFitWidth([20], 140, 240), 140);
  assert.equal(squeezedFitWidth([900, 1000], 60, 420), 420);
});

test("操作列仅图标宽度按动作数计算并取整到列宽步长", () => {
  assert.equal(actionIconOnlyWidth(1), 80);
  assert.equal(actionIconOnlyWidth(2), 120);
  assert.equal(actionIconOnlyWidth(3), 160);
});
