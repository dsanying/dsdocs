import assert from "node:assert/strict";
import test from "node:test";

import {
  BUSINESS_TIME_ZONE,
  formatDate,
  formatDateLabel,
  formatDateTime,
  formatDateTimeMinute,
  formatMonthDay,
  formatMonthDayTime,
  formatRelativeTime,
  now,
  parseServerTime,
  toOffsetDateTime,
} from "../src/utils/dateTime.ts";

test("接口里不带偏移的时间按业务时区解释，与设备时区无关", () => {
  const parsed = parseServerTime("2026-09-16 15:47:55");
  assert.equal(parsed.format("YYYY-MM-DD HH:mm:ss"), "2026-09-16 15:47:55");
  assert.equal(toOffsetDateTime(parsed), "2026-09-16T15:47:55+08:00");
  assert.equal(parsed.valueOf(), Date.UTC(2026, 8, 16, 7, 47, 55));
});

test("带偏移的时间换算到业务时区展示", () => {
  assert.equal(formatDateTime("2026-09-16T00:00:00Z"), "2026/09/16 08:00:00");
  assert.equal(formatDateTime(Date.UTC(2026, 0, 1, 20, 0, 0)), "2026/01/02 04:00:00");
});

test("现在与日界都在业务时区里", () => {
  assert.equal(BUSINESS_TIME_ZONE, "Asia/Shanghai");
  assert.equal(now().utcOffset(), 480);
  assert.equal(toOffsetDateTime(now().startOf("day")).slice(11), "00:00:00+08:00");
});

test("展示日期统一用 / 分隔，提交格式不变", () => {
  assert.equal(formatDate("2026-09-16 23:59:59"), "2026/09/16");
  assert.equal(formatDateTimeMinute("2026-09-16 15:47:55"), "2026/09/16 15:47");
  assert.equal(formatMonthDay("2026-09-01"), "09/01");
  assert.equal(toOffsetDateTime(parseServerTime("2026-09-16 15:47:55")), "2026-09-16T15:47:55+08:00");
});

test("接口日期桶标签只替换日期分隔符，非日期标签原样", () => {
  assert.equal(formatDateLabel("2026-09-16"), "2026/09/16");
  assert.equal(formatDateLabel("2026-09"), "2026/09");
  assert.equal(formatDateLabel("2026-09-16 08:00"), "2026/09/16 08:00");
  assert.equal(formatDateLabel("08:00"), "08:00");
  assert.equal(formatDateLabel("gpt-4o-2024-08-06"), "gpt-4o-2024-08-06");
});

test("近期事件用月/日 时:分，RFC3339 偏移换算到业务时区；相对时间以业务时区的现在为基准", () => {
  assert.equal(formatMonthDayTime("2026-09-30T18:03:17Z"), "10/01 02:03");
  assert.equal(formatMonthDayTime("2026-10-01T02:03:17+08:00"), "10/01 02:03");
  assert.equal(formatRelativeTime(now().subtract(3, "hour")), "3 hours ago");
});
