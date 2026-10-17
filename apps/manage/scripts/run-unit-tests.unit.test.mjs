import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { discoverUnitTests } from "./run-unit-tests.mjs";

test("unit runner 只发现统一命名的测试并保持稳定顺序", () => {
  const root = mkdtempSync(path.join(tmpdir(), "frontend-unit-tests-"));
  try {
    mkdirSync(path.join(root, "nested"));
    writeFileSync(path.join(root, "b.unit.test.ts"), "");
    writeFileSync(path.join(root, "nested", "a.unit.test.mjs"), "");
    writeFileSync(path.join(root, "ignored.test.mjs"), "");
    assert.deepEqual(discoverUnitTests([root]), [
      path.join(root, "b.unit.test.ts"),
      path.join(root, "nested", "a.unit.test.mjs"),
    ]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
