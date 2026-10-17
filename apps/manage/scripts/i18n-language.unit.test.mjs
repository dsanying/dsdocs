import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import ts from 'typescript';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime.js';
import { createInstance } from 'i18next';
const requireDependency = createRequire(import.meta.url);
const source = readFileSync(new URL('../src/i18n/index.ts', import.meta.url), 'utf8');
const ast = ts.createSourceFile('index.ts', source, ts.ScriptTarget.Latest, true);
const key = ast.statements.flatMap(node => ts.isVariableStatement(node) ? [...node.declarationList.declarations] : [])
  .find(node => node.name.getText(ast) === 'LANGUAGE_STORAGE_KEY').initializer.text;
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
function load({ stored = 'en-US', blocked = false, server = false } = {}) {
  const instance = createInstance();
  const storage = new Map([[key,stored]]);
  const document = server ? undefined : { documentElement: { lang: 'zh' } };
  const window = server ? undefined : { navigator: { languages: ['en-US'] }, localStorage: {
    getItem(name) { if(blocked) throw new Error('Storage denied'); return storage.get(name) ?? null; },
    setItem(name,value) { if(blocked) throw new Error('Storage denied'); storage.set(name,value); },
  } };
  const module = { exports: {} };
  function requireSource(name) {
    if (name === 'i18next') return instance;
    if (name.startsWith('./locales/')) return JSON.parse(readFileSync(new URL('../src/i18n/'+name,import.meta.url),'utf8'));
    return requireDependency(name);
  }
  new Function('exports','require','window','document',compiled)(module.exports,requireSource,window,document);
  return { i18n:module.exports.default, document, storage };
}
test('Actual module initializes html language from preference and synchronizes every language change',async()=>{
  const runtime=load(); assert.equal(runtime.document.documentElement.lang,'en-US');
  await runtime.i18n.changeLanguage('zh-CN'); assert.equal(runtime.document.documentElement.lang,'zh-CN'); assert.equal(runtime.storage.get(key),'zh-CN');
  await runtime.i18n.changeLanguage('en-US'); assert.equal(runtime.document.documentElement.lang,'en-US'); assert.equal(runtime.storage.get(key),'en-US');
});
test('Unavailable localStorage does not block visible-language metadata',async()=>{
  const runtime=load({blocked:true}); assert.equal(runtime.document.documentElement.lang,'en-US');
  await runtime.i18n.changeLanguage('zh-CN'); assert.equal(runtime.document.documentElement.lang,'zh-CN');
});
test('Actual module remains usable without browser globals',async()=>{
  const runtime=load({server:true}); assert.equal(runtime.i18n.language,'zh-CN');
  await runtime.i18n.changeLanguage('en-US'); assert.equal(runtime.i18n.resolvedLanguage,'en-US');
});

test('Actual i18n owns Dayjs month, weekday and relative language across initialization and switches',async()=>{
  dayjs.extend(relativeTime);
  const runtime=load({stored:'zh-CN'});
  assert.equal(dayjs.locale(),'zh-cn');
  assert.equal(dayjs('2026-10-06').format('MMMM dddd'),'十月 星期二');
  assert.equal(dayjs('2026-10-06T12:00').from(dayjs('2026-10-06T09:00')),'3 小时内');
  const previousChineseValue=dayjs().subtract(3,'hour');
  await runtime.i18n.changeLanguage('en-US');
  assert.equal(dayjs.locale(),'en');
  assert.equal(dayjs('2026-10-06').format('MMMM dddd'),'October Tuesday');
  // 已存在的业务 Dayjs 值必须在展示入口取当前locale，不能冻结创建时语言。
  const timeSource=readFileSync(new URL('../src/utils/dateTime.ts',import.meta.url),'utf8');
  const timeCompiled=ts.transpileModule(timeSource,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText;
  const timeModule={exports:{}};
  new Function('exports','require',timeCompiled)(timeModule.exports,requireDependency);
  assert.match(timeModule.exports.formatRelativeTime(previousChineseValue),/ago/);
  await runtime.i18n.changeLanguage('zh-CN');
  assert.match(timeModule.exports.formatRelativeTime(previousChineseValue),/前/);
  assert.equal(timeModule.exports.toOffsetDateTime(timeModule.exports.parseServerTime('2026-10-06 12:00:00')),'2026-10-06T12:00:00+08:00');
});
