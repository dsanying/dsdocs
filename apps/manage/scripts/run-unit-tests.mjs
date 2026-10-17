import { spawnSync } from "node:child_process";
import { readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const frontendRoot = fileURLToPath(new URL("../", import.meta.url));
const roots = [path.join(frontendRoot, "scripts"), path.join(frontendRoot, "src")];
const unitTestPattern = /\.unit\.test\.(?:mjs|ts|tsx)$/;

function walk(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const target = path.join(directory, entry.name);
    return entry.isDirectory() ? walk(target) : [target];
  });
}

export function discoverUnitTests(directories = roots) {
  return directories
    .flatMap(walk)
    .filter((target) => unitTestPattern.test(target))
    .sort();
}

function run() {
  const tests = discoverUnitTests();
  if (tests.length === 0) {
    console.error("[unit] FAIL 未发现 *.unit.test.{mjs,ts,tsx}");
    process.exit(1);
  }
  const result = spawnSync(process.execPath, ["--test", ...tests], {
    cwd: frontendRoot,
    stdio: "inherit",
    env: process.env,
  });
  process.exit(result.status ?? 1);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) run();
