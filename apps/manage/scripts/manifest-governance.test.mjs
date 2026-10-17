import assert from "node:assert/strict";
import test from "node:test";
import { inspectManifest } from "./manifest-governance.mjs";

const files = new Set([
  "docs/规范/前端.md",
  "docs/规范/manifest.json",
  "theme.ts",
  "theme.test.mjs",
  "package.json",
  "pnpm-lock.yaml",
  "pnpm-workspace.yaml",
  "run-checks.mjs",
  "run-checks.test.mjs",
  "manifest-governance.mjs",
  "manifest-governance.test.mjs",
  "report.test.mjs",
  "hooks/pre-commit",
  ".github/workflows/frontend-lint.yml",
  ".github/workflows/frontend-build.yml",
]);
const context = {
  exists: (path) => files.has(path),
  read: (path) => {
    if (path === "hooks/pre-commit") return "pnpm run check:staged";
    if (path === ".github/workflows/frontend-lint.yml") return [
      "pnpm run check",
      ...[...files].flatMap((target) => [`- '${target}'`, `- '${target}'`]),
    ].join("\n");
    return "# 规范\n## FRONTEND-THEME：主题";
  },
  packageScripts: {
    "lint:design": "test",
    check: "node run-checks.mjs",
    "check:affected": "node run-checks.mjs --affected",
    "check:staged": "node run-checks.mjs --staged",
  },
};
function validManifest() {
  return {
    version: 1,
    chapters: [{ path: "docs/规范/前端.md", link: "规范/前端.md", title: "前端规范" }],
    gateOrchestration: {
      manifest: "docs/规范/manifest.json",
      packageManifest: "package.json",
      lockfile: "pnpm-lock.yaml",
      packageManagerPolicy: "pnpm-workspace.yaml",
      runner: "run-checks.mjs",
      runnerTests: "run-checks.test.mjs",
      manifestValidator: "manifest-governance.mjs",
      manifestValidatorTests: "manifest-governance.test.mjs",
      preCommitHook: "hooks/pre-commit",
      ciWorkflow: ".github/workflows/frontend-lint.yml",
      buildWorkflow: ".github/workflows/frontend-build.yml",
      commands: { complete: "check", affected: "check:affected", staged: "check:staged" },
      sharedInputs: [
        "docs/规范/manifest.json",
        "package.json",
        "pnpm-lock.yaml",
        "pnpm-workspace.yaml",
        "run-checks.mjs",
        "run-checks.test.mjs",
        "manifest-governance.mjs",
        "manifest-governance.test.mjs",
        "hooks/pre-commit",
        ".github/workflows/frontend-lint.yml",
        ".github/workflows/frontend-build.yml",
      ],
    },
    checks: [{
      id: "design",
      domain: "design-system",
      phase: "static",
      tier: "fast",
      script: "lint:design",
      inputs: ["theme.ts"],
      tests: ["theme.test.mjs"],
      rules: ["FRONTEND-THEME"],
      dependsOn: [],
    }],
    reports: [],
    rules: [{ id: "FRONTEND-THEME", document: "docs/规范/前端.md", implementation: ["theme.ts"], validation: ["theme.test.mjs"] }],
  };
}

test("有效规则清单通过", () => assert.deepEqual(inspectManifest(validManifest(), context), []));

test("本地提交钩子是可选接线：未登记时不要求存在", () => {
  const manifest = validManifest();
  delete manifest.gateOrchestration.preCommitHook;
  manifest.gateOrchestration.sharedInputs = manifest.gateOrchestration.sharedInputs.filter((target) => target !== "hooks/pre-commit");
  const withoutHook = { ...context, exists: (path) => path !== "hooks/pre-commit" && context.exists(path) };
  assert.deepEqual(inspectManifest(manifest, withoutHook), []);
});

test("门禁脚本引用的规则 ID 必须已登记", () => {
  const withKnownRule = inspectManifest(validManifest(), { ...context, scripts: { "check-design.mjs": 'report(node, "FRONTEND-THEME", "ok");' } });
  assert.deepEqual(withKnownRule, []);
  const unknownRuleScript = 'report(node, "FRONTEND-' + 'OVERFLOW", "bad");';
  const withUnknownRule = inspectManifest(validManifest(), { ...context, scripts: { "check-design.mjs": unknownRuleScript } });
  assert.ok(withUnknownRule.some((error) => error.includes("门禁脚本引用未登记规范规则")));
});
test("有效规则清单通过", () => assert.deepEqual(inspectManifest(validManifest(), context), []));

test("共享编排路径、入口与调用方形成闭包", () => {
  for (const field of ["packageManagerPolicy", "runnerTests", "manifestValidator", "manifestValidatorTests", "preCommitHook", "ciWorkflow", "buildWorkflow"]) {
    const manifest = validManifest();
    manifest.gateOrchestration.sharedInputs = manifest.gateOrchestration.sharedInputs
      .filter((target) => target !== manifest.gateOrchestration[field]);
    assert.ok(inspectManifest(manifest, context).some((error) => error.includes("输入闭包缺失")), field);
  }

  for (const mode of ["complete", "affected", "staged"]) {
    const manifest = validManifest();
    manifest.gateOrchestration.commands[mode] = `missing:${mode}`;
    assert.ok(inspectManifest(manifest, context).some((error) => error.includes("统一门禁入口未定义")), mode);
  }

  const overbroad = validManifest();
  overbroad.gateOrchestration.sharedInputs.push("theme.ts");
  assert.ok(inspectManifest(overbroad, context).some((error) => error.includes("未归属编排字段")));
});

test("runner、pre-commit 与 CI 必须使用清单登记入口", () => {
  const wrongRunner = { ...context, packageScripts: { ...context.packageScripts, check: "other" } };
  assert.ok(inspectManifest(validManifest(), wrongRunner).some((error) => error.includes("未指向登记 runner")));

  const wrongHook = { ...context, read: (path) => path === "hooks/pre-commit" ? "pnpm run check" : context.read(path) };
  assert.ok(inspectManifest(validManifest(), wrongHook).some((error) => error.includes("pre-commit 未调用")));

  const wrongCI = { ...context, read: (path) => path === ".github/workflows/frontend-lint.yml" ? "pnpm lint" : context.read(path) };
  assert.ok(inspectManifest(validManifest(), wrongCI).some((error) => error.includes("CI 未调用")));

  const missingCIPath = {
    ...context,
    read: (path) => path === ".github/workflows/frontend-lint.yml"
      ? context.read(path).replaceAll("- 'hooks/pre-commit'\n", "")
      : context.read(path),
  };
  assert.ok(inspectManifest(validManifest(), missingCIPath).some((error) => error.includes("增量过滤未共同覆盖") && error.includes("hooks/pre-commit")));
});

test("拒绝重复规则、未知章节和不存在路径", () => {
  const manifest = validManifest();
  manifest.chapters[0].link = "";
  manifest.rules.push({ ...manifest.rules[0], implementation: ["missing.ts"] });
  manifest.rules[0].document = "docs/规范/missing.md";
  const errors = inspectManifest(manifest, context);
  assert.ok(errors.some((error) => error.includes("重复")));
  assert.ok(errors.some((error) => error.includes("元数据不完整")));
  assert.ok(errors.some((error) => error.includes("已登记章节")));
  assert.ok(errors.some((error) => error.includes("不存在")));
});

test("拒绝孤儿门禁、重复命令、无专项测试和未知规则", () => {
  const manifest = validManifest();
  manifest.checks.push({
    ...manifest.checks[0],
    id: "ui",
    tests: [],
    rules: ["FRONTEND-" + "UNKNOWN"],
    dependsOn: ["missing"],
  });
  const errors = inspectManifest(manifest, context);
  assert.ok(errors.some((error) => error.includes("命令重复登记")));
  assert.ok(errors.some((error) => error.includes("缺少 tests")));
  assert.ok(errors.some((error) => error.includes("未知规范规则")));
  assert.ok(errors.some((error) => error.includes("依赖不存在")));
});

test("开发报告必须非阻断、有测试并登记命令", () => {
  const manifest = validManifest();
  manifest.reports.push({
    id: "structure",
    domain: "architecture",
    script: "report:structure",
    inputs: ["theme.ts"],
    tests: ["report.test.mjs"],
    rules: ["FRONTEND-THEME"],
    signals: ["file-scale"],
    nonBlocking: false,
  });
  const errors = inspectManifest(manifest, {
    ...context,
    packageScripts: { ...context.packageScripts, "report:structure": "report" },
  });
  assert.ok(errors.some((error) => error.includes("显式 nonBlocking")));

  const orphanErrors = inspectManifest(validManifest(), {
    ...context,
    packageScripts: { ...context.packageScripts, "report:orphan": "report" },
  });
  assert.ok(orphanErrors.some((error) => error.includes("开发报告命令未登记：report:orphan")));
});

test("规范章节与规则清单必须双向对应", () => {
  const missingRegistration = validManifest();
  const contextWithExtraHeading = {
    ...context,
    read: () => "# 规范\n## FRONTEND-THEME：主题\n## FRONTEND-LAYOUT：布局",
  };
  assert.ok(
    inspectManifest(missingRegistration, contextWithExtraHeading).some((error) =>
      error.includes("未登记规则：FRONTEND-LAYOUT"),
    ),
  );

  const missingHeading = validManifest();
  missingHeading.rules[0].id = "FRONTEND-LAYOUT";
  assert.ok(
    inspectManifest(missingHeading, context).some((error) =>
      error.includes("不存在对应规范章节：FRONTEND-LAYOUT"),
    ),
  );
});

function localManifest() {
  const manifest = validManifest();
  const gate = manifest.gateOrchestration;
  gate.automation = { mode: "local", reason: "仓库维护规范明确采用本地验收", validation: ["run-checks.test.mjs"] };
  delete gate.ciWorkflow; delete gate.buildWorkflow;
  gate.sharedInputs = gate.sharedInputs.filter((target) => !target.startsWith(".github/"));
  return manifest;
}
test("本地门禁登记真实原因和验证文件，通过完整入口与输入闭包", () => {
  const withoutCI = { ...context, exists: (target) => !target.startsWith(".github/") && context.exists(target) };
  assert.deepEqual(inspectManifest(localManifest(), withoutCI), []);
});
test("本地门禁不能借模式声明隐藏缺失验证或混入虚构 CI", () => {
  for (const mutate of [
    (gate) => { gate.automation.reason = ""; },
    (gate) => { gate.automation.validation = []; },
    (gate) => { gate.automation.validation = ["missing.test.mjs"]; },
    (gate) => { gate.automation.validation = ["theme.test.mjs"]; },
    (gate) => { gate.ciWorkflow = ".github/workflows/frontend-lint.yml"; },
    (gate) => { gate.automation.mode = "skip"; },
  ]) {
    const manifest = localManifest(); mutate(manifest.gateOrchestration);
    assert.ok(inspectManifest(manifest, context).length > 0);
  }
});
test("合并后端和环境规则，只有定义位置声明 ID，正文引用不会生成规则", () => {
  const manifest = validManifest();
  const content = "# 规范\n## FRONTEND-THEME：主题\n- \x60DATA-AUTHORITY\x60：后端权威\n### CLUSTER-OWNERSHIP: 环境归属\n正文引用 FRONTEND-UNREGISTERED，不是定义。";
  for (const id of ["DATA-AUTHORITY", "CLUSTER-OWNERSHIP"]) {
    manifest.rules.push({ ...manifest.rules[0], id });
    manifest.checks[0].rules.push(id);
  }
  const merged = { ...context, read: (target) => target === "docs/规范/前端.md" ? content : context.read(target) };
  assert.deepEqual(inspectManifest(manifest, merged), []);
  manifest.rules.pop();
  assert.ok(inspectManifest(manifest, merged).some((error) => error.includes("未登记规则：CLUSTER-OWNERSHIP")));
});



test("已有跨运行域编排器独立登记真实归属，并拒绝假命令与未闭合自检", () => {
  const manifest = validManifest();
  manifest.checks[0].rules = ["FRONTEND-THEME"];
  const id = "BACKEND-AUTH";
  manifest.rules.push({ id, document: "docs/规范/前端.md", implementation: ["theme.ts"], validation: ["theme.test.mjs"] });
  const ctx = { ...context, read: p => `${context.read(p)}\n## BACKEND-AUTH：身份契约` };
  manifest.externalChecks = [{ id: "repository-runtime", domain: "backend", runner: "run-checks.mjs", command: ["node", "run-checks.mjs"], inputs: ["run-checks.mjs", "run-checks.test.mjs"], tests: ["run-checks.test.mjs"], rules: [id] }];
  assert.deepEqual(inspectManifest(manifest, ctx), []);
  manifest.externalChecks[0].command = ["echo", "passed"];
  assert.ok(inspectManifest(manifest, ctx).some(e => e.includes("真实 runner")));
  manifest.externalChecks[0].command = ["node", "run-checks.mjs"];
  manifest.externalChecks[0].inputs = ["run-checks.mjs"];
  assert.ok(inspectManifest(manifest, ctx).some(e => e.includes("未覆盖自检")));
  manifest.externalChecks[0].runner = "missing.py";
  assert.ok(inspectManifest(manifest, ctx).some(e => e.includes("编排器不存在")));
});
