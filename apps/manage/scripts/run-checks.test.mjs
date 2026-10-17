import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import {
  changedPaths,
  matchesInput,
  parseArguments,
  parseNameStatus,
  selectAffectedChecks,
  selectChecks,
  stagedPaths,
} from "./run-checks.mjs";

const checks = [
  { id: "design", tier: "fast", phase: "static", inputs: ["docs/规范/", "apps/manage/src/"], dependsOn: [] },
  { id: "types", tier: "fast", phase: "static", inputs: ["apps/manage/src/"], dependsOn: [] },
  { id: "build", tier: "complete", phase: "build", inputs: ["apps/manage/src/"], dependsOn: ["types"] },
  { id: "ui", tier: "complete", phase: "ui", inputs: ["apps/manage/src/pages/", "apps/manage/tests/ui/"], dependsOn: ["build"] },
];

test("路径输入只匹配精确文件或显式目录前缀", () => {
  assert.equal(matchesInput("apps/manage/src/pages/A.tsx", ["apps/manage/src/"]), true);
  assert.equal(matchesInput("apps/manage/src-old/A.tsx", ["apps/manage/src/"]), false);
  assert.equal(matchesInput("apps/manage/package.json.bak", ["apps/manage/package.json"]), false);
});

test("affected 只运行命中门禁并补齐其架构依赖", () => {
  assert.deepEqual(
    selectAffectedChecks(checks, ["apps/manage/src/pages/A.tsx"]).map(({ id }) => id),
    ["design", "types", "build", "ui"],
  );
  assert.deepEqual(
    selectAffectedChecks(checks, ["docs/规范/前端.md"]).map(({ id }) => id),
    ["design"],
  );
});

test("门禁基础设施变化失败安全地升级为全量", () => {
  assert.deepEqual(
    selectAffectedChecks(checks, ["apps/manage/package.json"], ["apps/manage/package.json"]).map(({ id }) => id),
    checks.map(({ id }) => id),
  );
});

test("共享编排基础设施与单门禁实现保持不同影响范围", () => {
  const scopedChecks = [
    { id: "design", tier: "fast", inputs: ["apps/manage/scripts/design-governance.mjs"], dependsOn: [] },
    { id: "i18n", tier: "fast", inputs: ["apps/manage/scripts/i18n-governance.mjs"], dependsOn: [] },
    { id: "types", tier: "fast", inputs: ["apps/manage/tsconfig.json"], dependsOn: [] },
  ];
  assert.deepEqual(
    selectChecks(scopedChecks, {
      affected: true,
      changedPaths: ["apps/manage/scripts/run-checks.mjs"],
      infrastructurePaths: ["apps/manage/scripts/run-checks.mjs"],
    }).map(({ id }) => id),
    ["design", "i18n", "types"],
  );
  assert.deepEqual(
    selectChecks(scopedChecks, {
      affected: true,
      changedPaths: ["apps/manage/scripts/i18n-governance.mjs"],
      infrastructurePaths: ["apps/manage/scripts/run-checks.mjs"],
    }).map(({ id }) => id),
    ["i18n"],
  );
});

for (const [status, expected] of [
  ["M\0apps/manage/src/current.ts\0", ["apps/manage/src/current.ts"]],
  ["R100\0apps/manage/src/old.ts\0apps/manage/src/new.ts\0", ["apps/manage/src/old.ts", "apps/manage/src/new.ts"]],
  ["C075\0apps/manage/src/source.ts\0apps/manage/src/copy.ts\0", ["apps/manage/src/source.ts", "apps/manage/src/copy.ts"]],
]) {
  test(`name-status ${status[0]} 保留所有相关路径`, () => {
    assert.deepEqual(parseNameStatus(status), expected);
  });
}

test("affected 与 staged 都把 rename 两侧纳入门禁选择", () => {
  const rename = "R100\0docs/规范/前端.md\0apps/manage/src/renamed.ts\0";
  const runAffectedGit = (args) => {
    if (args[0] === "merge-base") return "base\n";
    if (args.includes("base...HEAD")) return rename;
    return "";
  };
  const runStagedGit = (args) => args.includes("--cached") ? rename : "";
  assert.deepEqual(changedPaths(runAffectedGit, "origin/main"), ["docs/规范/前端.md", "apps/manage/src/renamed.ts"]);
  assert.deepEqual(stagedPaths(runStagedGit), ["docs/规范/前端.md", "apps/manage/src/renamed.ts"]);
});

test("真实 diff 命令启用未修改来源的 copy 检测", () => {
  const calls = [];
  const runGit = (args) => {
    calls.push(args);
    if (args[0] === "merge-base") return "base\n";
    if (args.includes("base...HEAD") && args.includes("--find-copies-harder")) {
      return "C100\0docs/规范/前端.md\0outside/copied.md\0";
    }
    return "";
  };
  assert.deepEqual(changedPaths(runGit, "origin/main"), ["docs/规范/前端.md", "outside/copied.md"]);
  assert.ok(calls.some((args) => args.includes("--find-copies-harder")));
});

test("affected 调用方可先限定 fast，源码变化不选择完整构建与 UI", () => {
  assert.deepEqual(
    selectChecks(checks, { affected: true, changedPaths: ["apps/manage/src/pages/A.tsx"] }).map(({ id }) => id),
    ["design", "types"],
  );
  assert.deepEqual(
    selectChecks(checks, {
      affected: true,
      changedPaths: ["apps/manage/package.json"],
      infrastructurePaths: ["apps/manage/package.json"],
    }).map(({ id }) => id),
    ["design", "types"],
  );
});

test("staged 与 affected 共用 fast 选择器，但命令模式互斥", () => {
  assert.deepEqual(parseArguments(["--staged"]), { affected: false, staged: true, phase: undefined });
  assert.deepEqual(parseArguments(["--affected", "--phase", "static"]), { affected: true, staged: false, phase: "static" });
  assert.throws(() => parseArguments(["--affected", "--staged"]), /不能同时/);
  assert.throws(() => parseArguments(["--phase", "unknown"]), /未知 phase/);
  assert.deepEqual(
    selectChecks(checks, { staged: true, changedPaths: ["docs/规范/前端.md"] }).map(({ id }) => id),
    ["design"],
  );
});

test("CI 根据可靠路径选择完整阶段，文档不触发构建，浏览器验收永不进 CI", () => {
  const ciChecks = checks.filter(({ phase }) => phase !== "ui");
  assert.deepEqual(selectChecks(checks, { ci: true, changedPaths: ["apps/manage/src/pages/A.tsx"] }).map(({ id }) => id),
    ["design", "types", "build"]);
  assert.deepEqual(selectChecks(checks, { ci: true, changedPaths: ["apps/manage/tests/ui/x.spec.ts"] }).map(({ id }) => id), []);
  assert.deepEqual(selectChecks(checks, { ci: true, changedPaths: ["docs/规范/前端.md"] }).map(({ id }) => id), ["design"]);
  assert.deepEqual(selectChecks(checks, { ci: true, changedPaths: [] }), ciChecks);
  assert.deepEqual(selectChecks(checks, { ci: true, changedPaths: ["apps/manage/unknown.runtime"] }), ciChecks);
  assert.deepEqual(selectChecks(checks, { ci: true, changedPaths: ["apps/manage/package.json"], infrastructurePaths: ["apps/manage/package.json"] }), ciChecks);
});

test("CI 工作流变化不重复启动业务门禁，混合变化仍验证业务", () => {
  const ciChecks = checks.filter(({ phase }) => phase !== "ui");
  assert.deepEqual(selectChecks(checks, { ci: true, changedPaths: [".github/workflows/frontend-lint.yml"] }), []);
  assert.deepEqual(selectChecks(checks, { ci: true, changedPaths: [".github/workflows/frontend-lint.yml", "apps/manage/src/pages/A.tsx"], infrastructurePaths: [".github/workflows/frontend-lint.yml"] }), ciChecks);
});

test("ESLint 的宽泛目录输入不能把未知运行配置和公共资源降成只做静态", () => {
  const broad = [...checks, { id: "eslint", tier: "fast", phase: "static", inputs: ["apps/manage/"], dependsOn: [] }];
  const broadCi = broad.filter(({ phase }) => phase !== "ui");
  for (const changed of ["apps/manage/new-runtime.config", "apps/manage/public/image.svg"]) {
    assert.deepEqual(selectChecks(broad, { ci: true, changedPaths: [changed] }), broadCi);
  }
});

test("真实排序检查器和回归变化必须运行真实源码设计门禁", () => {
  const manifest = JSON.parse(readFileSync(new URL("../../../docs/规范/manifest.json", import.meta.url), "utf8"));
  for (const path of ["apps/manage/scripts/table-ordering-governance.mjs", "apps/manage/scripts/table-ordering.unit.test.mjs"]) {
    const affected = selectChecks(manifest.checks, { affected: true, changedPaths: [path], infrastructurePaths: manifest.infrastructureInputs });
    assert.ok(affected.some(({ id }) => id === "design"), path);
  }
});
