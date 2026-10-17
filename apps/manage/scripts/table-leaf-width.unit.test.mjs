import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import ts from "typescript";

// 运行生产纯函数 AST，隔离浏览器量字/i18n 依赖，防止测试自己重新实现列宽算法。
const text = readFileSync(new URL("../src/components/ui/tableConfig.ts", import.meta.url), "utf8");
const source = ts.createSourceFile("tableConfig.ts", text, ts.ScriptTarget.Latest, true);
const names = new Set(["columnPixelWidth", "columnsTotalWidth", "proportionalColumns", "tableScroll"]);
const functions = source.statements.filter(node => ts.isFunctionDeclaration(node) && names.has(node.name?.text));
assert.equal(functions.length, names.size);
const code = ts.transpileModule(`const FLEX_COLUMN_MIN_WIDTH = 200;\n${functions.map(node => node.getText(source)).join("\n")}`, { compilerOptions: { target: ts.ScriptTarget.ESNext, module: ts.ModuleKind.ESNext } }).outputText;
const { columnsTotalWidth, proportionalColumns, tableScroll } = await import(`data:text/javascript;base64,${Buffer.from(code).toString("base64")}`);

test("分组宽度仅由全部叶列贡献，组宽度不重复加入", () => {
  const columns = [{ title: "组", width: 9999, children: [{ width: 200 }, { children: [{ width: 120 }, { flexMinWidth: 240 }] }] }, { width: 40 }];
  assert.equal(columnsTotalWidth(columns), 600);
  const actual = proportionalColumns(columns);
  assert.equal(actual[0].width, undefined);
  assert.equal(actual[0].children[1].width, undefined);
  assert.equal(actual[0].children[0].width, `${200 / 600 * 100}%`);
  assert.equal(actual[0].children[1].children[0].width, "20%");
  assert.equal(actual[0].children[1].children[1].width, "40%");
  assert.equal(actual[1].width, `${40 / 600 * 100}%`);
  assert.equal(columns[0].width, 9999);
  assert.equal(columns[0].children[0].width, 200);
});

test("无分组时默认主列和辅助叶列预算保持不变", () => {
  assert.equal(columnsTotalWidth([{ width: 40 }, {}, { width: 120 }]), 360);
  assert.equal(columnsTotalWidth(undefined), 0);
  assert.equal(proportionalColumns(undefined), undefined);
});


test("递归叶预算保留迁移包选择/展开辅助列占用", () => {
  const columns = [{ children: [{ width: 200 }, { width: 120 }, { flexMinWidth: 240 }] }, { width: 40 }];
  assert.deepEqual(tableScroll(columns, 180, 80), { x: 680, y: 180 });
  assert.equal(proportionalColumns(columns, 80)[0].children[0].width, `${200 / 680 * 100}%`);
  assert.equal(proportionalColumns(columns, 80)[0].width, undefined);
  assert.deepEqual(tableScroll(columns), { x: 600 });
});

test("删除辅助预算的生产函数反例必须失败", async () => {
  // 只删除当前生产函数的辅助预算相加，重现被覆盖的迁移适配；同一不变量应拒绝。
  const broken = code.replaceAll(" + auxiliaryWidth", "");
  assert.notEqual(broken, code);
  const mutant = await import(`data:text/javascript;base64,${Buffer.from(broken).toString("base64")}`);
  assert.throws(() => assert.deepEqual(mutant.tableScroll([{ children: [{ width: 200 }, { width: 120 }] }], 180, 80), { x: 400, y: 180 }));
  assert.throws(() => assert.equal(mutant.proportionalColumns([{ children: [{ width: 200 }, { width: 120 }] }], 80)[0].children[0].width, "50%"));
});
