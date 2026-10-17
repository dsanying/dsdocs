import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
const runner = new URL('./run-runtime.mjs', import.meta.url).pathname;
function execute(mode, extra = [], env = {}) {
  const cwd = mkdtempSync(path.join(os.tmpdir(), 'runtime-entry-'));
  try {
    for (const file of ['node_modules/vite/bin/vite.js', 'node_modules/@playwright/test/cli.js']) {
      mkdirSync(path.dirname(path.join(cwd,file)), {recursive:true});
      writeFileSync(path.join(cwd,file), `process.stdout.write(JSON.stringify({args:process.argv.slice(2),test:process.env.FRONTEND_UI_TEST,full:process.env.FRONTEND_UI_FULL,port:process.env.FRONTEND_UI_PORT}));process.exit(Number(process.env.FIXTURE_EXIT||0));`);
    }
    return spawnSync(process.execPath,[runner,mode,...extra],{cwd,env:{...process.env,...env},encoding:'utf8'});
  } finally { rmSync(cwd,{recursive:true,force:true}); }
}
test('UI build sets real child environment and forwards arguments without a shell',()=>{
  const result=execute('build-ui',['--base','/track/'],{FRONTEND_UI_TEST:'0',FRONTEND_UI_PORT:'4567'});
  assert.equal(result.status,0); const output=JSON.parse(result.stdout);
  assert.equal(output.test,'1'); assert.equal(output.port,'4567');
  assert.deepEqual(output.args,['build','--outDir','.playwright/app','--base','/track/']);
});
test('UI project and full mode reach the actual child CLI',()=>{
  assert.deepEqual(JSON.parse(execute('ui').stdout).args,['test','--project=chromium']);
  const result=execute('ui-full',['--project=firefox']); const output=JSON.parse(result.stdout);
  assert.equal(output.full,'1'); assert.deepEqual(output.args,['test','--project=firefox']);
});
test('Runtime entry preserves child failure and rejects unknown modes',()=>{
  assert.equal(execute('ui',[],{FIXTURE_EXIT:'7'}).status,7);
  assert.notEqual(execute('unsupported').status,0);
});
