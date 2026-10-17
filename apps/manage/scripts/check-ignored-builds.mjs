import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const frontendRoot = fileURLToPath(new URL("../", import.meta.url));

/**
 * 解析 pnpm-workspace.yaml 的 allowBuilds 审计表：`true` 为允许执行，`false` 为明确禁止。
 * 只识别 pnpm 官方的两级缩进映射，避免为单一配置引入 YAML 依赖。
 */
export function parseAllowBuilds(workspaceYaml) {
  const allowBuilds = new Map();
  const lines = workspaceYaml.split(/\r?\n/);
  const start = lines.findIndex((line) => /^allowBuilds:\s*$/.test(line));
  if (start < 0) return allowBuilds;
  let indentation;
  for (const line of lines.slice(start + 1)) {
    if (line.trim() === "" || line.trim().startsWith("#")) continue;
    const match = /^( +)([^\s:#]+):\s*(true|false)\s*$/.exec(line);
    if (!match) break;
    indentation ??= match[1].length;
    if (match[1].length !== indentation) break;
    allowBuilds.set(match[2], match[3] === "true");
  }
  return allowBuilds;
}

/**
 * 审计依赖构建脚本：虚拟存储中每个声明 install 生命周期脚本的依赖，
 * 必须在 pnpm-workspace.yaml 的 allowBuilds 中显式登记为 `true`（允许执行）
 * 或 `false`（明确禁止），不允许存在未归类项；已登记但不再安装的依赖同样报错，避免审计表残留。
 * 不依赖 `pnpm ignored-builds` 子命令（pnpm 10.26 在部分环境无法执行）。
 */
export function classifyDependencyBuilds({ allowBuilds, packages }) {
  const errors = [];
  for (const [name, scripts] of [...packages.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    if (!allowBuilds.has(name)) {
      errors.push(`依赖 ${name} 声明了构建脚本（${scripts.join(", ")}）但未审计：在 pnpm-workspace.yaml allowBuilds 中显式登记 true 或 false`);
    }
  }
  for (const name of [...allowBuilds.keys()].sort((a, b) => a.localeCompare(b))) {
    if (!packages.has(name)) {
      errors.push(`依赖 ${name} 登记在 allowBuilds 但当前安装中不存在构建脚本：移除残留登记`);
    }
  }
  return errors;
}

/** 扫描 pnpm 虚拟存储，返回带 install 脚本的依赖名 → 脚本列表。 */
export function collectInstallScriptPackages(virtualStoreDir) {
  const packages = new Map();
  if (!existsSync(virtualStoreDir)) return packages;
  for (const entry of readdirSync(virtualStoreDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const storeRoot = path.join(virtualStoreDir, entry.name, "node_modules");
    if (!existsSync(storeRoot)) continue;
    const visit = (directory) => {
      for (const child of readdirSync(directory, { withFileTypes: true })) {
        if (!child.isDirectory() || child.name.startsWith(".")) continue;
        const childDir = path.join(directory, child.name);
        if (child.name.startsWith("@")) {
          visit(childDir);
          continue;
        }
        const manifestPath = path.join(childDir, "package.json");
        if (!existsSync(manifestPath)) continue;
        try {
          const pkg = JSON.parse(readFileSync(manifestPath, "utf8"));
          const scripts = Object.keys(pkg.scripts ?? {}).filter((script) => /^(pre|post)?install$/.test(script));
          if (scripts.length > 0) packages.set(pkg.name, scripts);
        } catch {
          // 无法解析的孤立目录由 install 自身保证一致性，这里不臆测内容。
        }
      }
    };
    visit(storeRoot);
  }
  return packages;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const allowBuilds = parseAllowBuilds(readFileSync(path.join(frontendRoot, "pnpm-workspace.yaml"), "utf8"));
  const packages = collectInstallScriptPackages(path.join(frontendRoot, "node_modules/.pnpm"));
  const errors = classifyDependencyBuilds({ allowBuilds, packages });
  if (errors.length > 0) {
    console.error(`[dependency-builds] FAIL 存在未审计的依赖构建脚本\n${errors.join("\n")}`);
    process.exit(1);
  }
  console.log("依赖构建门禁通过：全部构建脚本依赖均已显式审计");
}
