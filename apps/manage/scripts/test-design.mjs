import { spawnSync } from "node:child_process";
import { copyFileSync, mkdtempSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

// 隔离测试配置：空项目没有真实大候选接口，正反例仍须完整运行，不能 skip 或伪造项目 API。
const frontend = fileURLToPath(new URL("../", import.meta.url));
const fixture = mkdtempSync(path.join(os.tmpdir(), "dsanying-design-tests-"));
let status = 1;
try {
  mkdirSync(path.join(fixture, "scripts"));
  for (const name of ["design-governance.mjs", "design-governance.test.mjs", "query-field-governance.mjs", "i18n-nesting.mjs", "navigation-governance.mjs", "transport-governance.mjs"]) copyFileSync(path.join(frontend, "scripts", name), path.join(fixture, "scripts", name));
  symlinkSync(path.join(frontend, "node_modules"), path.join(fixture, "node_modules"), process.platform === "win32" ? "junction" : "dir");
  symlinkSync(path.join(frontend, "src"), path.join(fixture, "src"), process.platform === "win32" ? "junction" : "dir");
  const project = JSON.parse(readFileSync(path.join(frontend, "scripts/design-system.project.json"), "utf8"));
  const testProject = { ...project, largeCandidateApis: { module: "@/services/test-only", names: ["loadCandidates"] } };
  writeFileSync(path.join(fixture, "scripts/design-system.project.json"), JSON.stringify(testProject));
  const result = spawnSync(process.execPath, ["--test", path.join(fixture, "scripts/design-governance.test.mjs")], { cwd: frontend, stdio: "inherit" });
  status = result.status ?? 1;
} finally { rmSync(fixture, { recursive: true, force: true }); }
process.exit(status);
