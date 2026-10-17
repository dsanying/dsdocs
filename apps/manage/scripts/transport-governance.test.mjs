import assert from "node:assert/strict";
import test from "node:test";
import ts from "typescript";
import { inspectTransportModules, isTransportModule, isVisibleSerializer, serializerBindings } from "./transport-governance.mjs";
const entry={module:"src/services/dateWire.ts",imports:["@/services/dateWire"],contract:"docs/规范/前端.md",reason:"后端按无偏移日期接受请求",serializers:["serializeApiDate"],parsers:["parseApiDate"]};
const context={exists:(p)=>[entry.module,entry.contract].includes(p),read:(p)=>p===entry.module?"export const serializeApiDate=(v)=>v.format('YYYY-MM-DD'); export const parseApiDate=(v)=>dayjs(v);":"传输日期 YYYY-MM-DD 按后端契约保持。"};
test("纯传输边界保留既有格式，真实导出与契约双向验证",()=>{
  assert.deepEqual(inspectTransportModules([entry],context),[]);
  assert.equal(isTransportModule("/repo/"+entry.module,[entry]),true);
  assert.equal(isTransportModule("/repo/src/pages/X.tsx",[entry]),false);
});
test("拒绝无契约、虚构导出、漏格式、UI混入与重复边界",()=>{
  assert.ok(inspectTransportModules([{...entry,serializers:["fake"]}],context).length>0);
  assert.ok(inspectTransportModules([entry,entry],context).length>0);
  assert.ok(inspectTransportModules([entry],{...context,read:(p)=>p===entry.contract?"无格式":context.read(p)}).length>0);
  assert.ok(inspectTransportModules([entry],{...context,read:(p)=>p===entry.module?context.read(p)+"; const ui=<span/>":context.read(p)}).length>0);
});
test("别名序列化器不能用于可见文字/日期控件格式，事件提交和解析允许",()=>{
 const src="import { serializeApiDate as wire, parseApiDate } from '@/services/dateWire'; <><span>{wire(date)}</span><Toolbar currentDisabled={month===wire(date)}/><Calendar fullCellRender={renderCell(date,{inMonth:wire(date)===month})}/><DatePicker format={wire} value={parseApiDate(value)} onChange={v=>submit(wire(v))}/></>";
 const ast=ts.createSourceFile("Page.tsx",src,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX),names=serializerBindings(ast,[entry]);
 let hits=0;function visit(n){if(isVisibleSerializer(n,names))hits++;ts.forEachChild(n,visit)}visit(ast);
 assert.equal(hits,2);
});
