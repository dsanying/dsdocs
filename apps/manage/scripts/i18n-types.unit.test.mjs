import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const root = fileURLToPath(new URL("../", import.meta.url));
const declaration = path.join(root, "src/i18n/i18next.d.ts");
const probe = path.join(root, "src/i18n/__type_probe.tsx");
const config = ts.readConfigFile(path.join(root, "tsconfig.app.json"), ts.sys.readFile);
assert.equal(config.error, undefined);
const { options } = ts.parseJsonConfigFileContent(config.config, ts.sys, root);
const imports = `
import i18n, {tFragment} from "./index";
import type {TranslationKey} from "./index";
import {bilingualText} from "./bilingual";
import {useTranslation} from "react-i18next";
import type {TFunction} from "i18next";
`;

// Windows 上 join 产出反斜杠，而 TypeScript 内部归一化为正斜杠；比较前统一归一。
const normalizePath = (value) => String(value ?? "").replace(/\\/g, "/");
const probeNormalized = normalizePath(probe);

function diagnostics(body) {
  const source = ts.createSourceFile(probe, imports + body, options.target, true, ts.ScriptKind.TSX);
  const host = ts.createCompilerHost(options);
  const read = host.getSourceFile.bind(host);
  host.getSourceFile = (file, ...args) => normalizePath(file) === probeNormalized ? source : read(file, ...args);
  const program = ts.createProgram([declaration, probe], options, host);
  return ts.getPreEmitDiagnostics(program).map((diagnostic) => ({
    file: diagnostic.file?.fileName,
    message: ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n"),
  }));
}

test("真实字典类型允许 hook、TFunction、共享包装器与有限动态键", () => {
  assert.deepEqual(diagnostics(`
    function render(t: TFunction, active: boolean) {
      const key: TranslationKey = active ? "common.vocab.status" : "common.vocab.hour";
      t(key); i18n.t(key); tFragment(key); bilingualText(key);
    }
    function Component() { const {t} = useTranslation(); return t("common.vocab.hour"); }
  `), []);
});

test("不存在的键、默认值掩盖与任意字符串在编译阶段均失败", () => {
  const result = diagnostics(`
    function render(t: TFunction, key: string) {
      t("__missing_translation_key__");
      t("__missing_translation_key__", {defaultValue: "fallback"});
      i18n.t("__missing_translation_key__");
      tFragment("__missing_translation_key__");
      bilingualText("__missing_translation_key__");
      t(key);
    }
    function Component() { const {t} = useTranslation(); return t("__missing_translation_key__"); }
  `);
  assert.equal(result.length, 7, JSON.stringify(result));
  assert.ok(result.every((diagnostic) => normalizePath(diagnostic.file) === probeNormalized));
  assert.equal(result.filter((diagnostic) => diagnostic.message.includes("__missing_translation_key__")).length, 6);
});
