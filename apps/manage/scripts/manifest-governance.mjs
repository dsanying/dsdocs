const RULE_ID = /^[A-Z][A-Z0-9]*(?:-[A-Z0-9]+)*$/;
const CHECK_ID = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;
const CHECK_PHASES = ["static", "build", "ui"];
const CHECK_TIERS = new Set(["fast", "complete"]);
const REQUIRED_GATE_SCRIPTS = /^(?:lint:(?:design|eslint|i18n|dependency-builds)|typecheck|test:unit|build:bundle|test:ui)$/;
const REPORT_SCRIPT = /^report:/;
const ORCHESTRATION_PATH_FIELDS = [
  "manifest",
  "packageManifest",
  "lockfile",
  "packageManagerPolicy",
  "runner",
  "runnerTests",
  "manifestValidator",
  "manifestValidatorTests",
];
// 可选接线按实际本地验证机制登记，登记后必须存在并纳入 sharedInputs。
const ORCHESTRATION_OPTIONAL_PATH_FIELDS = ["preCommitHook", "uiRunner", "uiRunnerTests"];
const CI_PATH_FIELDS = ["ciWorkflow", "buildWorkflow"];
const ORCHESTRATION_COMMAND_MODES = ["complete", "affected", "staged"];

function workflowPathPatterns(source) {
  return source.split("\n").map((line) => line.trim())
    .filter(Boolean)
    .map((line) => line.replace(/^-\s+/, "").trim().replace(/^['"]|['"]$/g, ""));
}

function workflowCoverageCount(source, target) {
  return workflowPathPatterns(source).filter((pattern) =>
    pattern === target || (pattern.endsWith("/**") && target.startsWith(pattern.slice(0, -2))) || (pattern.endsWith("/") && target.startsWith(pattern))).length;
}

export function inspectManifest(manifest, { exists, read, packageScripts = {}, scripts = {}, list }) {
  const errors = [];
  if (manifest?.version !== 1) errors.push("规则清单 version 必须为 1");
  if (!Array.isArray(manifest?.chapters) || manifest.chapters.length === 0) errors.push("规则清单缺少 chapters");
  if (!Array.isArray(manifest?.rules) || manifest.rules.length === 0) errors.push("规则清单缺少 rules");

  const chapters = new Set();
  const documentedRuleIDs = new Set();
  for (const chapter of manifest?.chapters ?? []) {
    if (!chapter?.path || chapters.has(chapter.path)) errors.push(`章节路径缺失或重复：${chapter?.path ?? "<空>"}`);
    else chapters.add(chapter.path);
    if (!chapter?.title || !chapter?.link) errors.push(`章节元数据不完整：${chapter?.path ?? "<空>"}`);
    if (chapter?.path && !exists(chapter.path)) errors.push(`章节不存在：${chapter.path}`);
    else if (chapter?.path) {
      const content = read(chapter.path);
      if (!content.trim()) errors.push(`章节为空：${chapter.path}`);
      // 章节标题与行首规则定义是声明；正文引用不是声明。兼容存量后端和环境规则。
      for (const match of content.matchAll(/^(?:#{2,6}\s+([A-Z][A-Z0-9]*(?:-[A-Z0-9]+)*)[：:]|[-*]\s+`([A-Z][A-Z0-9]*(?:-[A-Z0-9]+)*)`[：:])/gm)) {
        documentedRuleIDs.add(match[1] ?? match[2]);
      }
    }
  }

  const ruleIDs = new Set();
  for (const rule of manifest?.rules ?? []) {
    if (!rule?.id || ruleIDs.has(rule.id)) errors.push(`规则 ID 缺失或重复：${rule?.id ?? "<空>"}`);
    else ruleIDs.add(rule.id);
    if (rule?.id && (!RULE_ID.test(rule.id) || /-\d{3}$/.test(rule.id))) errors.push(`规则 ID 必须是稳定语义标识：${rule.id}`);
    if (!rule?.document || !chapters.has(rule.document)) errors.push(`规则必须归属已登记章节：${rule?.id ?? "<空>"}`);
    for (const field of ["implementation", "validation"]) {
      if (!Array.isArray(rule?.[field]) || rule[field].length === 0) {
        errors.push(`规则缺少 ${field}：${rule?.id ?? "<空>"}`);
        continue;
      }
      const paths = new Set();
      for (const path of rule[field]) {
        if (typeof path !== "string" || !path) errors.push(`规则 ${field} 包含空路径：${rule.id}`);
        else if (paths.has(path)) errors.push(`规则 ${field} 路径重复：${rule.id} -> ${path}`);
        else if (!exists(path)) errors.push(`规则 ${field} 路径不存在：${rule.id} -> ${path}`);
        paths.add(path);
      }
    }
  }
  for (const id of documentedRuleIDs) {
    if (!ruleIDs.has(id)) errors.push(`规范章节未登记规则：${id}`);
  }
  for (const id of ruleIDs) {
    if (!documentedRuleIDs.has(id)) errors.push(`规则清单不存在对应规范章节：${id}`);
  }

  const orchestration = manifest?.gateOrchestration;
  if (!orchestration || typeof orchestration !== "object") {
    errors.push("规则清单缺少 gateOrchestration");
  } else {
    const requiredSharedInputs = [];
    // 未声明时保持来源 CI 契约；local 必须登记原因及实际本地验证文件。
    const automation = orchestration.automation;
    const automationMode = automation?.mode ?? "ci";
    if (!["ci", "local"].includes(automationMode)) errors.push("门禁自动化模式必须是 ci 或 local");
    if (automationMode === "local") {
      if (typeof automation?.reason !== "string" || !automation.reason.trim()) errors.push("本地门禁必须登记不使用 CI 的原因");
      if (!Array.isArray(automation?.validation) || automation.validation.length === 0) errors.push("本地门禁必须登记实际验证文件");
      else {
        if (new Set(automation.validation).size !== automation.validation.length) errors.push("本地门禁验证文件重复");
        for (const target of automation.validation) {
          if (typeof target !== "string" || !target || !exists(target)) errors.push("本地门禁验证文件不存在：" + (target ?? "<空>"));
          else requiredSharedInputs.push(target);
        }
      }
      for (const field of CI_PATH_FIELDS) {
        if (orchestration[field] !== undefined) errors.push("本地门禁不得登记不存在的 CI 接线：" + field);
      }
    }
    const fields = [...ORCHESTRATION_PATH_FIELDS, ...ORCHESTRATION_OPTIONAL_PATH_FIELDS, ...(automationMode === "ci" ? CI_PATH_FIELDS : [])];
    for (const field of fields) {
      const target = orchestration[field];
      if (target === undefined && ORCHESTRATION_OPTIONAL_PATH_FIELDS.includes(field)) continue;
      if (typeof target !== "string" || !target) errors.push(`共享编排路径缺失：${field}`);
      else {
        requiredSharedInputs.push(target);
        if (!exists(target)) errors.push(`共享编排路径不存在：${field} -> ${target}`);
      }
    }
    if (!Array.isArray(orchestration.sharedInputs) || orchestration.sharedInputs.length === 0) {
      errors.push("共享编排缺少 sharedInputs");
    } else {
      if (new Set(orchestration.sharedInputs).size !== orchestration.sharedInputs.length) errors.push("共享编排 sharedInputs 存在重复项");
      for (const target of orchestration.sharedInputs) {
        if (typeof target !== "string" || !target || !exists(target)) errors.push(`共享编排输入路径不存在：${target ?? "<空>"}`);
      }
      for (const target of requiredSharedInputs) {
        if (!orchestration.sharedInputs.includes(target)) errors.push(`共享编排输入闭包缺失：${target}`);
      }
      for (const target of orchestration.sharedInputs) {
        if (!requiredSharedInputs.includes(target)) errors.push(`共享编排输入未归属编排字段：${target}`);
      }
    }

    const commands = orchestration.commands;
    const packageRoot = orchestration.packageManifest?.slice(0, orchestration.packageManifest.lastIndexOf("/") + 1) ?? "";
    const runnerRelative = orchestration.runner?.startsWith(packageRoot) ? orchestration.runner.slice(packageRoot.length) : "";
    const expectedCommands = {
      complete: `node ${runnerRelative}`,
      affected: `node ${runnerRelative} --affected`,
      staged: `node ${runnerRelative} --staged`,
      ci: `node ${runnerRelative} --ci`,
    };
    for (const mode of [...ORCHESTRATION_COMMAND_MODES, ...(commands?.ci ? ["ci"] : [])]) {
      const script = commands?.[mode];
      if (!script || !packageScripts[script]) errors.push(`统一门禁入口未定义：${mode} -> ${script ?? "<空>"}`);
      else if (packageScripts[script] !== expectedCommands[mode]) {
        errors.push(`统一门禁入口未指向登记 runner：${script} -> ${expectedCommands[mode]}`);
      }
    }
    if (orchestration.preCommitHook && commands?.staged && exists(orchestration.preCommitHook)) {
      const hook = read(orchestration.preCommitHook);
      if (!hook.includes(`pnpm run ${commands.staged}`)) errors.push(`pre-commit 未调用登记入口：${commands.staged}`);
    }
    if (orchestration.ciWorkflow && commands?.complete && exists(orchestration.ciWorkflow)) {
      const workflow = read(orchestration.ciWorkflow);
      if (!workflow.includes(`pnpm run ${commands.complete}`)) errors.push(`CI 未调用登记入口：${commands.complete}`);
      for (const target of orchestration.sharedInputs ?? []) {
        if (workflowCoverageCount(workflow, target) < 2) {
          errors.push(`CI push 与增量过滤未共同覆盖共享编排输入：${target}`);
        }
      }
    }

    // 定向 UI 选择登记：共享输入与各 spec 的覆盖输入必须存在，登记的 spec 必须是真实文件。
    // 调用方注入 list 时另核对所有 spec 均已登记，防止新用例游离在选择器之外。
    const uiSelection = orchestration.uiSpecSelection;
    if (uiSelection !== undefined) {
      if (!uiSelection || typeof uiSelection !== "object" || !Array.isArray(uiSelection.sharedInputs)
        || !uiSelection.specs || typeof uiSelection.specs !== "object" || Array.isArray(uiSelection.specs)) {
        errors.push("uiSpecSelection 结构无效");
      } else {
        for (const target of uiSelection.sharedInputs) {
          if (typeof target !== "string" || !target) errors.push("uiSpecSelection 共享输入为空");
          else if (!exists(target.endsWith("/") ? target.slice(0, -1) : target)) errors.push(`uiSpecSelection 共享输入不存在：${target}`);
        }
        const registered = new Set();
        for (const [spec, inputs] of Object.entries(uiSelection.specs)) {
          if (!/^tests\/ui\/[\w/-]+\.spec\.ts$/.test(spec)) errors.push(`uiSpecSelection 登记了非法 spec：${spec}`);
          else registered.add(spec);
          if (!exists(`${packageRoot}${spec}`)) errors.push(`uiSpecSelection 登记的 spec 不存在：${packageRoot}${spec}`);
          if (!Array.isArray(inputs)) errors.push(`uiSpecSelection 输入必须是数组：${spec}`);
          else for (const input of inputs) {
            if (typeof input !== "string" || !input) errors.push(`uiSpecSelection 输入为空：${spec}`);
            else if (!exists(input.endsWith("/") ? input.slice(0, -1) : input)) errors.push(`uiSpecSelection 输入不存在：${spec} -> ${input}`);
          }
        }
        for (const spec of list?.(`${packageRoot}tests/ui`)?.filter((name) => name.endsWith(".spec.ts")) ?? []) {
          if (!registered.has(spec.slice(packageRoot.length))) errors.push(`UI 用例未登记定向选择：${spec}`);
        }
      }
    }
  }

  if (!Array.isArray(manifest?.checks) || manifest.checks.length === 0) {
    errors.push("规则清单缺少 checks");
    return errors;
  }
  const checkIDs = new Set();
  const checkScripts = new Set();
  const governedRuleIDs = new Set();
  let previousPhase = -1;
  for (const check of manifest.checks) {
    if (!check?.id || checkIDs.has(check.id)) errors.push(`门禁 ID 缺失或重复：${check?.id ?? "<空>"}`);
    else checkIDs.add(check.id);
    if (check?.id && !CHECK_ID.test(check.id)) errors.push(`门禁 ID 必须是稳定小写语义标识：${check.id}`);
    if (!check?.domain || typeof check.domain !== "string") errors.push(`门禁缺少领域：${check?.id ?? "<空>"}`);
    const phaseIndex = CHECK_PHASES.indexOf(check?.phase);
    if (phaseIndex < 0) errors.push(`门禁 phase 非法：${check?.id ?? "<空>"}`);
    else {
      if (phaseIndex < previousPhase) errors.push(`门禁必须按 static、build、ui 串行登记：${check.id}`);
      previousPhase = phaseIndex;
    }
    if (!CHECK_TIERS.has(check?.tier)) errors.push(`门禁 tier 必须是 fast 或 complete：${check?.id ?? "<空>"}`);
    if (!check?.script || !packageScripts[check.script]) errors.push(`门禁命令未在 package scripts 定义：${check?.id ?? "<空>"} -> ${check?.script ?? "<空>"}`);
    else if (checkScripts.has(check.script)) errors.push(`门禁命令重复登记：${check.script}`);
    else checkScripts.add(check.script);
    for (const field of ["inputs", "tests", "rules"]) {
      if (!Array.isArray(check?.[field]) || check[field].length === 0) errors.push(`门禁缺少 ${field}：${check?.id ?? "<空>"}`);
      else if (new Set(check[field]).size !== check[field].length) errors.push(`门禁 ${field} 存在重复项：${check.id}`);
    }
    for (const target of check?.inputs ?? []) {
      if (typeof target !== "string" || !target || !exists(target)) errors.push(`门禁输入路径不存在：${check.id} -> ${target ?? "<空>"}`);
    }
    for (const target of check?.tests ?? []) {
      if (!exists(target)) errors.push(`门禁专项测试不存在：${check.id} -> ${target}`);
    }
    for (const ruleID of check?.rules ?? []) {
      if (!ruleIDs.has(ruleID)) errors.push(`门禁引用未知规范规则：${check.id} -> ${ruleID}`);
      governedRuleIDs.add(ruleID);
    }
  }
  const checkOrder = new Map(manifest.checks.map((check, index) => [check.id, index]));
  for (const check of manifest.checks) {
    for (const dependency of check.dependsOn ?? []) {
      if (!checkIDs.has(dependency)) errors.push(`门禁依赖不存在：${check.id} -> ${dependency}`);
      if (dependency === check.id) errors.push(`门禁不能依赖自身：${check.id}`);
      if (checkOrder.has(dependency) && checkOrder.get(dependency) > checkOrder.get(check.id)) {
        errors.push(`门禁依赖必须先于调用方登记：${check.id} -> ${dependency}`);
      }
    }
  }
  // 跨运行域沿用仓库已有权威编排器；只登记真实归属，不由前端 runner 再次调用。
  const externalChecks = manifest.externalChecks ?? [];
  if (!Array.isArray(externalChecks)) errors.push("externalChecks 必须是数组");
  else for (const check of externalChecks) {
    if (!check?.id || !CHECK_ID.test(check.id) || checkIDs.has(check.id)) errors.push(`外部门禁 ID 无效或重复：${check?.id ?? "<空>"}`);
    else checkIDs.add(check.id);
    if (!check?.domain) errors.push(`外部门禁缺少领域：${check?.id ?? "<空>"}`);
    if (!check?.runner || !exists(check.runner)) errors.push(`外部门禁编排器不存在：${check?.id ?? "<空>"}`);
    if (!Array.isArray(check?.command) || !check.command.length || !check.command.every(value => typeof value === "string" && value.trim()) || !check.command.includes(check.runner)) errors.push(`外部门禁必须登记含真实 runner 的命令参数：${check?.id ?? "<空>"}`);
    for (const field of ["inputs", "tests", "rules"]) {
      if (!Array.isArray(check?.[field]) || !check[field].length || new Set(check[field]).size !== check[field].length) {
        errors.push(`外部门禁 ${field} 缺失或重复：${check?.id ?? "<空>"}`);
        continue;
      }
      for (const target of check[field]) {
        if (field === "rules") {
          if (!ruleIDs.has(target)) errors.push(`外部门禁引用未知规则：${check.id} -> ${target}`);
          else governedRuleIDs.add(target);
        } else if (typeof target !== "string" || !target || !exists(target)) errors.push(`外部门禁 ${field} 路径不存在：${check.id} -> ${target}`);
      }
    }
    if (!(check.inputs ?? []).includes(check.runner)) errors.push(`外部门禁输入未闭合编排器：${check?.id ?? "<空>"}`);
    for (const target of check.tests ?? []) if (!(check.inputs ?? []).some(input => target === input || target.startsWith(input.endsWith("/") ? input : `${input}/`))) errors.push(`外部门禁输入未覆盖自检：${check.id} -> ${target}`);
  }
  for (const ruleID of ruleIDs) {
    if (!governedRuleIDs.has(ruleID)) errors.push(`规范规则未关联门禁：${ruleID}`);
  }
  // 门禁脚本实际引用的规则 ID 必须已登记，防止诊断输出游离在规范之外。
  for (const [scriptName, content] of Object.entries(scripts ?? {})) {
    for (const match of String(content).matchAll(/"FRONTEND-[A-Z0-9-]+"/g)) {
      if (!ruleIDs.has(match[0].slice(1, -1))) errors.push(`门禁脚本引用未登记规范规则：${scriptName} -> ${match[0].slice(1, -1)}`);
    }
  }
  for (const script of Object.keys(packageScripts).filter((name) => REQUIRED_GATE_SCRIPTS.test(name))) {
    if (!checkScripts.has(script)) errors.push(`门禁命令未登记：${script}`);
  }

  const reportIDs = new Set();
  const reportScripts = new Set();
  if (!Array.isArray(manifest?.reports)) errors.push("规则清单缺少 reports");
  for (const report of manifest?.reports ?? []) {
    if (!report?.id || reportIDs.has(report.id)) errors.push(`报告 ID 缺失或重复：${report?.id ?? "<空>"}`);
    else reportIDs.add(report.id);
    if (report?.id && !CHECK_ID.test(report.id)) errors.push(`报告 ID 必须是稳定小写语义标识：${report.id}`);
    if (report?.nonBlocking !== true) errors.push(`开发报告必须显式 nonBlocking：${report?.id ?? "<空>"}`);
    if (!report?.domain || typeof report.domain !== "string") errors.push(`报告缺少领域：${report?.id ?? "<空>"}`);
    if (!report?.script || !packageScripts[report.script]) errors.push(`报告命令未在 package scripts 定义：${report?.id ?? "<空>"}`);
    else if (reportScripts.has(report.script)) errors.push(`报告命令重复登记：${report.script}`);
    else reportScripts.add(report.script);
    for (const field of ["inputs", "tests", "rules", "signals"]) {
      if (!Array.isArray(report?.[field]) || report[field].length === 0) errors.push(`报告缺少 ${field}：${report?.id ?? "<空>"}`);
    }
    for (const target of [...(report?.inputs ?? []), ...(report?.tests ?? [])]) {
      if (typeof target !== "string" || !target || !exists(target)) errors.push(`报告路径不存在：${report.id} -> ${target ?? "<空>"}`);
    }
    for (const ruleID of report?.rules ?? []) {
      if (!ruleIDs.has(ruleID)) errors.push(`报告引用未知规范规则：${report.id} -> ${ruleID}`);
    }
  }
  for (const script of Object.keys(packageScripts).filter((name) => REPORT_SCRIPT.test(name))) {
    if (!reportScripts.has(script)) errors.push(`开发报告命令未登记：${script}`);
  }

  return errors;
}
