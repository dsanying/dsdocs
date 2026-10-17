import path from 'node:path';
import { readFileSync } from 'node:fs';
const project = JSON.parse(readFileSync(new URL('./design-system.project.json', import.meta.url), 'utf8'));
import ts from 'typescript';

const unwrap = n => n && (ts.isParenthesizedExpression(n) || ts.isAsExpression(n) || ts.isSatisfiesExpression(n)) ? unwrap(n.expression) : n;
const str = n => { n = unwrap(n); return n && ts.isStringLiteral(n) ? n.text : undefined; };
const walk = (n, fn) => { fn(n); ts.forEachChild(n, c => walk(c, fn)); };
const prop = (n, key) => n?.properties?.find(p => ts.isPropertyAssignment(p) && p.name.getText().replace(/["']/g, '') === key)?.initializer;
const attr = (n, key) => { const a = n.attributes.properties.find(p => ts.isJsxAttribute(p) && p.name.getText() === key); return a?.initializer && (ts.isJsxExpression(a.initializer) ? a.initializer.expression : a.initializer); };

/** 静态追踪实际 columns 的导入、构造函数、数组及 useMemo；动态分支的最终列存在性仍由共享运行时核对。 */
export function inspectTableOrdering(sources, { externalFixedOrderTables = project.externalFixedOrderTables ?? [] } = {}) {
  const docs = new Map(sources.filter(s => /\.tsx?$/.test(s.filename)).map(s => {
    const file = s.filename.replace(/^\//, '').replace(/\\/g, '/');
    const ast = ts.createSourceFile(file, s.source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    const imports = new Map();
    for (const node of ast.statements) {
      if (!ts.isImportDeclaration(node) || !ts.isStringLiteral(node.moduleSpecifier)) continue;
      const module = node.moduleSpecifier.text, clause = node.importClause;
      if (clause?.name) imports.set(clause.name.text, { module, name: 'default' });
      if (clause?.namedBindings && ts.isNamedImports(clause.namedBindings)) for (const p of clause.namedBindings.elements) imports.set(p.name.text, { module, name: (p.propertyName ?? p.name).text });
      if (clause?.namedBindings && ts.isNamespaceImport(clause.namedBindings)) imports.set(clause.namedBindings.name.text, { module, namespace: true });
    }
    return [file, { ...s, file, ast, imports }];
  }));
  const issues = [];
  const validatedExternalPages = new Set();
  const report = (d, n, message) => issues.push({ filename: d.file, line: d.ast.getLineAndCharacterOfPosition(n.getStart()).line + 1, rule: 'FRONTEND-TABLE', message });
  const resolveFile = (d, module) => {
    const base = module.startsWith('@/') ? `src/${module.slice(2)}` : module ? path.posix.normalize(path.posix.join(path.posix.dirname(d.file), module)) : d.file;
    return [base, `${base}.tsx`, `${base}.ts`, `${base}/index.tsx`, `${base}/index.ts`].find(f => docs.has(f));
  };
  const declarations = (d, name, at) => {
    let scope = at;
    while (scope) {
      const found = [];
      walk(scope, n => {
        if ((ts.isVariableDeclaration(n) || ts.isFunctionDeclaration(n)) && n.name?.getText() === name) found.push(n);
      });
      if (found.length === 1) return found[0];
      scope = scope.parent;
    }
  };
  const project = (d, input, key, seen = new Set()) => {
    const n = unwrap(input);
    if (!n || seen.has(n)) return [];
    seen = new Set([...seen, n]);
    if (ts.isIdentifier(n)) {
      const imported = d.imports.get(n.text);
      if (imported) {
        const target = docs.get(resolveFile(d, imported.module));
        if (!target) return [];
        let found;
        walk(target.ast, x => { if ((ts.isFunctionDeclaration(x) || ts.isVariableDeclaration(x)) && x.name?.getText() === imported.name) found = x; });
        return project(target, found, key, seen);
      }
      return project(d, declarations(d, n.text, n), key, seen);
    }
    if (ts.isVariableDeclaration(n)) return project(d, n.initializer, key, seen);
    if (ts.isCallExpression(n)) return project(d, n.expression, key, seen);
    if (ts.isFunctionLike(n)) {
      if (!n.body) return [];
      if (!ts.isBlock(n.body)) return project(d, n.body, key, seen);
      const result = [];
      const visit = x => { if (x !== n.body && ts.isFunctionLike(x)) return; if (ts.isReturnStatement(x)) result.push(...project(d, x.expression, key, seen)); else ts.forEachChild(x, visit); };
      visit(n.body);
      return result;
    }
    if (ts.isObjectLiteralExpression(n)) {
      const value = n.properties.find(p => (ts.isPropertyAssignment(p) || ts.isShorthandPropertyAssignment(p)) && p.name.getText() === key);
      return value ? collect(d, ts.isShorthandPropertyAssignment(value) ? value.name : value.initializer, seen) : [];
    }
    return [];
  };
  const collect = (d, input, seen = new Set()) => {
    const n = unwrap(input);
    if (!n || seen.has(n)) return [];
    seen = new Set([...seen, n]);
    if (ts.isIdentifier(n)) {
      const imported = d.imports.get(n.text);
      if (imported) {
        const target = docs.get(resolveFile(d, imported.module));
        if (!target) return [];
        let declaration;
        walk(target.ast, x => {
          if ((ts.isFunctionDeclaration(x) || ts.isVariableDeclaration(x)) && x.name?.getText() === imported.name) declaration = x;
          if (imported.name === 'default' && ts.isExportAssignment(x)) declaration = x.expression;
        });
        return collect(target, declaration, seen);
      }
      const declaration = declarations(d, n.text, n);
      if (declaration) return collect(d, declaration, seen);
      let binding;
      walk(d.ast, x => { if (ts.isBindingElement(x) && x.name.getText() === n.text) binding = x; });
      if (binding && ts.isObjectBindingPattern(binding.parent) && ts.isVariableDeclaration(binding.parent.parent)) return project(d, binding.parent.parent.initializer, (binding.propertyName ?? binding.name).getText(), seen);
      return [];
    }
    if (ts.isVariableDeclaration(n)) return collect(d, n.initializer, seen);
    if (ts.isFunctionDeclaration(n) || ts.isArrowFunction(n) || ts.isFunctionExpression(n)) {
      if (!n.body) return [];
      if (!ts.isBlock(n.body)) return collect(d, n.body, seen);
      const values = [];
      const visit = x => {
        if (x !== n.body && ts.isFunctionLike(x)) return;
        if (ts.isReturnStatement(x)) values.push(...collect(d, x.expression, seen));
        else ts.forEachChild(x, visit);
      };
      visit(n.body);
      return values;
    }
    if (ts.isCallExpression(n)) {
      if (ts.isPropertyAccessExpression(n.expression) && ['filter', 'slice'].includes(n.expression.name.text)) return collect(d, n.expression.expression, seen);
      if (ts.isIdentifier(n.expression) && (n.expression.text === 'useMemo' || d.imports.get(n.expression.text)?.name === 'useMemo')) return collect(d, n.arguments[0], seen);
      return collect(d, n.expression, seen);
    }
    if (ts.isConditionalExpression(n)) return [...collect(d, n.whenTrue, seen), ...collect(d, n.whenFalse, seen)];
    if (ts.isArrayLiteralExpression(n)) return n.elements.flatMap(x => collect(d, ts.isSpreadElement(x) ? x.expression : x, seen));
    if (ts.isObjectLiteralExpression(n)) {
      const children = prop(n, 'children');
      if (children) return collect(d, children, seen);
      const key = str(prop(n, 'dataIndex')) ?? str(prop(n, 'key'));
      return key && prop(n, 'title') ? [{ key, file: d.file, action: key === 'actions' || key === 'action' || !!prop(n, 'actionCount') }] : [];
    }
    return [];
  };
  const tableComponent = (d, text, at, seen = new Set()) => {
    if (seen.has(text)) return;
    seen = new Set([...seen, text]);
    const tags = text.split('.'), imported = d.imports.get(tags[0]);
    if (imported?.module === '@/components/ui') {
      // 命名导入的成员访问（Table.Summary 等）不是表格本体，只有命名空间导入才解析第二段。
      if (tags.length > 1 && !imported.namespace) return undefined;
      return imported.namespace ? tags[1] : imported.name;
    }
    const declaration = declarations(d, tags[0], at);
    if (declaration && ts.isVariableDeclaration(declaration) && declaration.initializer) return tableComponent(d, unwrap(declaration.initializer).getText(), declaration, seen);
  };
  for (const d of docs.values()) {
    if (d.file.startsWith('src/components/ui/') || !d.file.startsWith('src/')) continue;
    walk(d.ast, n => {
      if (ts.isPropertyAssignment(n) && ['sorter', 'defaultSortOrder', 'sortOrder'].includes(n.name.getText().replace(/["']/g, ''))) {
        // 后端请求 sortOrder 不属于列排序配置。
        const owner = n.parent;
        if (prop(owner, 'title') && (prop(owner, 'dataIndex') || prop(owner, 'key'))) report(d, n, '业务列禁止自设 sorter/defaultSortOrder/sortOrder，统一通过 DataTable ordering 声明');
      }
      if (!ts.isJsxOpeningElement(n) && !ts.isJsxSelfClosingElement(n)) return;
      const component = tableComponent(d, n.tagName.getText(), n);
      if (!['DataTable', 'Table'].includes(component)) return;
      if (n.attributes.properties.some(ts.isJsxSpreadAttribute)) report(d, n, '表格禁止 JSX spread 绕过排序契约');
      if (component === 'Table') {
        if (!attr(n, 'orderBy') && !attr(n, 'sortable') && str(attr(n, 'order')) !== 'given') report(d, n, 'Table 必须声明 orderBy / sortable / order="given"，分页不能豁免');
        if (str(attr(n, 'order')) === 'given') {
          const a = n.attributes.properties.find(p => ts.isJsxAttribute(p) && p.name.getText() === 'order');
          if (!/\/\/[^\n]+|\/\*[\s\S]+?\*\//.test(d.source.slice(a.getFullStart(), a.getStart()))) report(d, a, 'order="given" 必须在属性前注释保留业务顺序的原因');
        }
        return;
      }
      const ordering = unwrap(attr(n, 'ordering'));
      if (!ordering || !ts.isObjectLiteralExpression(ordering) || ordering.properties.some(p => !ts.isPropertyAssignment(p))) { report(d, n, 'DataTable 必须使用内联静态 ordering 契约，禁止动态对象和 spread'); return; }
      const binding = str(prop(ordering, 'column')), order = str(prop(ordering, 'order')), reason = str(prop(ordering, 'reason'));
      if (!['ascend', 'descend'].includes(order)) report(d, n, 'ordering.order 只接受 ascend / descend');
      if (!reason?.trim()) report(d, n, 'ordering.reason 必须说明排序用途和不开放列的原因');
      const interactive = unwrap(prop(ordering, 'interactive'));
      if (!interactive || !ts.isArrayLiteralExpression(interactive) || interactive.elements.some(x => str(x) === undefined)) report(d, n, 'ordering.interactive 必须是静态字段数组');
      const fields = interactive && ts.isArrayLiteralExpression(interactive) ? interactive.elements.map(str) : [];
      if (new Set(fields).size !== fields.length) report(d, n, 'ordering.interactive 不得重复');
      const contract = externalFixedOrderTables.find(item => item.page === d.file);
      if (contract) {
        validatedExternalPages.add(d.file);
        const validMetadata = contract.field === 'id' && contract.order === 'descend' && contract.interactive === false && contract.reason?.trim() && contract.endpoint?.startsWith('/api/');
        if (!validMetadata || binding !== `${path.posix.relative(path.posix.dirname(d.file), contract.columns).replace(/\.tsx?$/, '').replace(/^(?!\.)/, './')}#id` || order !== 'descend' || fields.length !== 0) report(d, n, '外部固定排序契约必须展示登记的 ID 列、默认倒序且禁止主动排序');
        const service = docs.get(contract.service);
        let realEndpoint = false, realCaller = false;
        if (service) walk(service.ast, x => {
          if (ts.isFunctionDeclaration(x) && x.name?.text === contract.request && x.body) walk(x.body, call => {
            if (ts.isCallExpression(call) && call.expression.getText() === 'request' && str(call.arguments[0]) === contract.endpoint) realEndpoint = true;
          });
        });
        walk(d.ast, x => {
          if (!ts.isCallExpression(x) || !ts.isIdentifier(x.expression)) return;
          const imported = d.imports.get(x.expression.text);
          if (imported?.name === contract.request && resolveFile(d, imported.module) === contract.service) realCaller = true;
        });
        if (!realEndpoint || !realCaller) report(d, n, '外部固定排序登记必须绑定该页面真实调用的服务函数和 endpoint，不能只登记原因绕过');
      }
      const actual = collect(d, attr(n, 'columns'));
      if (!actual.length) { report(d, n, '无法静态解析实际 DataTable.columns，请使用真实列数组或可追踪构造函数'); return; }
      const parts = binding?.split('#'), file = parts?.length === 2 && resolveFile(d, parts[0]), key = parts?.[1];
      const base = actual.find(c => c.file === file && c.key === key);
      if (!base || base.action) report(d, n, `默认排序 ${binding ?? '(缺失)'} 必须绑定实际传入 columns 的非操作列，不能借用同文件其他表列`);
      for (const field of fields) {
        const column = actual.find(c => c.file === file && c.key === field);
        if (!column || column.action) report(d, n, `主动排序 ${field} 必须绑定实际列且不能为操作列`);
      }
    });
  }
  for (const contract of externalFixedOrderTables) {
    const doc = docs.get(contract.page);
    if (doc && !validatedExternalPages.has(contract.page)) report(doc, doc.ast, '登记外部固定排序页面必须由真实 DataTable ordering 核对，不能替换组件绕过');
  }
  return issues;
}
