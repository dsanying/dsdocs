import assert from "node:assert/strict";
import test from "node:test";
import { analyzeSource, collectCandidates } from "./report-structure.mjs";

test("小型单一职责文件不进入候选", () => {
  assert.deepEqual(analyzeSource("export const sum = (a: number, b: number) => a + b;").signals, []);
});

test("高 Hook 密度只产生非阻断候选信号", () => {
  const hooks = Array.from({ length: 20 }, (_, index) => `const value${index} = useMemo(() => ${index}, []);`).join("\n");
  const result = analyzeSource(`import { useMemo } from "react";\n${hooks}\nexport function Example() { return <div />; }`, "Example.tsx");
  assert.match(result.signals[0], /^Hook 调用 20 次（每百行 /);
  assert.equal(collectCandidates([{ filename: "Example.tsx", source: hooks }]).length, 1);
});

test("报告只排序高信号候选，不把规模阈值转换为失败", () => {
  const large = Array.from({ length: 1000 }, () => "const value = 1;").join("\n");
  const candidates = collectCandidates([
    { filename: "small.ts", source: "export const value = 1;" },
    { filename: "large.ts", source: large },
  ]);
  assert.deepEqual(candidates.map(({ filename }) => filename), ["large.ts"]);
});
