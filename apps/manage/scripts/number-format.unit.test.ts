import assert from "node:assert/strict";
import test from "node:test";
import { formatAmount, formatCompactNumber, formatCurrency, formatDecimal, formatNumber, formatPercent } from "../src/utils/number.ts";

test("formatNumber 把数值裁到三位小数、整数与非数值原样", () => {
  assert.equal(formatNumber(488.9143585378), "488.914");
  assert.equal(formatNumber(0), "0");
  assert.equal(formatNumber(101), "101");
  assert.equal(formatNumber(1.5), "1.5");
  assert.equal(formatNumber("21855.8899752255"), "21855.89");
  assert.equal(formatNumber("326020103"), "326020103");
  assert.equal(formatNumber("sk-abc"), "sk-abc");
  assert.equal(formatNumber(null), "");
});

test("金额显示保留微小非零事实、符号和指数，不改变输入精度", () => {
  const raw = "0.000000000123456789";
  assert.equal(formatAmount(raw, "en-US"), "1.235e-10");
  assert.equal(formatCurrency(raw, "en-US"), "￥1.235e-10");
  assert.equal(formatAmount("-0.00099999", "en-US"), "-1e-3");
  assert.equal(formatAmount("1.23456e-500", "en-US"), "1.235e-500");
  assert.equal(formatAmount(0.000001, "en-US"), "1e-6");
  assert.equal(formatAmount("0.001", "en-US"), "0.001");
  assert.equal(formatCurrency(0, "en-US"), "￥0.00");
  assert.equal(raw, "0.000000000123456789");
});

test("固定位数、百分比与金额都受三位上限约束", () => {
  assert.equal(formatDecimal(1.23456, 6), "1.235");
  assert.equal(formatDecimal("x", 2), "0.00");
  assert.equal(formatPercent(12.3456), "12.3%");
  assert.equal(formatCurrency(1993.85, "en-US"), "￥1,993.85");
  assert.equal(formatCurrency(1993.8567, "en-US"), "￥1,993.857");
});

test("紧凑数值只清理小数尾零，不丢失整数尾零",()=>{
  for (const value of [0,10,100,990]) assert.equal(formatCompactNumber(value,0),String(value));
  assert.equal(formatCompactNumber(100,2),"100");
  assert.equal(formatCompactNumber(10.5,2),"10.5");
});
