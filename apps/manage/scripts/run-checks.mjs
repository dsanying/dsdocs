import { execFileSync, spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const frontendRoot = fileURLToPath(new URL("../", import.meta.url));
const repositoryRoot = path.resolve(frontendRoot, "../..");
const manifestPath = path.join(repositoryRoot, "docs/规范/manifest.json");

export function matchesInput(target, inputs) {
  return inputs.some((input) => input.endsWith("/") ? target.startsWith(input) : target === input);
}

export function selectAffectedChecks(checks, changedPaths, infrastructurePaths = [], universe = checks) {
  if (changedPaths.some((target) => matchesInput(target, infrastructurePaths))) return checks;
  // 未登记影响范围不能静默跳过：按完整清单判断未知路径，eslint 的宽泛目录输入不算覆盖。
  if (changedPaths.some((target) => !universe.some((check) => check.id !== "eslint" && matchesInput(target, check.inputs)))) return checks;
  const selected = new Set(
    checks.filter((check) => changedPaths.some((target) => matchesInput(target, check.inputs))).map((check) => check.id),
  );
  let changed = true;
  while (changed) {
    changed = false;
    for (const check of checks) {
      if (!selected.has(check.id)) continue;
      for (const dependency of check.dependsOn ?? []) {
        if (!selected.has(dependency)) {
          selected.add(dependency);
          changed = true;
        }
      }
    }
  }
  return checks.filter((check) => selected.has(check.id));
}

export function selectChecks(checks, { phase, affected = false, staged = false, ci = false, changedPaths = [], infrastructurePaths = [] } = {}) {
  let selected = phase ? checks.filter((check) => check.phase === phase) : checks;
  if (ci) {
    // 浏览器验收只在本地执行（pnpm check / check:ui），CI 仅跑静态与构建门禁
    selected = selected.filter((check) => check.phase !== "ui");
    if (!changedPaths.length) return selected;
    // 工作流由现有公共 CI 维护，不重复运行本地业务门禁。
    const businessPaths = changedPaths.filter((target) => !target.startsWith(".github/"));
    if (!businessPaths.length) return [];
    // 未知前端输入不得静默跳过构建或浏览器检查。
    const frontendDir = checks.flatMap((check) => check.inputs ?? []).map((input) => input.match(/^([A-Za-z0-9_-]+\/)src\//)?.[1]).find(Boolean);
    const unknown = businessPaths.some((target) => frontendDir && target.startsWith(frontendDir) &&
      !target.endsWith(".md") &&
      !checks.some((check) => check.id !== "eslint" && matchesInput(target, check.inputs)));
    const sharedRuntimeAsset = businessPaths.some((target) => frontendDir && target.startsWith(`${frontendDir}public/`));
    if (unknown || sharedRuntimeAsset) return selected;
    return selectAffectedChecks(selected, businessPaths, infrastructurePaths, checks);
  }
  if (!affected && !staged) return selected;
  selected = selected.filter((check) => check.tier === "fast");
  return selectAffectedChecks(selected, changedPaths, infrastructurePaths, checks);
}

function gitOutput(args) {
  try {
    return execFileSync("git", args, { cwd: repositoryRoot, encoding: "utf8" });
  } catch {
    return "";
  }
}

function gitLines(args, runGit = gitOutput) {
  return runGit(args).split("\n").map((line) => line.trim()).filter(Boolean);
}

export function parseNameStatus(output) {
  const fields = output.split("\0").filter(Boolean);
  const paths = [];
  for (let index = 0; index < fields.length;) {
    const status = fields[index++];
    const pathCount = /^[RC]/.test(status) ? 2 : 1;
    for (let offset = 0; offset < pathCount && index < fields.length; offset += 1) paths.push(fields[index++]);
  }
  return paths;
}

function diffPaths(args, runGit = gitOutput) {
  // copy 的来源通常未修改，必须启用 harder 才能让 Git 真实返回 Cxxx 及两侧路径。
  return parseNameStatus(runGit(["diff", "--name-status", "--find-renames", "--find-copies-harder", "-z", ...args]));
}

export function changedPaths(runGit = gitOutput, configuredBase = process.env.FRONTEND_CHECK_BASE) {
  const result = new Set([
    ...diffPaths([], runGit),
    ...diffPaths(["--cached"], runGit),
    ...gitLines(["ls-files", "--others", "--exclude-standard"], runGit),
  ]);
  const bases = configuredBase ? [configuredBase] : ["origin/main", "main"];
  for (const base of bases) {
    const mergeBase = gitLines(["merge-base", "HEAD", base], runGit)[0];
    if (!mergeBase) continue;
    for (const target of diffPaths([`${mergeBase}...HEAD`], runGit)) result.add(target);
    return [...result];
  }
  // 无可靠比较基线时返回基础设施路径，由选择器失败安全地升级为全量。
  result.add(path.relative(repositoryRoot, fileURLToPath(import.meta.url)));
  return [...result];
}

export function stagedPaths(runGit = gitOutput) {
  return diffPaths(["--cached", "--diff-filter=ACMRD"], runGit);
}

export function parseArguments(argv) {
  const affected = argv.includes("--affected");
  const staged = argv.includes("--staged");
  if (affected && staged) throw new Error("--affected 与 --staged 不能同时使用");
  const phaseIndex = argv.indexOf("--phase");
  const phase = phaseIndex >= 0 ? argv[phaseIndex + 1] : undefined;
  if (phaseIndex >= 0 && !phase) throw new Error("--phase 需要 static、build 或 ui");
  if (phase && !["static", "build", "ui"].includes(phase)) throw new Error(`未知 phase：${phase}`);
  return { affected, staged, phase };
}

function run() {
  const { affected, staged, phase } = parseArguments(process.argv.slice(2));
  if (phase === "ui" && (affected || staged)) {
    // UI 定向选择由 run-ui-tests 按清单映射解析；先构建测试产物再跑命中 spec
    const isWindows = process.platform === "win32";
    const build = spawnSync("pnpm", ["run", "build:ui"], { cwd: frontendRoot, stdio: "inherit", env: process.env, shell: isWindows });
    if (build.error || build.status !== 0) {
      console.error(`[gate:ui] FAIL 测试构建${build.error ? `：${build.error.message}` : ""}`);
      process.exit(build.status ?? 1);
    }
    const uiRun = spawnSync(process.execPath,
      [path.join(frontendRoot, "scripts/run-ui-tests.mjs"), staged ? "--staged" : "--affected"],
      { stdio: "inherit", env: process.env });
    process.exit(uiRun.status ?? 1);
  }
  const ci = process.argv.includes("--ci");
  if (ci && (affected || staged || phase)) throw new Error("--ci 不能与开发期模式混用");
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  const paths = ci ? JSON.parse(process.env.FRONTEND_CHECK_PATHS_JSON ?? "[]") : staged ? stagedPaths() : affected ? changedPaths() : [];
  if (!Array.isArray(paths) || paths.some((target) => typeof target !== "string")) throw new Error("CI 文件列表无效");
  const checks = selectChecks(manifest.checks, {
    phase,
    ci,
    affected,
    staged,
    changedPaths: paths,
    infrastructurePaths: manifest.gateOrchestration.sharedInputs,
  });

  if (checks.length === 0) {
    console.log("[gate:summary] SKIP 未命中需要执行的前端门禁");
    return;
  }

  const startedAt = Date.now();
  for (const check of checks) {
    const gateStartedAt = Date.now();
    console.log(`[gate:${check.id}] START ${check.script}`);
    // Windows 下 .cmd 命令脚本必须经 shell 启动（Node 20.12+ 直接 spawn 会 EINVAL）
    const isWindows = process.platform === "win32";
    const result = spawnSync("pnpm", ["run", check.script], {
      cwd: frontendRoot,
      stdio: "inherit",
      env: process.env,
      shell: isWindows,
    });
    const elapsed = ((Date.now() - gateStartedAt) / 1000).toFixed(1);
    if (result.error || result.status !== 0) {
      console.error(`[gate:${check.id}] FAIL ${elapsed}s${result.error ? ` 子进程启动失败：${result.error.message}` : ""}`);
      process.exit(result.status ?? 1);
    }
    console.log(`[gate:${check.id}] PASS ${elapsed}s`);
  }
  console.log(`[gate:summary] PASS ${checks.length} gates ${((Date.now() - startedAt) / 1000).toFixed(1)}s`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) run();
