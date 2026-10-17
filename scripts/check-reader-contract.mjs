import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import ts from '../apps/manage/node_modules/typescript/lib/typescript.js';
async function walk(root) {
 const entries=await readdir(root,{withFileTypes:true});
 return (await Promise.all(entries.map(item=>item.isDirectory()?walk(root+'/'+item.name):root+'/'+item.name))).flat();
}
const sources=await walk('apps/reader/src');
const imports=[];
for(const file of sources.filter(name=>/\.tsx?$/.test(name))) {
 const source=ts.createSourceFile(file,await readFile(file,'utf8'),ts.ScriptTarget.Latest,true,file.endsWith('tsx')?ts.ScriptKind.TSX:ts.ScriptKind.TS);
 for(const node of source.statements.filter(ts.isImportDeclaration)) {
  const name=node.moduleSpecifier.text;
  assert(!/^antd(?:\/|$)|@ant-design\/|apps\/manage/.test(name),file+': 读者端不能引入管理端组件');
  imports.push(name);
 }
}
assert(imports.includes('fumadocs-ui/layouts/docs'));
assert(imports.includes('fumadocs-ui/layouts/docs/page'));
assert(imports.includes('fumadocs-ui/provider/next'));
const locale=await readFile('apps/reader/src/app/[lang]/layout.tsx','utf8');
const ast=ts.createSourceFile('layout.tsx',locale,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
let htmlLanguage;
function visit(node) {
 if(ts.isJsxAttribute(node)&&node.name.text==='lang'&&node.parent.parent.tagName.getText(ast)==='html')htmlLanguage=node.initializer;
 ts.forEachChild(node,visit);
}
visit(ast);
assert(htmlLanguage&&ts.isJsxExpression(htmlLanguage)&&htmlLanguage.expression.getText(ast)==='lang','语言路由必须在服务端设置 html lang');
assert(locale.includes('notFound()'),'未知语言必须拒绝');
console.log('读者原生组件边界与服务端语言契约通过');
