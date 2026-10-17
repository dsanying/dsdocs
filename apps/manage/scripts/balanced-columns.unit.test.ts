import assert from "node:assert/strict";
import test from "node:test";
import { distributeLastRow, pickBalancedColumns, pickInformationColumns } from "../src/components/ui/balancedColumns.ts";

test("放得下就多列：短值三项在 600px 内一行三列", () => {
  assert.equal(pickBalancedColumns(3, 160, 600), 3);
});

test("只取均衡列数：3 项不排 2+1，4 项不排 3+1，5 项可排 3+2", () => {
  assert.equal(pickBalancedColumns(3, 250, 600), 1);
  assert.equal(pickBalancedColumns(4, 250, 800), 2);
  assert.equal(pickBalancedColumns(5, 250, 800), 3);
  assert.equal(pickBalancedColumns(6, 250, 800), 3);
});

test("间距计入宽度；单项或零宽恒为 1 列", () => {
  assert.equal(pickBalancedColumns(2, 300, 600, 16), 1);
  assert.equal(pickBalancedColumns(2, 300, 616, 16), 2);
  assert.equal(pickBalancedColumns(1, 10, 1000), 1);
  assert.equal(pickBalancedColumns(4, 0, 1000), 1);
});

test("详情网格在容器上限内均衡分行：5 项 3+2、6 项 3+3、7 项 4+3、10 项 4+4+2、15 项 4+4+4+3", () => {
  assert.equal(pickInformationColumns(15, 4), 4);
  assert.equal(pickInformationColumns(9, 4), 3);
  assert.equal(pickInformationColumns(3, 4), 3);
  assert.equal(pickInformationColumns(5, 4), 3);
  assert.equal(pickInformationColumns(6, 4), 3);
  assert.equal(pickInformationColumns(7, 4), 4);
  assert.equal(pickInformationColumns(8, 4), 4);
  assert.equal(pickInformationColumns(10, 4), 4);
  assert.equal(pickInformationColumns(5, 2), 2);
  assert.equal(pickInformationColumns(5, 1), 1);
});

test("末行空格均分给末行字段，整组右缘对齐", () => {
  assert.deepEqual(distributeLastRow(5, 3), [1, 1, 1, 1, 2]);
  assert.deepEqual(distributeLastRow(10, 4), [1, 1, 1, 1, 1, 1, 1, 1, 2, 2]);
  assert.deepEqual(distributeLastRow(7, 4), [1, 1, 1, 1, 1, 1, 2]);
  assert.deepEqual(distributeLastRow(5, 2), [1, 1, 1, 1, 2]);
  assert.deepEqual(distributeLastRow(6, 3), [1, 1, 1, 1, 1, 1]);
});
