import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { auditAntRuntime } from "./check-runtime-patches.mjs";

const fixtureFiles = { util: ["es/Dom/focus.js", "lib/Dom/focus.js"], drawer: ["es/Drawer.js", "lib/Drawer.js"], picker: ["es/PickerTrigger/index.js", "lib/PickerTrigger/index.js"] };
const versions = { util: "1.13.0", drawer: "1.4.2", picker: "1.12.2" };
const expected = Object.fromEntries(Object.entries(fixtureFiles).map(([name, files]) => [name, {version: versions[name], files: Object.fromEntries(files.map(file => [file, createHash("sha256").update(name + file).digest("hex")]))}]));
function fixture(run) {
  const root = mkdtempSync(path.join(tmpdir(), "dsanying-ant-runtime-"));
  try {
    writeFileSync(path.join(root, "package.json"), "{}");
    const ant = path.join(root, "node_modules/antd");
    const drawer = path.join(ant, "node_modules/@rc-component/drawer");
    const util = path.join(drawer, "node_modules/@rc-component/util");
    const picker = path.join(ant, "node_modules/@rc-component/picker");
    mkdirSync(ant, {recursive:true});writeFileSync(path.join(ant,"package.json"),JSON.stringify({name:"antd",version:"6.6.5"}));
    const packages={drawer,util,picker};
    for (const [name, folder] of Object.entries(packages)) {
      mkdirSync(folder,{recursive:true});writeFileSync(path.join(folder,"package.json"),JSON.stringify({name:"@rc-component/"+name,version:versions[name],...(name==="picker"?{exports:"./lib/index.js"}:{})}));
      for(const file of fixtureFiles[name]) {const target=path.join(folder,file);mkdirSync(path.dirname(target),{recursive:true});writeFileSync(target,name+file);}
    }
    writeFileSync(path.join(picker,"lib/index.js"),"");
    run(root, packages);
  } finally { rmSync(root, {recursive:true,force:true}); }
}
test("运行时审计沿真实 Ant 依赖闭包，三个补丁 ES/CJS 完整才通过", () => fixture(root => {assert.deepEqual(auditAntRuntime(root,expected),[]);}));
test("存在未使用的修复版本不能掩盖 Drawer 仍解析旧 util", () => fixture((root,{util}) => {
  const unused=path.join(root,"node_modules/@rc-component/util");mkdirSync(unused,{recursive:true});writeFileSync(path.join(unused,"package.json"),JSON.stringify({name:"@rc-component/util",version:"1.13.0"}));
  writeFileSync(path.join(util,"package.json"),JSON.stringify({name:"@rc-component/util",version:"1.12.0"}));
  assert.match(auditAntRuntime(root,expected).join("\n"),/实际解析 util 1.12.0/);
}));
test("util CJS 漏修或依赖缺失均明确失败，不因 ES 已修而通过", () => fixture((root,{util}) => {
  writeFileSync(path.join(util,"lib/Dom/focus.js"),"unfixed");assert.match(auditAntRuntime(root,expected).join("\n"),/lib\/Dom\/focus.js/);
  rmSync(path.join(util,"package.json"));assert.match(auditAntRuntime(root,expected).join("\n"),/依赖不完整/);
}));
test("Drawer 初次动画生命周期漏修不能被 util 焦点补丁掩盖", () => fixture((root,{drawer}) => {
  writeFileSync(path.join(drawer,"lib/Drawer.js"),"unfixed");assert.match(auditAntRuntime(root,expected).join("\n"),/drawer.*lib\/Drawer.js/);
}));
test("Picker 以公开入口解析，任一格式定位补丁缺失明确失败", () => fixture((root,{picker}) => {
  writeFileSync(path.join(picker,"es/PickerTrigger/index.js"),"unfixed");assert.match(auditAntRuntime(root,expected).join("\n"),/picker.*es\/PickerTrigger\/index.js/);
}));
