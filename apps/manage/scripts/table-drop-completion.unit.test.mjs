import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import ts from "typescript";
import { DragDropManager, Plugin } from "@dnd-kit/abstract";

// 执行真实组件的插件与结束处理器；仅隔离 React 渲染和顺序规划，不重写生命周期规则。
const text = readFileSync(new URL("../src/components/ui/Table.tsx", import.meta.url), "utf8");
const source = ts.createSourceFile("Table.tsx", text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const plugin = source.statements.find(node => ts.isClassDeclaration(node) && node.name?.text === "TableDropCompletion");
let handler;
const visit = node => {
  if (ts.isVariableDeclaration(node) && node.name.getText(source) === "handleDragEnd") handler = node.initializer;
  ts.forEachChild(node, visit);
};
visit(source);
assert.ok(plugin && handler);
const compiled = ts.transpileModule(`${plugin.getText(source)}\nreturn { TableDropCompletion, handler: ${handler.getText(source)} };`, { compilerOptions: { target: ts.ScriptTarget.ESNext, module: ts.ModuleKind.ESNext } }).outputText;
const flush = () => new Promise(resolve => queueMicrotask(resolve));
// Node 没有 rAF：测试桩同步执行回调并记录队列，destroy 取消待执行帧的行为仍被真实覆盖。
function setup() {
  const calls = [];
  const raf = [];
  const rows = [{ id: "alpha" }, { id: "beta" }];
  Object.assign(globalThis, {
    requestAnimationFrame: (fn) => (raf.push(fn), fn(), raf.length),
    cancelAnimationFrame: () => {},
  });
  const factory = new Function("Plugin", "move", "keys", "rows", "sortable", "setDraggingAttribute", "setLocalOrder", "dataSource", "sortableRootRef", "CANCEL_ZONE_ID", "props", "sortablePagination", "sortablePageRef", compiled);
  const { TableDropCompletion, handler } = factory(Plugin, keys => [...keys].reverse(), ["alpha", "beta"], rows, { onMove: (...args) => calls.push(args) }, () => {}, () => {}, rows, { current: { querySelectorAll: () => [] } }, "ds-table-cancel-zone", { pagination: false }, undefined, { current: { current: 1, pageSize: 10 } });
  const manager = new DragDropManager({ plugins: [TableDropCompletion], sensors: [] });
  return { calls, handler, manager, completion: manager.registry.plugins.get(TableDropCompletion), rows };
}
const moved = { canceled: false, operation: { source: { id: "alpha", initialIndex: 0, index: 1 }, target: { id: "beta" } } };

test("结束处理器等待官方 idle，重复 idle 只提交一次", async () => {
  const x = setup();
  x.manager.dragOperation.status.set("dragging");
  x.handler(moved, x.manager);
  x.manager.dragOperation.status.set("dropped");
  await flush();
  assert.deepEqual(x.calls, []);
  x.manager.dragOperation.status.set("idle");
  await flush();
  assert.deepEqual(x.calls, [[x.rows[0], 0, 1]]);
  x.manager.dragOperation.status.set("dropped");
  x.manager.dragOperation.status.set("idle");
  await flush();
  assert.equal(x.calls.length, 1);
  x.completion.destroy();
});

test("取消及取消区不写入，缺插件不得静默放行", async () => {
  const x = setup();
  x.manager.dragOperation.status.set("dragging");
  x.handler({ ...moved, canceled: true }, x.manager);
  x.handler({ ...moved, operation: { ...moved.operation, target: { id: "ds-table-cancel-zone" } } }, x.manager);
  x.manager.dragOperation.status.set("idle");
  await flush();
  assert.deepEqual(x.calls, []);
  assert.throws(() => x.handler(moved, new DragDropManager({ plugins: [], sensors: [] })), /not registered/);
  x.completion.destroy();
});

test("无动画或已 idle 登记仍只执行一次", async () => {
  const x = setup();
  x.handler(moved, x.manager);
  await flush();
  assert.equal(x.calls.length, 1);
  x.manager.dragOperation.status.set("idle");
  await flush();
  assert.equal(x.calls.length, 1);
  x.completion.destroy();
});

test("卸载清除待落位及已经排队的提交", async () => {
  for (const queued of [false, true]) {
    const x = setup();
    x.manager.dragOperation.status.set("dragging");
    x.handler(moved, x.manager);
    if (queued) x.manager.dragOperation.status.set("idle");
    x.completion.destroy();
    x.manager.dragOperation.status.set("idle");
    await flush();
    assert.deepEqual(x.calls, []);
  }
});
