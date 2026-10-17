import assert from "node:assert/strict";
import test from "node:test";

import { classifyDependencyBuilds, parseAllowBuilds } from "./check-ignored-builds.mjs";

test("allowBuilds 只解析 pnpm 官方两级映射", () => {
  const parsed = parseAllowBuilds("packages:\n  - .\nallowBuilds:\n  esbuild: true\n  # 注释\n  less: false\nother: 1\n");
  assert.deepEqual([...parsed.entries()], [["esbuild", true], ["less", false]]);
  assert.equal(parseAllowBuilds("").size, 0);
});

test("依赖构建脚本必须全部显式审计且登记不得残留", () => {
  const allowBuilds = new Map([["esbuild", true], ["less", false]]);
  assert.deepEqual(classifyDependencyBuilds({
    allowBuilds,
    packages: new Map([["esbuild", ["postinstall"]], ["less", ["postinstall"]]]),
  }), []);

  assert.deepEqual(classifyDependencyBuilds({ allowBuilds: new Map(), packages: new Map() }), []);

  const unclassified = classifyDependencyBuilds({
    allowBuilds,
    packages: new Map([["esbuild", ["postinstall"]], ["less", ["postinstall"]], ["unrs-resolver", ["preinstall", "postinstall"]]]),
  });
  assert.equal(unclassified.length, 1);
  assert.match(unclassified[0], /unrs-resolver.*未审计/);

  const stale = classifyDependencyBuilds({
    allowBuilds,
    packages: new Map([["esbuild", ["postinstall"]]]),
  });
  assert.equal(stale.length, 1);
  assert.match(stale[0], /less.*残留/);
});

test("既有四空格合法同层映射保留真实审批，不吞下一根字段", () => {
  assert.deepEqual([...parseAllowBuilds("allowBuilds:\n    es5-ext: true\n    other-build: false\noverrides:\n  ignored: true\n")], [["es5-ext",true],["other-build",false]]);
});
