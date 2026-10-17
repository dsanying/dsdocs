import assert from "node:assert/strict";
import test from "node:test";
import { describeCronCycle, formatCronCycle, validateCronCycle } from "../src/utils/cronCycle.ts";

test("cron cycle 与后端 ParseStandard 的五字段和 descriptor 边界一致", () => {
  for (const expression of [
    "0 3 * * *",
    "0 1 * * 5 ",
    "*/15 9-17 * JAN MON-FRI",
    "@yearly",
    "@annually",
    "@monthly",
    "@weekly",
    "@daily",
    "@midnight",
    "@hourly",
  ]) assert.equal(validateCronCycle(expression), true, expression);

  for (const expression of [
    "",
    "not cron",
    "0 0 * * * *",
    "@minutely",
    "@secondly",
    "0 0 L * *",
    "0 0 * * MON#2",
    "0 0 * * 7",
    "61 * * * *",
  ]) assert.equal(validateCronCycle(expression), false, expression);
});

test("cron cycle 拒绝可解析但未来不可能命中的日期", () => {
  assert.equal(validateCronCycle("0 0 30 2 *"), false);
  assert.equal(validateCronCycle("0 0 31 4 *"), false);
  assert.equal(validateCronCycle("0 0 29 2 *"), true);
});

test("@every 使用 Go duration 语法且描述按当前语言生成", () => {
  for (const expression of ["@every 5m", "@every 1h30m", "@every .5s", "@every 0", "@every -1s"]) {
    assert.equal(validateCronCycle(expression), true, expression);
  }
  for (const expression of ["@every", "@every 5", "@every 1d", "@every 1h 30m", "@every 999999999999999999999h"]) {
    assert.equal(validateCronCycle(expression), false, expression);
  }
  assert.equal(describeCronCycle("@every 5m", "zh-CN"), "每隔 5m");
  assert.equal(describeCronCycle("@every 5m", "en-US"), "Every 5m");
  assert.match(describeCronCycle("0 3 * * *", "zh-CN"), /3/);
  assert.match(describeCronCycle("0 3 * * *", "en-US"), /03:00|3:00/);
  assert.throws(() => describeCronCycle("0 0 30 2 *", "zh-CN"));
  assert.equal(formatCronCycle("0 0 30 2 *", "zh-CN"), "0 0 30 2 *");
});
