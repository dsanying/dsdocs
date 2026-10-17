import assert from "node:assert/strict";
import test from "node:test";
import { normalizeComputedColor } from "../src/design/tokens.ts";

// 品牌派生色是 color-mix 表达式，浏览器在探针元素上算出 color(srgb …) 或 rgb()；ECharts、Monaco 只认十六进制/rgba，
// 未归一时“当前节点”等用主色填充的图形会画成透明。
test("计算颜色归一为十六进制，带透明度时为 rgba", () => {
  assert.equal(normalizeComputedColor("color(srgb 0.8 0.8 0.8)"), "#cccccc");
  assert.equal(normalizeComputedColor("color(srgb 0 0 0)"), "#000000");
  assert.equal(normalizeComputedColor("rgb(36, 91, 219)"), "#245bdb");
  assert.equal(normalizeComputedColor("rgb(36 91 219)"), "#245bdb");
  assert.equal(normalizeComputedColor("rgba(0, 0, 0, 0.5)"), "rgba(0, 0, 0, 0.5)");
  assert.equal(normalizeComputedColor("color(srgb 1 0 0 / 0.25)"), "rgba(255, 0, 0, 0.25)");
  assert.equal(normalizeComputedColor("oklch(0.7 0.1 200)"), undefined);
});
