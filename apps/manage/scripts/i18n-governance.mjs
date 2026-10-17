import ts from "typescript";
import { findOccurrences, isAtomCandidate, isLatinLocale, nestedReferences, resolveNested, segmentValue } from "./i18n-nesting.mjs";

export function flattenCatalog(value, prefix = "", output = new Map()) {
  for (const [name, child] of Object.entries(value ?? {})) {
    const key = prefix ? `${prefix}.${name}` : name;
    if (child && typeof child === "object" && !Array.isArray(child)) {
      flattenCatalog(child, key, output);
    } else {
      output.set(key, child);
    }
  }
  return output;
}

function valueType(value) {
  return Array.isArray(value) ? "array" : value === null ? "null" : typeof value;
}

function interpolationNameList(value) {
  return [...new Set([...String(value ?? "").matchAll(/\{([A-Za-z_$][\w$]*)\}/g)].map((match) => match[1]))].sort();
}

function interpolationNames(value) {
  return interpolationNameList(value).join(",");
}

function unwrapExpression(node) {
  let current = node;
  while (current && (ts.isParenthesizedExpression(current)
    || ts.isAsExpression(current)
    || ts.isTypeAssertionExpression(current)
    || ts.isSatisfiesExpression(current)
    || ts.isNonNullExpression(current))) current = current.expression;
  return current;
}

function literalValues(node) {
  if (!node) return [];
  if (ts.isStringLiteralLike(node)) return [node.text];
  if (ts.isParenthesizedExpression(node)) return literalValues(node.expression);
  if (ts.isConditionalExpression(node)) {
    const whenTrue = literalValues(node.whenTrue);
    const whenFalse = literalValues(node.whenFalse);
    return whenTrue.length && whenFalse.length ? [...new Set([...whenTrue, ...whenFalse])] : [];
  }
  if (ts.isJsxExpression(node)) return literalValues(node.expression);
  return [];
}

function propertyName(node, sourceFile) {
  if (ts.isIdentifier(node.name) || ts.isStringLiteralLike(node.name)) return node.name.text;
  if (ts.isComputedPropertyName(node.name) && ts.isStringLiteralLike(unwrapExpression(node.name.expression))) {
    return unwrapExpression(node.name.expression).text;
  }
  return node.name.getText(sourceFile).replaceAll(/["']/g, "");
}

function bindingScope(owner) {
  if (ts.isParameter(owner)) return owner.parent;
  if (ts.isVariableDeclaration(owner)) {
    if (ts.isCatchClause(owner.parent)) return owner.parent;
    const declarationList = ts.isVariableDeclarationList(owner.parent) ? owner.parent : undefined;
    const blockScoped = declarationList && (declarationList.flags & ts.NodeFlags.BlockScoped) !== 0;
    let current = owner.parent;
    while (current) {
      if (blockScoped
        ? ts.isBlock(current) || ts.isSourceFile(current) || ts.isCaseBlock(current) || ts.isForStatement(current) || ts.isForInStatement(current) || ts.isForOfStatement(current)
        : ts.isFunctionLike(current) || ts.isSourceFile(current)) return current;
      current = current.parent;
    }
  }
  if (ts.isFunctionExpression(owner) || ts.isClassExpression(owner)) return owner;
  return owner.parent;
}

function collectDeclarations(sourceFile) {
  const declarations = [];
  function addBinding(name, owner, bindingProperty) {
    if (ts.isIdentifier(name)) {
      declarations.push({ bindingProperty, name: name.text, node: name, owner, scope: bindingScope(owner) });
      return;
    }
    if (ts.isObjectBindingPattern(name) || ts.isArrayBindingPattern(name)) {
      for (const element of name.elements) {
        if (!ts.isBindingElement(element)) continue;
        const property = ts.isObjectBindingPattern(name)
          ? (element.propertyName ?? element.name).getText(sourceFile).replaceAll(/["']/g, "")
          : undefined;
        addBinding(element.name, owner, property);
      }
    }
  }
  for (const statement of sourceFile.statements) {
    if (!ts.isImportDeclaration(statement) || !statement.importClause || !ts.isStringLiteral(statement.moduleSpecifier)) continue;
    const moduleName = statement.moduleSpecifier.text;
    if (statement.importClause.name) declarations.push({ imported: "default", moduleName, name: statement.importClause.name.text, node: statement.importClause.name, owner: statement, scope: sourceFile });
    const named = statement.importClause.namedBindings;
    if (named && ts.isNamedImports(named)) for (const element of named.elements) {
      declarations.push({ imported: (element.propertyName ?? element.name).text, moduleName, name: element.name.text, node: element.name, owner: element, scope: sourceFile });
    }
    if (named && ts.isNamespaceImport(named)) {
      declarations.push({ imported: "*", moduleName, name: named.name.text, node: named.name, owner: named, scope: sourceFile });
    }
  }
  function visit(node) {
    if (ts.isVariableDeclaration(node) || ts.isParameter(node)) addBinding(node.name, node);
    if ((ts.isFunctionDeclaration(node) || ts.isFunctionExpression(node) || ts.isClassDeclaration(node) || ts.isClassExpression(node)) && node.name) addBinding(node.name, node);
    ts.forEachChild(node, visit);
  }
  visit(sourceFile);
  return declarations.filter((declaration) => declaration.scope);
}

function resolveBindings(sourceFile) {
  const declarations = collectDeclarations(sourceFile);
  const translationBindings = new Set();
  const forwardingCalls = new Set();
  const translatorFunctionTypes = new Set();
  const translatorPropTypes = new Set();
  // i18next 的 TFunction（值导入或 type 导入）本身就是翻译函数契约
  const importedTFunctionNames = new Set();
  for (const statement of sourceFile.statements) {
    if (!ts.isImportDeclaration(statement) || !ts.isStringLiteral(statement.moduleSpecifier)) continue;
    if (statement.moduleSpecifier.text !== "i18next" && statement.moduleSpecifier.text !== "react-i18next") continue;
    const bindings = statement.importClause?.namedBindings;
    if (!bindings || !ts.isNamedImports(bindings)) continue;
    for (const entry of bindings.elements) if ((entry.propertyName ?? entry.name).text === "TFunction") importedTFunctionNames.add(entry.name.text);
  }
  const isTranslatorTypeNode = (type) => Boolean(type) && (
    (ts.isFunctionTypeNode(type)
      && type.parameters[0]?.type?.kind === ts.SyntaxKind.StringKeyword
      && type.type.kind === ts.SyntaxKind.StringKeyword)
    || (ts.isTypeReferenceNode(type) && ts.isIdentifier(type.typeName)
      && (importedTFunctionNames.has(type.typeName.text) || translatorFunctionTypes.has(type.typeName.text))));
  for (const statement of sourceFile.statements) {
    if (ts.isTypeAliasDeclaration(statement) && isTranslatorTypeNode(statement.type)) translatorFunctionTypes.add(statement.name.text);
  }
  const hasTranslatorMember = (members) => members.some(
    (member) => ts.isPropertySignature(member)
      && member.name
      && propertyName(member, sourceFile) === "t"
      && isTranslatorTypeNode(member.type),
  );
  for (const statement of sourceFile.statements) {
    if (ts.isInterfaceDeclaration(statement) && hasTranslatorMember(statement.members)) translatorPropTypes.add(statement.name.text);
  }
  const resolveIdentifier = (identifier) => declarations
    .filter((declaration) => declaration.name === identifier.text && declaration.scope.pos <= identifier.pos && identifier.end <= declaration.scope.end)
    .sort((left, right) => (left.scope.end - left.scope.pos) - (right.scope.end - right.scope.pos) || (left.imported ? 1 : -1))[0];
  const isImported = (identifier, moduleName, imported) => {
    const declaration = resolveIdentifier(identifier);
    return declaration?.moduleName === moduleName && declaration.imported === imported;
  };
  const isUseTranslationCall = (node) => ts.isCallExpression(node)
    && ts.isIdentifier(node.expression)
    && isImported(node.expression, "react-i18next", "useTranslation");
  // 双语内容种子入口 bilingualText(key)：与 t 一样以字面 key 取字典值
  const isBilingualSeedIdentifier = (node) => {
    if (!node || !ts.isIdentifier(node)) return false;
    const declaration = resolveIdentifier(node);
    return declaration?.imported === "bilingualText" && /(?:^|\/)i18n\/bilingual$/.test(declaration.moduleName ?? "");
  };
  // 片段入口 tFragment(key)：跳过句首大写，只能作为其它翻译调用的插值参数
  const isFragmentIdentifier = (node) => {
    if (!node || !ts.isIdentifier(node)) return false;
    const declaration = resolveIdentifier(node);
    return declaration?.imported === "tFragment" && /(?:^|\/)i18n$/.test(declaration.moduleName ?? "");
  };
  const isTranslationIdentifier = (node) => Boolean(node && ts.isIdentifier(node)
    && (translationBindings.has(resolveIdentifier(node)?.node) || isBilingualSeedIdentifier(node) || isFragmentIdentifier(node)));
  const isI18nObject = (node) => {
    if (!ts.isIdentifier(node)) return false;
    const declaration = resolveIdentifier(node);
    return declaration?.imported === "default" && /(?:^|\/)i18n$/.test(declaration.moduleName ?? "");
  };
  const isTranslationCallLocal = (node) => {
    if (!ts.isCallExpression(node)) return false;
    if (isTranslationIdentifier(node.expression)) return true;
    if (!ts.isPropertyAccessExpression(node.expression) || node.expression.name.text !== "t") return false;
    return isI18nObject(node.expression.expression) || isUseTranslationCall(node.expression.expression);
  };
  const functionFromInitializer = (initializer) => {
    if (ts.isArrowFunction(initializer) || ts.isFunctionExpression(initializer)) return initializer;
    if (ts.isCallExpression(initializer) && initializer.arguments[0]
      && (ts.isArrowFunction(initializer.arguments[0]) || ts.isFunctionExpression(initializer.arguments[0]))) return initializer.arguments[0];
    return undefined;
  };
  const declarationForOwner = (owner, bindingProperty) => declarations.find(
    (declaration) => declaration.owner === owner && (bindingProperty === undefined || declaration.bindingProperty === bindingProperty),
  );
  const isTranslatorPropsType = (node) => {
    if (!node) return false;
    // 参数内联对象与 React.FC 的内联 props 复用相同的翻译成员契约。
    const target = ts.isTypeReferenceNode(node) ? node.typeArguments?.[0] ?? node : node;
    if (ts.isTypeLiteralNode(target)) return hasTranslatorMember(target.members);
    return ts.isTypeReferenceNode(target) && ts.isIdentifier(target.typeName)
      && translatorPropTypes.has(target.typeName.text);
  };
  const isRecognizedTranslatorProp = (declaration) => {
    if (!ts.isParameter(declaration.owner)) return false;
    const parameter = declaration.owner;
    // 直接以 TFunction 为类型的参数（如 label(t: TFunction, code)）同样是翻译函数
    if (declaration.name === "t" && !declaration.bindingProperty && ts.isIdentifier(parameter.name) && isTranslatorTypeNode(parameter.type)) return true;
    if (declaration.bindingProperty !== "t") return false;
    if (isTranslatorPropsType(parameter.type)) return true;
    const callable = parameter.parent;
    const variable = (ts.isArrowFunction(callable) || ts.isFunctionExpression(callable)) && ts.isVariableDeclaration(callable.parent)
      ? callable.parent
      : undefined;
    return isTranslatorPropsType(variable?.type);
  };
  const isConstVariable = (declaration) => ts.isVariableDeclaration(declaration?.owner)
    && ts.isVariableDeclarationList(declaration.owner.parent)
    && (declaration.owner.parent.flags & ts.NodeFlags.Const) !== 0;
  const isAntNamespace = (identifier, seen = new Set()) => {
    if (!ts.isIdentifier(identifier)) return false;
    const declaration = resolveIdentifier(identifier);
    if (!declaration || seen.has(declaration.node)) return false;
    if (declaration.moduleName === "antd" && declaration.imported === "*") return true;
    if (!isConstVariable(declaration) || !declaration.owner.initializer) return false;
    return isAntNamespace(unwrapExpression(declaration.owner.initializer), new Set(seen).add(declaration.node));
  };
  const isAntButton = (node, seen = new Set()) => {
    const value = unwrapExpression(node);
    if (ts.isPropertyAccessExpression(value) && value.name.text === "Button") return isAntNamespace(value.expression, seen);
    if (ts.isElementAccessExpression(value) && ts.isStringLiteralLike(unwrapExpression(value.argumentExpression))
      && unwrapExpression(value.argumentExpression).text === "Button") return isAntNamespace(value.expression, seen);
    if (!ts.isIdentifier(value)) return false;
    const declaration = resolveIdentifier(value);
    if (!declaration || seen.has(declaration.node)) return false;
    if (declaration.moduleName === "antd" && declaration.imported === "Button") return true;
    if (!isConstVariable(declaration)) return false;
    if (declaration.bindingProperty === "Button" && declaration.owner.initializer) {
      return isAntNamespace(unwrapExpression(declaration.owner.initializer), new Set(seen).add(declaration.node));
    }
    if (declaration.owner.initializer) return isAntButton(declaration.owner.initializer, new Set(seen).add(declaration.node));
    return false;
  };
  const isAntMessageObject = (node, seen = new Set()) => {
    const value = unwrapExpression(node);
    if (ts.isPropertyAccessExpression(value) && value.name.text === "message") {
      return isAntNamespace(value.expression, seen);
    }
    if (ts.isElementAccessExpression(value)
      && ts.isStringLiteralLike(unwrapExpression(value.argumentExpression))
      && unwrapExpression(value.argumentExpression).text === "message") {
      return isAntNamespace(value.expression, seen);
    }
    if (!ts.isIdentifier(value)) return false;
    const declaration = resolveIdentifier(value);
    if (!declaration || seen.has(declaration.node)) return false;
    if ((declaration.moduleName === "antd" || declaration.moduleName === "@/utils/antdStatic")
      && declaration.imported === "message") return true;
    if (!isConstVariable(declaration) || !declaration.owner.initializer) return false;
    return isAntMessageObject(
      declaration.owner.initializer,
      new Set(seen).add(declaration.node),
    );
  };
  const isAntApp = (node, seen = new Set()) => {
    const value = unwrapExpression(node);
    if (ts.isPropertyAccessExpression(value) && value.name.text === "App") {
      return isAntNamespace(value.expression, seen);
    }
    if (ts.isElementAccessExpression(value)
      && ts.isStringLiteralLike(unwrapExpression(value.argumentExpression))
      && unwrapExpression(value.argumentExpression).text === "App") {
      return isAntNamespace(value.expression, seen);
    }
    if (!ts.isIdentifier(value)) return false;
    const declaration = resolveIdentifier(value);
    if (!declaration || seen.has(declaration.node)) return false;
    if (declaration.moduleName === "antd" && declaration.imported === "App") return true;
    if (!isConstVariable(declaration) || !declaration.owner.initializer) return false;
    return isAntApp(declaration.owner.initializer, new Set(seen).add(declaration.node));
  };
  const isAntMessageHookCall = (node) => {
    const value = unwrapExpression(node);
    return ts.isCallExpression(value)
      && ts.isPropertyAccessExpression(value.expression)
      && value.expression.name.text === "useMessage"
      && isAntMessageObject(value.expression.expression);
  };
  const isAntMessageInstance = (node, seen = new Set()) => {
    const value = unwrapExpression(node);
    if (!ts.isIdentifier(value)) return false;
    const declaration = resolveIdentifier(value);
    if (!declaration || seen.has(declaration.node) || !isConstVariable(declaration)) return false;
    const variable = declaration.owner;
    if (ts.isArrayBindingPattern(variable.name)) {
      const index = variable.name.elements.findIndex(
        (element) => ts.isBindingElement(element)
          && ts.isIdentifier(element.name)
          && element.name === declaration.node,
      );
      return index === 0 && Boolean(variable.initializer) && isAntMessageHookCall(variable.initializer);
    }
    if (ts.isObjectBindingPattern(variable.name)
      && declaration.bindingProperty === "message"
      && variable.initializer) {
      const initializer = unwrapExpression(variable.initializer);
      return ts.isCallExpression(initializer)
        && ts.isPropertyAccessExpression(initializer.expression)
        && initializer.expression.name.text === "useApp"
        && isAntApp(initializer.expression.expression);
    }
    return Boolean(variable.initializer)
      && isAntMessageInstance(variable.initializer, new Set(seen).add(declaration.node));
  };
  // 统一反馈入口：notifyWarning 的标题与 notifyAction* 的补充说明都是可见文案，与 Ant message 同样受 i18n 约束；
  // notifyAction* 的第一个参数是动作枚举而非文案。
  const unifiedFeedbackTextArgument = (node) => {
    if (!ts.isCallExpression(node) || !ts.isIdentifier(node.expression)) return undefined;
    const declaration = resolveIdentifier(node.expression);
    if (!declaration || declaration.moduleName !== "@/utils/feedback") return undefined;
    if (declaration.imported === "notifyWarning") return 0;
    if (/^notifyAction(?:Success|Failed)$/.test(declaration.imported ?? "")) return 1;
    return undefined;
  };
  const isUnifiedFeedbackCall = (node) => unifiedFeedbackTextArgument(node) !== undefined;

  const isAntMessageCall = (node) => {
    if (isUnifiedFeedbackCall(node)) return true;
    if (!ts.isCallExpression(node)) return false;
    const methods = ["error", "info", "loading", "open", "success", "warning"];
    if (ts.isPropertyAccessExpression(node.expression)) {
      return methods.includes(node.expression.name.text)
        && (isAntMessageObject(node.expression.expression)
          || isAntMessageInstance(node.expression.expression));
    }
    if (!ts.isIdentifier(node.expression)) return false;
    const declaration = resolveIdentifier(node.expression);
    if (!declaration || !isConstVariable(declaration)) return false;
    if (ts.isObjectBindingPattern(declaration.owner.name)
      && methods.includes(declaration.bindingProperty ?? "")
      && declaration.owner.initializer) {
      return isAntMessageObject(declaration.owner.initializer)
        || isAntMessageInstance(declaration.owner.initializer);
    }
    const initializer = declaration.owner.initializer
      ? unwrapExpression(declaration.owner.initializer)
      : undefined;
    return Boolean(initializer
      && ts.isPropertyAccessExpression(initializer)
      && methods.includes(initializer.name.text)
      && (isAntMessageObject(initializer.expression)
        || isAntMessageInstance(initializer.expression)));
  };

  for (const declaration of declarations) {
    if (isRecognizedTranslatorProp(declaration)) translationBindings.add(declaration.node);
  }

  let changed = true;
  while (changed) {
    changed = false;
    const add = (declaration) => {
      if (declaration && !translationBindings.has(declaration.node)) {
        translationBindings.add(declaration.node);
        changed = true;
      }
    };
    function visit(node) {
      if (ts.isVariableDeclaration(node) && node.initializer) {
        if (ts.isObjectBindingPattern(node.name) && isUseTranslationCall(node.initializer)) add(declarationForOwner(node, "t"));
        if (ts.isIdentifier(node.name)) {
          const declaration = declarationForOwner(node);
          if (isTranslationIdentifier(node.initializer)) add(declaration);
          if (ts.isPropertyAccessExpression(node.initializer)
            && node.initializer.name.text === "t"
            && isUseTranslationCall(node.initializer.expression)) add(declaration);
          const wrapper = functionFromInitializer(node.initializer);
          const keyParameter = wrapper?.parameters[0];
          if (wrapper && keyParameter && ts.isIdentifier(keyParameter.name)) {
            function findForward(callNode) {
              if (ts.isCallExpression(callNode)
                && isTranslationCallLocal(callNode)
                && ts.isIdentifier(callNode.arguments[0])
                && callNode.arguments[0].text === keyParameter.name.text) {
                add(declaration);
                forwardingCalls.add(callNode);
                return;
              }
              ts.forEachChild(callNode, findForward);
            }
            findForward(wrapper.body);
          }
        }
      }
      if (ts.isCallExpression(node) && ts.isIdentifier(node.expression)) {
        const callee = resolveIdentifier(node.expression);
        const callable = callee && ts.isFunctionDeclaration(callee.owner)
          ? callee.owner
          : callee && ts.isVariableDeclaration(callee.owner) && callee.owner.initializer
            ? functionFromInitializer(callee.owner.initializer)
            : undefined;
        if (callable) for (let index = 0; index < callable.parameters.length; index += 1) {
          if (isTranslationIdentifier(node.arguments[index])) add(declarationForOwner(callable.parameters[index]));
        }
      }
      ts.forEachChild(node, visit);
    }
    visit(sourceFile);
  }
  const transBindings = new Set(declarations.filter(
    (declaration) => declaration.moduleName === "react-i18next" && declaration.imported === "Trans",
  ).map((declaration) => declaration.node));
  return {
    forwardingCalls,
    isShadowedTranslationCall: (node) => {
      if (!ts.isCallExpression(node) || !ts.isIdentifier(node.expression) || isTranslationCallLocal(node)) return false;
      const resolved = resolveIdentifier(node.expression);
      return declarations.some((declaration) => declaration.name === node.expression.text
        && translationBindings.has(declaration.node)
        && declaration.node !== resolved?.node
        && declaration.scope.pos <= node.pos
        && node.end <= declaration.scope.end);
    },
    isActionTag: (node) => {
      if (!node) return false;
      if (ts.isIdentifier(node)) {
        const declaration = resolveIdentifier(node);
        if (!declaration) return ["Button", "IconButton"].includes(node.text);
        return isAntButton(node)
          || (declaration.moduleName === "@/components/ui" && declaration.imported === "IconButton");
      }
      return isAntButton(node);
    },
    isAntMessageCall,
    unifiedFeedbackTextArgument,
    isFragmentIdentifier,
    isTransTag: (node) => ts.isIdentifier(node) && transBindings.has(resolveIdentifier(node)?.node),
    isTranslationCall: isTranslationCallLocal,
  };
}

/** tFragment 的合法去处：作为工厂函数体（() => tFragment(...)，供模板函数取片段）或 join/concat 的分隔片段。 */
function isFragmentSink(node) {
  const parent = node.parent;
  if (parent && ts.isArrowFunction(parent) && parent.body === node) return true;
  return Boolean(parent && ts.isCallExpression(parent) && ts.isPropertyAccessExpression(parent.expression)
    && /^(?:join|concat)$/.test(parent.expression.name.text));
}

function isTranslationCall(node, bindings) {
  return bindings.isTranslationCall(node);
}

function isForwardingCall(call, bindings) {
  return bindings.forwardingCalls.has(call);
}

const ACTION_TEXT_PROPS = new Set(["cancelText", "okText", "resetText", "searchText"]);
const ACTION_LABEL_PROP = /^(?:action|button|cancel|confirm|create|delete|edit|query|refresh|reset|retry|save|search|submit)(?:Label|Text)$/i;

function jsxTagName(node, sourceFile) {
  return node.tagName.getText(sourceFile).split(".").at(-1);
}

function jsxOpeningForAttribute(attribute) {
  if (!ts.isJsxAttribute(attribute)) return undefined;
  if (ts.isJsxOpeningLikeElement(attribute.parent)) return attribute.parent;
  return attribute.parent?.parent && ts.isJsxOpeningLikeElement(attribute.parent.parent) ? attribute.parent.parent : undefined;
}

/** 翻译调用作为哪个 JSX 属性的值（穿过条件表达式与括号），返回 [标签名, 属性名]。 */
function jsxAttributeContext(call, sourceFile) {
  let current = call;
  while (current.parent && (ts.isConditionalExpression(current.parent) || ts.isParenthesizedExpression(current.parent))) current = current.parent;
  const expression = current.parent;
  if (!expression || !ts.isJsxExpression(expression) || !ts.isJsxAttribute(expression.parent)) return undefined;
  const opening = jsxOpeningForAttribute(expression.parent);
  return opening ? [jsxTagName(opening, sourceFile), expression.parent.name.getText(sourceFile)] : undefined;
}

// 字段标签不带单位：固定单位放进输入框前后缀（InputNumber prefix / suffix），不写在标签括号里、也不让人手输
const LABEL_UNIT = /[（(]\s*(?:秒|分钟|小时|天|毫秒|px|%|元|￥|ms|s|seconds?|minutes?|hours?|days?)\s*[）)]$/i;
// 说明是写给使用者的：不出现字段名 / 接口取值 / 实现细节
const HINT_JARGON = /[A-Za-z]+_[A-Za-z_]+|\b(?:modal|toast|CSS|FilterGroup|debounce)\b|后端|前端|防抖/;
// 只复述标签（“选择上游渠道”）的说明没有信息量
const HINT_RESTATES_LABEL = /^(?:请)?(?:选择|输入|填写)[^，。；,;]{0,10}$/;

function isActionTextContext(call, sourceFile, bindings, staticActionCalls) {
  if (staticActionCalls.has(call)) return true;
  let current = call.parent;
  while (current && !ts.isSourceFile(current)) {
    if (ts.isJsxElement(current) && bindings.isActionTag(current.openingElement.tagName)) return true;
    current = current.parent;
  }
  return false;
}

function commonActionKey(node, bindings) {
  if (!isTranslationCall(node, bindings)) return undefined;
  const keys = literalValues(node.arguments[0]);
  return keys.length === 1 && keys[0].startsWith("common.actions.") ? keys[0] : undefined;
}

function containsTranslationCall(node, bindings) {
  let found = false;
  function visit(child) {
    if (isTranslationCall(child, bindings)) {
      found = true;
      return;
    }
    ts.forEachChild(child, visit);
  }
  visit(node);
  return found;
}

function containsCommonActionCall(node, bindings) {
  let found = false;
  function visit(child) {
    if (commonActionKey(child, bindings)) {
      found = true;
      return;
    }
    ts.forEachChild(child, visit);
  }
  visit(node);
  return found;
}

function defaultValues(call, sourceFile) {
  const options = call.arguments[1];
  const direct = literalValues(options);
  if (direct.length) return direct;
  if (!options || !ts.isObjectLiteralExpression(options)) return [];
  const property = options.properties.find(
    (item) => ts.isPropertyAssignment(item) && propertyName(item, sourceFile) === "defaultValue",
  );
  return property && ts.isPropertyAssignment(property) ? literalValues(property.initializer) : [];
}

function collectObjectValueNames(node, sourceFile, names) {
  if (!node || !ts.isObjectLiteralExpression(node)) return;
  for (const property of node.properties) {
    if (ts.isPropertyAssignment(property) || ts.isShorthandPropertyAssignment(property) || ts.isMethodDeclaration(property)) {
      names.add(propertyName(property, sourceFile));
    } else if (ts.isSpreadAssignment(property) && ts.isObjectLiteralExpression(property.expression)) {
      collectObjectValueNames(property.expression, sourceFile, names);
    }
  }
}

function providedValueNames(call, sourceFile) {
  const names = new Set();
  collectObjectValueNames(call.arguments[1], sourceFile, names);
  collectObjectValueNames(call.arguments[2], sourceFile, names);
  return names;
}

function transAttributes(node, sourceFile) {
  const attribute = (name) => node.attributes.properties.find(
    (item) => ts.isJsxAttribute(item) && item.name.getText(sourceFile) === name,
  )?.initializer;
  const providedValues = new Set();
  const values = attribute("values");
  if (values && ts.isJsxExpression(values)) collectObjectValueNames(values.expression, sourceFile, providedValues);
  const root = ts.isJsxOpeningElement(node) && ts.isJsxElement(node.parent) ? node.parent : node;
  function visitChildren(child) {
    if (ts.isJsxExpression(child) && ts.isObjectLiteralExpression(child.expression)) {
      collectObjectValueNames(child.expression, sourceFile, providedValues);
      return;
    }
    if (ts.isJsxElement(child) || ts.isJsxFragment(child)) {
      for (const nestedChild of child.children) visitChildren(nestedChild);
    }
  }
  if (ts.isJsxElement(root)) for (const child of root.children) visitChildren(child);
  return {
    defaults: literalValues(attribute("defaults")),
    keys: literalValues(attribute("i18nKey")),
    providedValues,
  };
}

function normalizeExpression(node, sourceFile) {
  return node.getText(sourceFile).replaceAll(/\s+/g, " ").trim();
}

function registryIdentity(file, expression) {
  return `${file}\u0000${expression}`;
}

function nodeAnchor(node, sourceFile) {
  const position = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
  return { kind: ts.SyntaxKind[node.kind], line: position.line + 1, column: position.character + 1 };
}

function anchorIdentity(anchor) {
  return `${anchor.kind}:${anchor.line}:${anchor.column}`;
}

function matchesAnchor(node, sourceFile, anchor) {
  const actual = nodeAnchor(node, sourceFile);
  if (actual.kind !== anchor?.kind || actual.line !== anchor.line || actual.column !== anchor.column) return false;
  if (anchor.name) {
    const name = node.name && (ts.isIdentifier(node.name) || ts.isStringLiteralLike(node.name)) ? node.name.text : undefined;
    if (name !== anchor.name) return false;
  }
  if (anchor.callee) {
    if (!ts.isCallExpression(node) || node.expression.getText(sourceFile) !== anchor.callee) return false;
  }
  return true;
}

function staticConstant(node, sourceFile) {
  const value = unwrapExpression(node);
  if (value.kind === ts.SyntaxKind.TrueKeyword) return { known: true, value: true };
  if (value.kind === ts.SyntaxKind.FalseKeyword) return { known: true, value: false };
  if (value.kind === ts.SyntaxKind.NullKeyword) return { known: true, value: null };
  if (ts.isNumericLiteral(value)) return { known: true, value: Number(value.text) };
  if (ts.isBigIntLiteral(value)) return { known: true, value: BigInt(value.text.slice(0, -1)) };
  if (ts.isStringLiteralLike(value) || ts.isNoSubstitutionTemplateLiteral(value)) return { known: true, value: value.text };
  if (ts.isIdentifier(value) && !resolvedDeclaration(sourceFile, value)) {
    if (value.text === "undefined") return { known: true, value: undefined };
    if (value.text === "NaN") return { known: true, value: Number.NaN };
  }
  if (ts.isVoidExpression(value)) return { known: true, value: undefined };
  if (ts.isPrefixUnaryExpression(value) && value.operator === ts.SyntaxKind.ExclamationToken) {
    const operand = staticConstant(value.operand, sourceFile);
    return operand.known ? { known: true, value: !operand.value } : { known: false };
  }
  if (ts.isPrefixUnaryExpression(value)
    && [ts.SyntaxKind.PlusToken, ts.SyntaxKind.MinusToken, ts.SyntaxKind.TildeToken].includes(value.operator)) {
    const operand = staticConstant(value.operand, sourceFile);
    if (!operand.known) return { known: false };
    try {
      if (value.operator === ts.SyntaxKind.PlusToken) return { known: true, value: +operand.value };
      if (value.operator === ts.SyntaxKind.MinusToken) return { known: true, value: -operand.value };
      return { known: true, value: ~operand.value };
    } catch {
      return { known: false };
    }
  }
  if (ts.isBinaryExpression(value)) {
    const left = staticConstant(value.left, sourceFile);
    if (!left.known) return { known: false };
    if (value.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken && !left.value) return left;
    if (value.operatorToken.kind === ts.SyntaxKind.BarBarToken && left.value) return left;
    if (value.operatorToken.kind === ts.SyntaxKind.QuestionQuestionToken && left.value !== null && left.value !== undefined) return left;
    const right = staticConstant(value.right, sourceFile);
    if (!right.known) return { known: false };
    try {
      switch (value.operatorToken.kind) {
        case ts.SyntaxKind.AmpersandAmpersandToken: return right;
        case ts.SyntaxKind.BarBarToken: return right;
        case ts.SyntaxKind.QuestionQuestionToken: return right;
        case ts.SyntaxKind.PlusToken: return { known: true, value: left.value + right.value };
        case ts.SyntaxKind.MinusToken: return { known: true, value: left.value - right.value };
        case ts.SyntaxKind.AsteriskToken: return { known: true, value: left.value * right.value };
        case ts.SyntaxKind.SlashToken: return { known: true, value: left.value / right.value };
        case ts.SyntaxKind.PercentToken: return { known: true, value: left.value % right.value };
        case ts.SyntaxKind.AsteriskAsteriskToken: return { known: true, value: left.value ** right.value };
        case ts.SyntaxKind.LessThanToken: return { known: true, value: left.value < right.value };
        case ts.SyntaxKind.LessThanEqualsToken: return { known: true, value: left.value <= right.value };
        case ts.SyntaxKind.GreaterThanToken: return { known: true, value: left.value > right.value };
        case ts.SyntaxKind.GreaterThanEqualsToken: return { known: true, value: left.value >= right.value };
        case ts.SyntaxKind.EqualsEqualsEqualsToken: return { known: true, value: left.value === right.value };
        case ts.SyntaxKind.ExclamationEqualsEqualsToken: return { known: true, value: left.value !== right.value };
        case ts.SyntaxKind.EqualsEqualsToken: return { known: true, value: left.value == right.value };
        case ts.SyntaxKind.ExclamationEqualsToken: return { known: true, value: left.value != right.value };
        case ts.SyntaxKind.AmpersandToken: return { known: true, value: left.value & right.value };
        case ts.SyntaxKind.BarToken: return { known: true, value: left.value | right.value };
        case ts.SyntaxKind.CaretToken: return { known: true, value: left.value ^ right.value };
        case ts.SyntaxKind.LessThanLessThanToken: return { known: true, value: left.value << right.value };
        case ts.SyntaxKind.GreaterThanGreaterThanToken: return { known: true, value: left.value >> right.value };
        case ts.SyntaxKind.GreaterThanGreaterThanGreaterThanToken: return { known: true, value: left.value >>> right.value };
        default: return { known: false };
      }
    } catch {
      return { known: false };
    }
  }
  return { known: false };
}

function staticTruthiness(node) {
  const constant = staticConstant(node, node.getSourceFile());
  return constant.known ? Boolean(constant.value) : undefined;
}

function isStaticallyDead(node) {
  let current = node;
  while (current.parent) {
    const parent = current.parent;
    if (ts.isIfStatement(parent)) {
      const condition = staticTruthiness(parent.expression);
      if (parent.thenStatement === current && condition === false) return true;
      if (parent.elseStatement === current && condition === true) return true;
    }
    if (ts.isConditionalExpression(parent)) {
      const condition = staticTruthiness(parent.condition);
      if (parent.whenTrue === current && condition === false) return true;
      if (parent.whenFalse === current && condition === true) return true;
    }
    if (ts.isBinaryExpression(parent)) {
      const left = staticTruthiness(parent.left);
      if (parent.right === current && parent.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken && left === false) return true;
      if (parent.right === current && parent.operatorToken.kind === ts.SyntaxKind.BarBarToken && left === true) return true;
    }
    if ((ts.isWhileStatement(parent) || ts.isForStatement(parent)) && parent.statement === current) {
      const condition = ts.isWhileStatement(parent) ? parent.expression : parent.condition;
      if (condition && staticTruthiness(condition) === false) return true;
    }
    if (ts.isBlock(parent)) {
      const statement = parent.statements.find((item) => item === current || (item.pos <= current.pos && current.end <= item.end));
      const statementIndex = statement ? parent.statements.indexOf(statement) : -1;
      if (statementIndex > 0 && parent.statements.slice(0, statementIndex).some((item) => ts.isReturnStatement(item) || ts.isThrowStatement(item))) return true;
    }
    current = parent;
  }
  return false;
}

function findAnchoredRoot(sourceFile, anchor) {
  const matches = [];
  function visit(node) {
    if (matchesAnchor(node, sourceFile, anchor)) matches.push(node);
    ts.forEachChild(node, visit);
  }
  visit(sourceFile);
  return matches;
}

function keysFromRegisteredSource(source, specification) {
  const sourceFile = ts.createSourceFile(source.file, source.text, ts.ScriptTarget.Latest, true, source.file.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const keys = new Set();
  const matches = [];
  let matchCount = 0;
  const roots = findAnchoredRoot(sourceFile, specification.anchor);
  function visit(node) {
    if (specification.selector?.kind === "property"
      && ts.isPropertyAssignment(node)
      && propertyName(node, sourceFile) === specification.selector.name) {
      matchCount += 1;
      matches.push(node);
      for (const value of literalValues(node.initializer)) keys.add(value);
    }
    if (specification.selector?.kind === "call-argument"
      && ts.isCallExpression(node)
      && node.expression.getText(sourceFile) === specification.selector.callee) {
      matchCount += 1;
      matches.push(node);
      for (const value of literalValues(node.arguments[specification.selector.argumentIndex])) keys.add(value);
    }
    if (specification.selector?.kind === "call-property"
      && ts.isCallExpression(node)
      && node.expression.getText(sourceFile) === specification.selector.callee) {
      const argument = node.arguments[specification.selector.argumentIndex];
      const object = argument && ts.isObjectLiteralExpression(argument) ? argument : undefined;
      const property = object?.properties.find((item) => ts.isPropertyAssignment(item)
        && propertyName(item, sourceFile) === specification.selector.name);
      if (property && ts.isPropertyAssignment(property)) {
        matchCount += 1;
        matches.push(node);
        for (const value of literalValues(property.initializer)) keys.add(value);
      }
    }
    ts.forEachChild(node, visit);
  }
  if (roots.length === 1) visit(roots[0]);
  return { keys, matchCount, matches, rootCount: roots.length, sourceFile };
}

function expressionBindingPath(node) {
  let current = unwrapExpression(node);
  const path = [];
  while (ts.isPropertyAccessExpression(current)) {
    path.unshift(current.name.text);
    current = unwrapExpression(current.expression);
  }
  return ts.isIdentifier(current) ? { root: current, path } : undefined;
}

function resolvedDeclaration(sourceFile, identifier) {
  return collectDeclarations(sourceFile)
    .filter((declaration) => declaration.name === identifier.text
      && declaration.scope.pos <= identifier.pos && identifier.end <= declaration.scope.end)
    .sort((left, right) => (left.scope.end - left.scope.pos) - (right.scope.end - right.scope.pos) || (left.imported ? 1 : -1))[0];
}

function staticObjectLiteral(expression, useNode, sourceFile, seen = new Set()) {
  const value = unwrapExpression(expression);
  if (ts.isObjectLiteralExpression(value)) return { object: value, seen };
  if (!ts.isIdentifier(value)) return undefined;
  const declaration = resolvedDeclaration(sourceFile, value);
  if (!declaration || seen.has(declaration.node) || !isConstDeclaration(declaration) || !declaration.owner.initializer) return undefined;
  const nextSeen = new Set(seen).add(declaration.node);
  return staticObjectLiteral(declaration.owner.initializer, useNode, sourceFile, nextSeen);
}

function expandStaticObject(expression, useNode, sourceFile, seen = new Set()) {
  const resolved = staticObjectLiteral(expression, useNode, sourceFile, seen);
  if (!resolved) return undefined;
  const values = new Map();
  const accessors = new Set();
  for (const property of resolved.object.properties) {
    if (ts.isSpreadAssignment(property)) {
      const spread = expandStaticObject(property.expression, useNode, sourceFile, resolved.seen);
      if (!spread) {
        values.clear();
        accessors.clear();
      } else for (const [name, value] of spread) {
        values.set(name, value);
        accessors.delete(name);
      }
      continue;
    }
    if (!property.name) continue;
    const name = propertyName(property, sourceFile);
    if (ts.isGetAccessorDeclaration(property)) {
      values.set(name, property);
      accessors.add(name);
    } else if (ts.isSetAccessorDeclaration(property)) {
      if (!accessors.has(name)) values.set(name, undefined);
      accessors.add(name);
    } else {
      accessors.delete(name);
      if (ts.isPropertyAssignment(property)) values.set(name, property.initializer);
      else if (ts.isShorthandPropertyAssignment(property)) values.set(name, property.name);
      else if (ts.isMethodDeclaration(property)) values.set(name, property);
    }
  }
  return values;
}

const VISIBLE_TEXT_PROPS = new Set([
  "content",
  "description",
  "emptyText",
  "extra",
  "help",
  "label",
  "placeholder",
  "title",
  "tooltip",
]);
/** 可见文案：任何汉字，或两个及以上字母组成的拉丁词（品牌名、语言名、单位词也必须走 i18n 词表）。 */
const HAN_TEXT = /\p{Script=Han}|[A-Za-z]{2,}/u;
/** 作为“值”而非“文案”的对象键：不参与可见文案判定。 */
const NON_TEXT_OBJECT_KEYS = new Set(["value", "key", "id", "name", "dataIndex", "type", "mode", "kind", "status", "code", "field", "href", "to", "path", "url", "src", "format", "className", "color", "variant", "size", "icon"]);

function containsVisibleHanText(expression, sourceFile, bindings, seen = new Set()) {
  if (!expression) return false;
  const node = unwrapExpression(expression);
  if (isTranslationCall(node, bindings)) return false;
  if (ts.isJsxText(node)) return HAN_TEXT.test(node.text);
  if (ts.isStringLiteralLike(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
    return HAN_TEXT.test(node.text);
  }
  if (ts.isTemplateExpression(node)) {
    return HAN_TEXT.test(node.head.text)
      || node.templateSpans.some((span) => HAN_TEXT.test(span.literal.text));
  }
  if (ts.isConditionalExpression(node)) {
    return containsVisibleHanText(node.whenTrue, sourceFile, bindings, seen)
      || containsVisibleHanText(node.whenFalse, sourceFile, bindings, seen);
  }
  if (ts.isBinaryExpression(node)) {
    const operator = node.operatorToken.kind;
    // 比较运算里的字面量是判定值，不是文案；&& 只有右侧会被渲染
    if (operator === ts.SyntaxKind.AmpersandAmpersandToken) return containsVisibleHanText(node.right, sourceFile, bindings, seen);
    if (operator === ts.SyntaxKind.PlusToken || operator === ts.SyntaxKind.BarBarToken || operator === ts.SyntaxKind.QuestionQuestionToken) {
      return containsVisibleHanText(node.left, sourceFile, bindings, seen)
        || containsVisibleHanText(node.right, sourceFile, bindings, seen);
    }
    return false;
  }
  if (ts.isArrayLiteralExpression(node)) {
    return node.elements.some((element) => containsVisibleHanText(element, sourceFile, bindings, seen));
  }
  if (ts.isObjectLiteralExpression(node)) {
    const values = expandStaticObject(node, node, sourceFile);
    return Boolean(values) && [...values.entries()].some(
      ([key, value]) => !NON_TEXT_OBJECT_KEYS.has(key) && value && containsVisibleHanText(value, sourceFile, bindings, seen),
    );
  }
  if (ts.isJsxElement(node) || ts.isJsxFragment(node)) {
    if (ts.isJsxElement(node) && node.openingElement.attributes.properties.some((attribute) =>
      ts.isJsxAttribute(attribute) && VISIBLE_TEXT_PROPS.has(attribute.name.getText(sourceFile))
      && containsVisibleHanText(attribute.initializer && ts.isJsxExpression(attribute.initializer) ? attribute.initializer.expression : attribute.initializer, sourceFile, bindings, seen))) return true;
    return node.children.some((child) => {
      if (ts.isJsxText(child)) return HAN_TEXT.test(child.text);
      if (ts.isJsxExpression(child)) return containsVisibleHanText(child.expression, sourceFile, bindings, seen);
      return containsVisibleHanText(child, sourceFile, bindings, seen);
    });
  }
  if (ts.isJsxSelfClosingElement(node)) {
    return node.attributes.properties.some((attribute) => {
      // 只有可见文案属性参与判定；className/variant/size 等是配置值
      if (!ts.isJsxAttribute(attribute) || !VISIBLE_TEXT_PROPS.has(attribute.name.getText(sourceFile))) return false;
      const value = attribute.initializer && ts.isJsxExpression(attribute.initializer)
        ? attribute.initializer.expression
        : attribute.initializer;
      return containsVisibleHanText(value, sourceFile, bindings, seen);
    });
  }
  if (ts.isIdentifier(node)) {
    const declaration = resolvedDeclaration(sourceFile, node);
    if (!declaration || seen.has(declaration.node) || !isConstDeclaration(declaration)
      || !declaration.owner.initializer) return false;
    return containsVisibleHanText(
      declaration.owner.initializer,
      sourceFile,
      bindings,
      new Set(seen).add(declaration.node),
    );
  }
  const path = expressionBindingPath(node);
  if (path) {
    const declaration = resolvedDeclaration(sourceFile, path.root);
    if (!declaration || seen.has(declaration.node) || !isConstDeclaration(declaration)
      || !declaration.owner.initializer) return false;
    let values = expandStaticObject(declaration.owner.initializer, node, sourceFile);
    if (!values) return false;
    for (let index = 0; index < path.path.length; index += 1) {
      const segment = path.path[index];
      const value = values.get(segment);
      if (!value) return false;
      if (index === path.path.length - 1) {
        return containsVisibleHanText(value, sourceFile, bindings, new Set(seen).add(declaration.node));
      }
      values = expandStaticObject(value, node, sourceFile);
      if (!values) return false;
    }
  }
  if (ts.isElementAccessExpression(node)) {
    const root = unwrapExpression(node.expression);
    if (!ts.isIdentifier(root)) return false;
    const declaration = resolvedDeclaration(sourceFile, root);
    if (!declaration || seen.has(declaration.node) || !isConstDeclaration(declaration)
      || !declaration.owner.initializer) return false;
    const values = expandStaticObject(declaration.owner.initializer, node, sourceFile);
    if (!values) return false;
    const key = unwrapExpression(node.argumentExpression);
    const candidates = ts.isStringLiteralLike(key) ? [values.get(key.text)] : [...values.values()];
    return candidates.some(
      (value) => value && containsVisibleHanText(value, sourceFile, bindings, new Set(seen).add(declaration.node)),
    );
  }
  return false;
}

function collectTranslationCalls(node, bindings, output) {
  function visit(child) {
    if (isTranslationCall(child, bindings)) output.add(child);
    ts.forEachChild(child, visit);
  }
  if (node) visit(node);
}

function collectStaticActionCalls(sourceFile, bindings) {
  const calls = new Set();
  function effectiveJsxProps(node) {
    const values = new Map();
    for (const attribute of node.attributes.properties) {
      if (ts.isJsxSpreadAttribute(attribute)) {
        const spread = expandStaticObject(attribute.expression, node, sourceFile);
        if (!spread) values.clear();
        else for (const [name, value] of spread) values.set(name, value);
        continue;
      }
      const name = attribute.name.getText(sourceFile);
      const value = attribute.initializer && ts.isJsxExpression(attribute.initializer)
        ? attribute.initializer.expression
        : attribute.initializer;
      values.set(name, value);
    }
    return values;
  }
  function visit(node) {
    if (ts.isJsxOpeningLikeElement(node)) {
      const properties = effectiveJsxProps(node);
      for (const [name, value] of properties) {
        const componentActionProp = bindings.isActionTag(node.tagName)
          && (name === "children" || (name === "label" && jsxTagName(node, sourceFile) === "IconButton"));
        if (componentActionProp || ACTION_TEXT_PROPS.has(name) || ACTION_LABEL_PROP.test(name)) {
          collectTranslationCalls(value, bindings, calls);
        }
      }
    }
    if (ts.isObjectLiteralExpression(node)) {
      const properties = expandStaticObject(node, node, sourceFile);
      if (properties) {
        if (["onClick", "onSelect", "command"].some((name) => properties.get(name))) {
          collectTranslationCalls(properties.get("label"), bindings, calls);
        }
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(sourceFile);
  return calls;
}

function callableName(node) {
  if (ts.isFunctionDeclaration(node) && node.name) return node.name.text;
  if ((ts.isArrowFunction(node) || ts.isFunctionExpression(node))
    && ts.isVariableDeclaration(node.parent) && ts.isIdentifier(node.parent.name)) return node.parent.name.text;
  return undefined;
}

function moduleResolvesToSource(moduleName, sourceFile) {
  if (!moduleName?.startsWith("@/")) return false;
  const base = `src/${moduleName.slice(2)}`;
  return sourceFile === base
    || [".ts", ".tsx", "/index.ts", "/index.tsx"].some((suffix) => sourceFile === `${base}${suffix}`);
}

function isConstDeclaration(declaration) {
  return ts.isVariableDeclaration(declaration?.owner)
    && ts.isVariableDeclarationList(declaration.owner.parent)
    && (declaration.owner.parent.flags & ts.NodeFlags.Const) !== 0;
}

function matchesImportNamespace(identifier, moduleName, sourceFile, seen = new Set()) {
  if (!ts.isIdentifier(identifier)) return false;
  const declaration = resolvedDeclaration(sourceFile, identifier);
  if (!declaration || seen.has(declaration.node)) return false;
  if (declaration.moduleName === moduleName && declaration.imported === "*") return true;
  if (!isConstDeclaration(declaration) || !declaration.owner.initializer) return false;
  return matchesImportNamespace(unwrapExpression(declaration.owner.initializer), moduleName, sourceFile, new Set(seen).add(declaration.node));
}

function matchesImportedValue(node, moduleName, imported, sourceFile, seen = new Set()) {
  const value = unwrapExpression(node);
  if (ts.isPropertyAccessExpression(value) && value.name.text === imported) {
    return matchesImportNamespace(value.expression, moduleName, sourceFile, seen);
  }
  if (ts.isElementAccessExpression(value) && ts.isStringLiteralLike(unwrapExpression(value.argumentExpression))
    && unwrapExpression(value.argumentExpression).text === imported) {
    return matchesImportNamespace(value.expression, moduleName, sourceFile, seen);
  }
  if (!ts.isIdentifier(value)) return false;
  const declaration = resolvedDeclaration(sourceFile, value);
  if (!declaration || seen.has(declaration.node)) return false;
  if (declaration.moduleName === moduleName && declaration.imported === imported) return true;
  if (!isConstDeclaration(declaration)) return false;
  const next = new Set(seen).add(declaration.node);
  if (declaration.bindingProperty === imported && declaration.owner.initializer) {
    return matchesImportNamespace(unwrapExpression(declaration.owner.initializer), moduleName, sourceFile, next);
  }
  return Boolean(declaration.owner.initializer
    && matchesImportedValue(declaration.owner.initializer, moduleName, imported, sourceFile, next));
}

function validateDynamicDataFlow(entry, calls, evidence) {
  const flow = entry.dataFlow;
  const source = evidence?.[flow?.keySource];
  if (!flow || !source) return false;
  if (flow.kind === "argument-to-parameter") {
    if (!source.matches.every((match) => ts.isCallExpression(match)
      && match.expression.getText(source.sourceFile) === flow.callable)) return false;
    const selector = entry.keySources[flow.keySource]?.selector;
    if (!selector || !["call-argument", "call-property"].includes(selector.kind)
      || selector.callee !== flow.callable || selector.argumentIndex !== flow.parameterIndex) return false;
    return calls.every((call) => {
      if (!ts.isCallExpression(call.node)) return false;
      const binding = expressionBindingPath(call.node.arguments[0]);
      if (!binding || binding.path.join(".") !== (flow.path ?? []).join(".")) return false;
      let current = call.node.parent;
      while (current && !ts.isSourceFile(current)) {
        if (ts.isFunctionLike(current) && callableName(current) === flow.callable) {
          const parameter = current.parameters[flow.parameterIndex];
          return Boolean(parameter && ts.isIdentifier(parameter.name)
            && resolvedDeclaration(call.sourceFile, binding.root)?.node === parameter.name);
        }
        current = current.parent;
      }
      return false;
    });
  }
  if (flow.kind === "jsx-prop-callback") {
    const specification = entry.keySources[flow.keySource];
    if (specification?.anchor?.name !== flow.sourceBinding || specification.selector?.kind !== "property"
      || !moduleResolvesToSource(flow.sourceModule, specification.file)) return false;
    return calls.every((call) => {
      if (!ts.isCallExpression(call.node)) return false;
      const binding = expressionBindingPath(call.node.arguments[0]);
      if (!binding || binding.path.join(".") !== (flow.path ?? []).join(".")) return false;
      let current = call.node.parent;
      while (current && !ts.isSourceFile(current)) {
        if (ts.isArrowFunction(current) || ts.isFunctionExpression(current)) {
          const expression = current.parent;
          const attribute = ts.isJsxExpression(expression) ? expression.parent : undefined;
          const opening = attribute && ts.isJsxAttribute(attribute) ? jsxOpeningForAttribute(attribute) : undefined;
          const parameter = current.parameters[flow.parameterIndex];
          const routeAttribute = opening && ts.isJsxOpeningLikeElement(opening)
            ? opening.attributes.properties.find((item) => ts.isJsxAttribute(item) && item.name.text === flow.sourceProp)
            : undefined;
          const routeExpression = routeAttribute?.initializer && ts.isJsxExpression(routeAttribute.initializer)
            ? routeAttribute.initializer.expression
            : undefined;
          const routeDeclaration = routeExpression && ts.isIdentifier(routeExpression)
            ? resolvedDeclaration(call.sourceFile, routeExpression)
            : undefined;
          return Boolean(attribute && ts.isJsxAttribute(attribute) && attribute.name.text === flow.callbackProp
            && opening && ts.isJsxOpeningLikeElement(opening)
            && matchesImportedValue(opening.tagName, flow.componentModule, flow.componentExport, call.sourceFile)
            && parameter && ts.isIdentifier(parameter.name)
            && resolvedDeclaration(call.sourceFile, binding.root)?.node === parameter.name
            && routeDeclaration?.moduleName === flow.sourceModule
            && routeDeclaration.imported === flow.sourceBinding);
        }
        current = current.parent;
      }
      return false;
    });
  }
  return false;
}

export function analyzeI18n({ catalogs, sources, registry = { version: 2, callsites: [] } }) {
  const errors = [];
  const used = new Set();
  const flattened = new Map(
    Object.entries(catalogs).map(([locale, catalog]) => [locale, flattenCatalog(catalog)]),
  );
  const localeNames = [...flattened.keys()];
  const referenceLocale = localeNames.includes("zh-CN") ? "zh-CN" : localeNames[0];
  const reference = flattened.get(referenceLocale) ?? new Map();
  const catalogKeys = new Set(localeNames.flatMap((locale) => [...flattened.get(locale).keys()]));
  const sourcesByFile = new Map(sources.map((source) => [source.file, source]));

  // 字典拼接（FRONTEND-I18N）：复合文案由 $t(key) 引用原子词条拼成。
  // resolved 是展开引用后的最终文案，凡是按“文案内容”判断的规则都用它；flattened 保留原始值。
  const resolved = new Map();
  for (const locale of localeNames) {
    const raw = flattened.get(locale);
    const output = new Map();
    for (const [key, value] of raw) {
      if (typeof value !== "string") { output.set(key, value); continue; }
      try {
        output.set(key, resolveNested(value, (target) => raw.get(target)));
      } catch (error) {
        errors.push({ file: `src/i18n/locales/${locale}.json`, line: 1, msg: error.message });
        output.set(key, value);
      }
      for (const target of nestedReferences(value)) {
        used.add(target);
        if (!raw.has(target)) errors.push({ file: `src/i18n/locales/${locale}.json`, line: 1, msg: `"${key}" 引用了不存在的键 "${target}"` });
        else if (!target.startsWith("common.")) errors.push({ file: `src/i18n/locales/${locale}.json`, line: 1, msg: `"${key}" 引用的词条 "${target}" 必须位于 common 命名空间（被拼接复用的词条是共享词表）` });
      }
    }
    resolved.set(locale, output);
  }
  // 语言字段说明采用当前界面的语言；切换按钮的 EN/中文另用短词条。
  const chineseCatalog = resolved.get("zh-CN");
  for (const [key, expected] of Object.entries({
    "common.language.enUS": "英文",
    "common.language.zhCN": "简体中文",
  })) {
    if (chineseCatalog?.has(key) && chineseCatalog.get(key) !== expected) {
      errors.push({ file: "src/i18n/locales/zh-CN.json", line: 1,
        msg: `"${key}" 的语言名称必须随中文界面本地化为“${expected}”，不得使用外语自称或切换按钮缩写` });
    }
  }
  // 权限效果是界面语义词，不是可保留英文的接口值；展开嵌套后也必须本地化。
  for (const [key, value] of chineseCatalog ?? []) {
    if (typeof value === "string" && /\b(?:deny|allow)\b/i.test(value)) {
      errors.push({ file: "src/i18n/locales/zh-CN.json", line: 1,
        msg: `"${key}" 的权限效果必须随中文界面本地化，并复用 common.vocab.allow/deny` });
    }
  }
  // 同一个词只在字典里出现一次：任一值的字面部分若完整包含另一个键的文案，必须改为 $t() 引用
  for (const locale of localeNames) {
    const latin = isLatinLocale(locale);
    const raw = flattened.get(locale);
    const texts = resolved.get(locale);
    const atoms = [...raw].filter(([, value]) => typeof value === "string" && isAtomCandidate(value, latin))
      .map(([key]) => ({ key, text: String(texts.get(key)) }));
    for (const [key, value] of raw) {
      if (typeof value !== "string") continue;
      const literals = segmentValue(value).filter((segment) => segment.kind === "literal" && segment.text.trim()).map((segment) => segment.text);
      if (!literals.length) continue;
      const own = latin ? String(texts.get(key)).toLowerCase() : String(texts.get(key));
      const hit = atoms.find((atom) => atom.key !== key && (latin ? atom.text.toLowerCase() : atom.text) !== own && literals.some((literal) => findOccurrences(literal, atom.text, latin).length));
      if (hit) errors.push({ file: `src/i18n/locales/${locale}.json`, line: 1, msg: `"${key}" 的文案里写死了 "${texts.get(hit.key)}"，必须改为引用 $t(${hit.key})（同一个词只在字典里出现一次）` });
    }
  }
  const localeValue = (locale, key) => resolved.get(locale)?.get(key);
  const commonActions = [...reference.keys()]
    .filter((key) => key.startsWith("common.actions."))
    .map((key) => ({ key, values: new Map(localeNames.map((locale) => [locale, localeValue(locale, key)])) }));
  const commonObjects = [...reference.keys()]
    .filter((key) => key.startsWith("common.objects."))
    .map((key) => ({ key, values: new Map(localeNames.map((locale) => [locale, localeValue(locale, key)])) }));
  const actionObjectTemplates = [...reference.keys()]
    .filter((key) => key.startsWith("common.actionObjectTemplates."))
    .map((key) => ({ key, values: new Map(localeNames.map((locale) => [locale, localeValue(locale, key)])) }));
  for (const template of actionObjectTemplates) {
    const actionName = template.key.split(".").at(-1);
    if (!commonActions.some((action) => action.key === `common.actions.${actionName}`)) {
      errors.push({ file: `src/i18n/locales/${referenceLocale}.json`, line: 1, msg: `动作对象模板 "${template.key}" 缺少对应 common.actions.${actionName}` });
    }
    for (const locale of localeNames) {
      const value = template.values.get(locale);
      if (typeof value !== "string" || !interpolationNameList(value).includes("object")) {
        errors.push({ file: `src/i18n/locales/${locale}.json`, line: 1, msg: `动作对象模板 "${template.key}" 必须包含 {object}` });
      }
    }
  }
  const actionObjectCopies = actionObjectTemplates.flatMap((template) => commonObjects.map((object) => ({
    objectKey: object.key,
    templateKey: template.key,
    values: new Map(localeNames.map((locale) => {
      const templateValue = template.values.get(locale);
      const objectValue = object.values.get(locale);
      return [locale, typeof templateValue === "string" && typeof objectValue === "string"
        ? templateValue.replaceAll("{object}", objectValue)
        : undefined];
    })),
  })));

  for (const locale of localeNames) {
    const values = flattened.get(locale);
    for (const key of catalogKeys) {
      if (!values.has(key)) {
        errors.push({ file: `src/i18n/locales/${locale}.json`, line: 1, msg: `${locale} 缺键 "${key}"` });
        continue;
      }
      if (!reference.has(key)) continue;
      const expected = reference.get(key);
      const actual = values.get(key);
      if (valueType(actual) !== valueType(expected)) {
        errors.push({ file: `src/i18n/locales/${locale}.json`, line: 1, msg: `"${key}" 值类型与 ${referenceLocale} 不一致` });
      } else if (typeof actual === "string" && interpolationNames(localeValue(locale, key)) !== interpolationNames(localeValue(referenceLocale, key))) {
        errors.push({ file: `src/i18n/locales/${locale}.json`, line: 1, msg: `"${key}" 插值变量与 ${referenceLocale} 不一致` });
      }
    }
  }

  // 任一语言里同一段文案只能属于一个键：同一概念合并为一个键（跨页面共用放 common.*），
  // 不同概念必须有不同译文；拉丁语按大小写不敏感比较
  for (const locale of localeNames) {
    const latin = isLatinLocale(locale);
    const identical = new Map();
    for (const [key, value] of resolved.get(locale)) {
      if (typeof value !== "string" || !value.trim()) continue;
      const signature = latin ? value.toLowerCase() : value;
      identical.set(signature, [...(identical.get(signature) ?? []), key]);
    }
    for (const keys of identical.values()) {
      if (keys.length < 2) continue;
      const survivor = keys.find((key) => key.startsWith("common.")) ?? keys.find((key) => key.startsWith("menu.")) ?? keys[0];
      for (const key of keys) {
        if (key !== survivor) errors.push({ file: `src/i18n/locales/${locale}.json`, line: 1, msg: `"${key}" 与 "${survivor}" 在 ${locale} 里文案相同：同一概念只留一个键，不同概念译文必须区分` });
      }
    }
  }

  const dynamicCalls = [];
  const validateUse = ({ file, line, keys, defaults = [], providedValues }) => {
    for (const key of keys) {
      used.add(key);
      if (!reference.has(key)) errors.push({ file, line, msg: `缺少 ${referenceLocale} 键 "${key}"` });
    }
    if (defaults.length) {
      errors.push({ file, line, msg: "文案只存在于字典：t() 不得携带默认文案（defaultValue 或第二个字符串参数）" });
    }
    if (providedValues) {
      for (const key of keys) {
        if (typeof reference.get(key) !== "string") continue;
        const missing = interpolationNameList(localeValue(referenceLocale, key)).filter((name) => !providedValues.has(name));
        if (missing.length) errors.push({ file, line, msg: `"${key}" 缺少插值变量：${missing.join(", ")}` });
      }
    }
  };

  for (const { file, text } of sources) {
    const sourceFile = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, file.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
    const bindings = resolveBindings(sourceFile);
    const staticActionCalls = collectStaticActionCalls(sourceFile, bindings);
    // 展示用的字符串常量：坐标轴类目（xAxis/yAxis.data）、清单类目（categories）里的字面量数组
    // 若含字母/汉字词，就是写死的文案（星期、月份、状态名……），必须来自 i18n 或数据本身
    const resolveArrayLiteral = (expression) => {
      const node = unwrapExpression(expression);
      if (!node) return undefined;
      if (ts.isArrayLiteralExpression(node)) return node;
      if (ts.isIdentifier(node)) {
        const declaration = resolvedDeclaration(sourceFile, node);
        const initializer = declaration?.owner?.initializer;
        return initializer && ts.isArrayLiteralExpression(unwrapExpression(initializer)) ? unwrapExpression(initializer) : undefined;
      }
      return undefined;
    };
    const reportDisplayConstantArray = (expression, context) => {
      const array = resolveArrayLiteral(expression);
      if (!array) return;
      const literal = array.elements.find((element) => ts.isStringLiteralLike(element) && HAN_TEXT.test(element.text));
      if (!literal) return;
      const line = sourceFile.getLineAndCharacterOfPosition(literal.getStart(sourceFile)).line + 1;
      errors.push({ file, line, msg: `${context}里的文案常量 "${literal.text}" 必须来自 i18n（共享词表）或数据本身，不得写死` });
    };
    const isAxisData = (node) => ts.isPropertyAssignment(node) && propertyName(node, sourceFile) === "data"
      && node.parent && ts.isObjectLiteralExpression(node.parent) && node.parent.parent && ts.isPropertyAssignment(node.parent.parent)
      && /^[xy]Axis$/.test(propertyName(node.parent.parent, sourceFile) ?? "");
    const reportVisibleHan = (node, context) => {
      if (!containsVisibleHanText(node, sourceFile, bindings)) return;
      const line = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1;
      errors.push({ file, line, msg: `${context}中的中文文案必须使用 i18n` });
    };
    const isInsideTrans = (node) => {
      let current = node.parent;
      while (current && !ts.isSourceFile(current)) {
        if (ts.isJsxElement(current) && bindings.isTransTag(current.openingElement.tagName)) return true;
        current = current.parent;
      }
      return false;
    };
    function visit(node) {
      if (isAxisData(node)) reportDisplayConstantArray(node.initializer, "坐标轴类目");
      if (ts.isJsxAttribute(node) && node.name.getText(sourceFile) === "categories" && node.initializer && ts.isJsxExpression(node.initializer)) {
        reportDisplayConstantArray(node.initializer.expression, "清单类目");
      }
      if (bindings.isShadowedTranslationCall(node)) {
        const line = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1;
        errors.push({ file, line, msg: `翻译函数绑定 "${node.expression.text}" 不得在内层作用域被同名可调用值遮蔽` });
      }
      if (isTranslationCall(node, bindings)) {
        const keys = literalValues(node.arguments[0]);
        const line = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1;
        // 翻译结果再拼接：作为另一个翻译调用插值参数的翻译调用必须是 tFragment（否则片段会先被句首大写）；
        // tFragment 只能出现在这种位置，不得直接展示
        const isFragmentCall = bindings.isFragmentIdentifier(node.expression);
        // 条件 / 空值分支仍是同一个插值值；只穿过保留值的表达式，不穿过 JSX 或未知调用。
        let interpolationValue = node;
        while (interpolationValue.parent && (
          ts.isParenthesizedExpression(interpolationValue.parent)
          || ts.isAsExpression(interpolationValue.parent)
          || ts.isSatisfiesExpression(interpolationValue.parent)
          || ts.isNonNullExpression(interpolationValue.parent)
          || (ts.isConditionalExpression(interpolationValue.parent)
            && interpolationValue.parent.condition !== interpolationValue)
          || (ts.isBinaryExpression(interpolationValue.parent)
            && [ts.SyntaxKind.QuestionQuestionToken, ts.SyntaxKind.BarBarToken, ts.SyntaxKind.AmpersandAmpersandToken].includes(interpolationValue.parent.operatorToken.kind))
        )) interpolationValue = interpolationValue.parent;
        const parentProperty = interpolationValue.parent && ts.isPropertyAssignment(interpolationValue.parent) ? interpolationValue.parent : undefined;
        const optionsObject = parentProperty?.parent;
        const nestedInTranslation = Boolean(optionsObject && ts.isObjectLiteralExpression(optionsObject)
          && ts.isCallExpression(optionsObject.parent) && optionsObject.parent.arguments[1] === optionsObject
          && isTranslationCall(optionsObject.parent, bindings));
        if (nestedInTranslation && !isFragmentCall) errors.push({ file, line, msg: "作为其它翻译插值参数的翻译调用必须用 tFragment（片段不做句首大写，由外层模板统一决定）" });
        if (isFragmentCall && !nestedInTranslation && !isFragmentSink(node)) errors.push({ file, line, msg: "tFragment 只能作为其它翻译调用的插值参数或拼接模板的输入，不得直接展示" });
        if (keys.length) {
          validateUse({ file, line, keys, defaults: defaultValues(node, sourceFile), providedValues: providedValueNames(node, sourceFile) });
          if (keys.length === 1 && !keys[0].startsWith("common.actions.") && isActionTextContext(node, sourceFile, bindings, staticActionCalls)) {
            const shared = commonActions.find((action) => localeNames.every(
              (locale) => localeValue(locale, keys[0]) === action.values.get(locale),
            ));
            if (shared) errors.push({ file, line, msg: `通用动作文案 "${keys[0]}" 必须改用 "${shared.key}"` });
          }
          if (keys.length === 1 && !keys[0].startsWith("common.actionObjectTemplates.") && !keys[0].startsWith("common.actions.") && isActionTextContext(node, sourceFile, bindings, staticActionCalls)) {
            // 动作按钮文案统一为裸动作：对象由页面标题、卡片标题或行上下文给出，
            // “刷新关联用户”“新增权限规则”这类动作+对象拼接文案不允许各页自造。
            const zh = localeValue("zh-CN", keys[0]);
            // 同义动词也视为同一动作：新建/新增、移除/删除、修改/编辑
            const synonyms = { "新建": "common.actions.create", "移除": "common.actions.delete", "修改": "common.actions.edit" };
            const prefixed = typeof zh === "string" && (commonActions.find((action) => {
              const word = action.values.get("zh-CN");
              return typeof word === "string" && zh.length > word.length && zh.startsWith(word);
            }) ?? Object.entries(synonyms).flatMap(([word, key]) => (zh.startsWith(word) ? [{ key }] : []))[0]);
            if (prefixed) errors.push({ file, line, msg: `动作按钮文案 "${keys[0]}"（${zh}）必须使用裸动作 "${prefixed.key}"；需区分对象时改用 common.actionObjectTemplates` });
          }
          const attribute = jsxAttributeContext(node, sourceFile);
          const isFieldLabel = attribute && attribute[0] === "Item" && attribute[1] === "label";
          const isHint = attribute && ((attribute[0] === "Item" && attribute[1] === "tooltip") || (attribute[0] === "HelpTip" && attribute[1] === "title") || attribute[1] === "hint");
          for (const key of keys) {
            const zh = localeValue("zh-CN", key);
            if (typeof zh !== "string") continue;
            if (isFieldLabel && LABEL_UNIT.test(zh)) errors.push({ file, line, msg: `表单标签 "${key}"（${zh}）不带单位：固定单位放进输入框的 prefix / suffix` });
            if (isHint && HINT_JARGON.test(zh)) errors.push({ file, line, msg: `字段说明 "${key}"（${zh}）写给使用者看：不出现字段名、接口取值或实现细节（下划线标识符、modal/toast、CSS、前后端、防抖）` });
            if (isHint && HINT_RESTATES_LABEL.test(zh)) errors.push({ file, line, msg: `字段说明 "${key}"（${zh}）只是复述标签：写清取值含义、默认值或限制，没有可说明的就不加问号` });
          }
          if (keys.length === 1 && !keys[0].startsWith("common.actionObjectTemplates.") && isActionTextContext(node, sourceFile, bindings, staticActionCalls)) {
            const shared = actionObjectCopies.find((candidate) => localeNames.every(
              (locale) => localeValue(locale, keys[0]) === candidate.values.get(locale),
            ));
            if (shared) errors.push({
              file,
              line,
              msg: `动作对象文案 "${keys[0]}" 必须使用 "${shared.templateKey}" 并传入 "${shared.objectKey}"`,
            });
          }
        }
        else if (!isForwardingCall(node, bindings)) dynamicCalls.push({
          anchor: nodeAnchor(node, sourceFile),
          dead: isStaticallyDead(node),
          file,
          line,
          node,
          sourceFile,
          expression: normalizeExpression(node.arguments[0], sourceFile),
        });
      }
      if (ts.isBinaryExpression(node)
        && node.operatorToken.kind === ts.SyntaxKind.PlusToken
        && (containsCommonActionCall(node.left, bindings) || containsCommonActionCall(node.right, bindings))
        && (containsTranslationCall(node.left, bindings) || containsTranslationCall(node.right, bindings))) {
        const line = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1;
        errors.push({ file, line, msg: "动作与对象不得通过 + 拼接翻译，请使用 common.actionObjectTemplates" });
      }
      if (ts.isTemplateExpression(node) && node.templateSpans.some((span) => containsCommonActionCall(span.expression, bindings))) {
        const line = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1;
        errors.push({ file, line, msg: "动作与对象不得通过模板字符串拼接翻译，请使用 common.actionObjectTemplates" });
      }
      if (ts.isJsxOpeningLikeElement(node) && bindings.isTransTag(node.tagName)) {
        const { keys, defaults, providedValues } = transAttributes(node, sourceFile);
        const line = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1;
        if (keys.length) validateUse({ file, line, keys, defaults, providedValues });
        else {
          const keyAttribute = node.attributes.properties.find(
            (item) => ts.isJsxAttribute(item) && item.name.getText(sourceFile) === "i18nKey",
          );
          const expression = keyAttribute?.initializer ? normalizeExpression(keyAttribute.initializer, sourceFile) : "<missing i18nKey>";
          dynamicCalls.push({ anchor: nodeAnchor(node, sourceFile), dead: isStaticallyDead(node), file, line, node, sourceFile, expression });
        }
      }
      if (ts.isJsxText(node) && !isInsideTrans(node) && HAN_TEXT.test(node.text)) {
        reportVisibleHan(node, "可见 JSX 文本");
      }
      if (ts.isJsxExpression(node)
        && (ts.isJsxElement(node.parent) || ts.isJsxFragment(node.parent))
        && !isInsideTrans(node)) {
        reportVisibleHan(node.expression, "可见 JSX 表达式");
      }
      if (ts.isJsxOpeningLikeElement(node)) {
        for (const attribute of node.attributes.properties) {
          if (ts.isJsxSpreadAttribute(attribute)) {
            const properties = expandStaticObject(attribute.expression, node, sourceFile);
            if (properties) for (const [name, value] of properties) {
              if (VISIBLE_TEXT_PROPS.has(name)) reportVisibleHan(value, `可见属性 ${name}`);
            }
            continue;
          }
          const name = attribute.name.getText(sourceFile);
          if (!VISIBLE_TEXT_PROPS.has(name)) continue;
          const value = attribute.initializer && ts.isJsxExpression(attribute.initializer)
            ? attribute.initializer.expression
            : attribute.initializer;
          reportVisibleHan(value, `可见属性 ${name}`);
        }
      }
      if (bindings.isAntMessageCall(node)) {
        reportVisibleHan(node.arguments[bindings.unifiedFeedbackTextArgument(node) ?? 0], "Ant message 反馈");
      }
      ts.forEachChild(node, visit);
    }
    visit(sourceFile);
  }

  if (registry.version !== 2 || !Array.isArray(registry.callsites)) {
    errors.push({ file: "src/i18n/dynamic-keys.json", line: 1, msg: "动态 key 登记必须使用 version: 2 和 callsites 数组" });
  } else {
    const registrations = new Map();
    const sourceEvidence = new Map();
    for (const entry of registry.callsites) {
      const identity = registryIdentity(entry.file, entry.expression);
      if (registrations.has(identity)) {
        errors.push({ file: "src/i18n/dynamic-keys.json", line: 1, msg: `动态 key 登记重复：${entry.file} / ${entry.expression}` });
        continue;
      }
      registrations.set(identity, entry);
      if (typeof entry.reason !== "string" || !entry.reason.trim() || !entry.dataFlow || !Array.isArray(entry.keys) || entry.keys.length === 0
        || !Array.isArray(entry.anchors) || entry.anchors.length === 0 || !Array.isArray(entry.keySources) || entry.keySources.length === 0) {
        errors.push({ file: "src/i18n/dynamic-keys.json", line: 1, msg: `动态 key 登记缺少 reason、dataFlow、keys、anchors 或 keySources：${entry.file} / ${entry.expression}` });
      }
      const anchorIds = (entry.anchors ?? []).map(anchorIdentity);
      if (new Set(anchorIds).size !== anchorIds.length) {
        errors.push({ file: "src/i18n/dynamic-keys.json", line: 1, msg: `动态 key 调用锚点重复：${entry.file} / ${entry.expression}` });
      }
      const sourceKeys = new Set();
      const evidence = [];
      for (const specification of entry.keySources ?? []) {
        const source = sourcesByFile.get(specification.file);
        if (!source || !specification.anchor || !["property", "call-argument", "call-property"].includes(specification.selector?.kind)
          || !Number.isInteger(specification.expectedMatches) || specification.expectedMatches < 1) {
          errors.push({ file: "src/i18n/dynamic-keys.json", line: 1, msg: `动态 key 数据源无效：${specification.file}` });
          continue;
        }
        const extracted = keysFromRegisteredSource(source, specification);
        evidence.push(extracted);
        if (extracted.rootCount !== 1) {
          errors.push({ file: "src/i18n/dynamic-keys.json", line: 1, msg: `动态 key 数据源锚点必须精确命中一次：${specification.file} / ${anchorIdentity(specification.anchor)}` });
        }
        if (extracted.matchCount !== specification.expectedMatches) {
          errors.push({ file: "src/i18n/dynamic-keys.json", line: 1, msg: `动态 key 数据源匹配数量变化：${specification.file}，期望 ${specification.expectedMatches}，实际 ${extracted.matchCount}` });
        }
        for (const key of extracted.keys) sourceKeys.add(key);
      }
      sourceEvidence.set(identity, evidence);
      for (const key of entry.keys ?? []) {
        used.add(key);
        if (!reference.has(key)) errors.push({ file: "src/i18n/dynamic-keys.json", line: 1, msg: `动态 key 登记引用不存在的键 "${key}"` });
        if (!sourceKeys.has(key)) errors.push({ file: "src/i18n/dynamic-keys.json", line: 1, msg: `动态 key 登记没有对应数据源字面量 "${key}"` });
      }
      for (const key of sourceKeys) {
        if (!(entry.keys ?? []).includes(key)) errors.push({ file: "src/i18n/dynamic-keys.json", line: 1, msg: `动态 key 数据源新增未登记键 "${key}"` });
      }
    }
    const observed = new Map();
    for (const call of dynamicCalls) {
      if (call.dead) {
        errors.push({ file: call.file, line: call.line, msg: `动态 i18n key 位于可静态判定的死代码：${call.expression}` });
        continue;
      }
      const identity = registryIdentity(call.file, call.expression);
      const calls = observed.get(identity) ?? [];
      calls.push(call);
      observed.set(identity, calls);
      const entry = registrations.get(identity);
      if (!entry) errors.push({ file: call.file, line: call.line, msg: `动态 i18n key 未登记：${call.expression}` });
    }
    for (const [identity, entry] of registrations) {
      const calls = observed.get(identity) ?? [];
      if (calls.length !== (entry.anchors ?? []).length) {
        errors.push({ file: "src/i18n/dynamic-keys.json", line: 1, msg: `动态 key 调用数量变化：${entry.file} / ${entry.expression}，登记 ${(entry.anchors ?? []).length}，实际 ${calls.length}` });
      }
      const actualAnchors = new Set(calls.map((call) => anchorIdentity(call.anchor)));
      for (const anchor of entry.anchors ?? []) {
        if (!actualAnchors.has(anchorIdentity(anchor))) {
          errors.push({ file: "src/i18n/dynamic-keys.json", line: 1, msg: `动态 key 调用锚点已移动或不存在：${entry.file} / ${anchorIdentity(anchor)}` });
        }
      }
      for (const call of calls) {
        if (!(entry.anchors ?? []).some((anchor) => anchorIdentity(anchor) === anchorIdentity(call.anchor))) {
          errors.push({ file: call.file, line: call.line, msg: `动态 i18n key 调用点未按 AST 位置登记：${call.expression} / ${anchorIdentity(call.anchor)}` });
        }
      }
      if (calls.length && !validateDynamicDataFlow(entry, calls, sourceEvidence.get(identity))) {
        errors.push({ file: "src/i18n/dynamic-keys.json", line: 1, msg: `动态 key 数据源无法证明到调用表达式的数据流：${entry.file} / ${entry.expression}` });
      }
    }
  }

  const unused = [...catalogKeys].filter((key) => !used.has(key)).sort();
  for (const key of unused) errors.push({ file: `src/i18n/locales/${referenceLocale}.json`, line: 1, msg: `未使用键 "${key}"` });
  return { errors, unused, used, flattened };
}

function normalizedCopy(value) {
  return String(value)
    .toLocaleLowerCase()
    .replaceAll(/\{[A-Za-z_$][\w$]*\}/g, "{#}")
    .replaceAll(/[\s\p{P}\p{S}]+/gu, "");
}

function editDistance(left, right) {
  const row = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let i = 1; i <= left.length; i += 1) {
    let diagonal = row[0];
    row[0] = i;
    for (let j = 1; j <= right.length; j += 1) {
      const previous = row[j];
      row[j] = Math.min(row[j] + 1, row[j - 1] + 1, diagonal + (left[i - 1] === right[j - 1] ? 0 : 1));
      diagonal = previous;
    }
  }
  return row[right.length];
}

export function findCopyCandidates(catalog) {
  const entries = [...flattenCatalog(catalog)].map(([key, value]) => ({ key, value, normalized: normalizedCopy(value) }))
    .filter((item) => typeof item.value === "string" && item.normalized.length >= 6);
  const candidates = [];
  for (let left = 0; left < entries.length; left += 1) {
    for (let right = left + 1; right < entries.length; right += 1) {
      const a = entries[left];
      const b = entries[right];
      const namespaceA = a.key.split(".").slice(0, 2).join(".");
      const namespaceB = b.key.split(".").slice(0, 2).join(".");
      if (namespaceA !== namespaceB) continue;
      if (a.normalized === b.normalized) {
        candidates.push({ left: a.key, right: b.key, kind: "exact", score: 1 });
        continue;
      }
      const longest = Math.max(a.normalized.length, b.normalized.length);
      const score = 1 - editDistance(a.normalized, b.normalized) / longest;
      if (score >= 0.9) candidates.push({ left: a.key, right: b.key, kind: "near", score });
    }
  }
  return candidates.sort((a, b) => b.score - a.score || a.left.localeCompare(b.left));
}

export function removeCatalogKeys(catalog, keys) {
  const output = structuredClone(catalog);
  for (const key of keys) {
    const segments = key.split(".");
    const parents = [];
    let current = output;
    for (const segment of segments.slice(0, -1)) {
      parents.push([current, segment]);
      current = current?.[segment];
      if (!current || typeof current !== "object") break;
    }
    if (current && typeof current === "object") delete current[segments.at(-1)];
    for (const [parent, segment] of parents.reverse()) {
      if (parent[segment] && Object.keys(parent[segment]).length === 0) delete parent[segment];
      else break;
    }
  }
  return output;
}
