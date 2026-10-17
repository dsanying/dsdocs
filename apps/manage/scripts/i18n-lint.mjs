#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  analyzeI18n,
  findCopyCandidates,
  removeCatalogKeys,
} from "./i18n-governance.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const localePaths = {
  "zh-CN": path.join(root, "src/i18n/locales/zh-CN.json"),
  "en-US": path.join(root, "src/i18n/locales/en-US.json"),
};
const registryPath = path.join(root, "src/i18n/dynamic-keys.json");

function* sourceFiles(directory = path.join(root, "src")) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) yield* sourceFiles(target);
    else if (/\.tsx?$/.test(entry.name) && !entry.name.endsWith(".d.ts")) yield target;
  }
}

function inputs() {
  return {
    catalogs: Object.fromEntries(
      Object.entries(localePaths).map(([locale, target]) => [
        locale,
        JSON.parse(fs.readFileSync(target, "utf8")),
      ]),
    ),
    registry: JSON.parse(fs.readFileSync(registryPath, "utf8")),
    sources: [...sourceFiles()].map((target) => ({
      file: path.relative(root, target),
      text: fs.readFileSync(target, "utf8"),
    })),
  };
}

function fatalErrors(result) {
  return result.errors.filter((error) => !error.msg.startsWith("未使用键 "));
}

function printErrors(errors, cap = 80) {
  if (!errors.length) return;
  process.stderr.write(`\ni18n 错误 (${errors.length}):\n`);
  for (const error of errors.slice(0, cap)) {
    process.stderr.write(`::error file=${error.file},line=${error.line}::${error.msg}\n`);
  }
  if (errors.length > cap) process.stderr.write(`...（还有 ${errors.length - cap} 条，修复后重新运行以继续查看）\n`);
}

const flags = new Set(process.argv.slice(2));
let state = inputs();
let result = analyzeI18n(state);

if (flags.has("--prune-unused")) {
  const blockers = fatalErrors(result);
  if (blockers.length) {
    printErrors(blockers);
    process.exit(1);
  }
  if (!result.unused.length) {
    console.log("i18n 无废弃键可清理");
  } else {
    const removed = result.unused.length;
    for (const [locale, target] of Object.entries(localePaths)) {
      const cleaned = removeCatalogKeys(state.catalogs[locale], result.unused);
      fs.writeFileSync(target, `${JSON.stringify(cleaned, null, 2)}\n`);
    }
    state = inputs();
    result = analyzeI18n(state);
    if (result.errors.length) {
      printErrors(result.errors);
      process.exit(1);
    }
    console.log(`i18n 已从中英文目录同步清理 ${removed} 个废弃键`);
  }
}

if (flags.has("--report-duplicates")) {
  const candidates = findCopyCandidates(state.catalogs["zh-CN"]);
  const cap = 60;
  console.log(`i18n 重复/近似文案候选 ${candidates.length} 组（仅供人工治理，不阻断）：`);
  for (const item of candidates.slice(0, cap)) {
    console.log(`${item.kind === "exact" ? "相同" : `${Math.round(item.score * 100)}%`}  ${item.left}  ↔  ${item.right}`);
  }
  if (candidates.length > cap) console.log(`...（还有 ${candidates.length - cap} 组）`);
}

if (result.errors.length) {
  printErrors(result.errors);
  process.exit(1);
}

console.log(`i18n 门禁通过：${result.used.size} 个在用键，中英文键/类型/插值一致，动态入口均已登记`);
