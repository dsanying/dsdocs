import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { inspectAntThemeMapping, inspectCss, inspectCssVariableContract, inspectDataPageArchitecture, inspectDependencies, inspectEntityListForms, inspectScrollSlots, inspectStyleDependencies, inspectSource, inspectTypographyScale } from "./design-governance.mjs";
import { inspectTableOrdering } from "./table-ordering-governance.mjs";
import { inspectQueryFieldBindings } from "./query-field-governance.mjs";
import { inspectManifest } from "./manifest-governance.mjs";

const frontendRoot = fileURLToPath(new URL("../", import.meta.url));
const repositoryRoot = path.resolve(frontendRoot, "../..");
const errors = [];
const cssVariableConsumers = [];
let designTokenSource;
const catalogs = ["zh-CN.json", "en-US.json"].map((name) =>
  JSON.parse(readFileSync(path.join(frontendRoot, "src/i18n/locales", name), "utf8")),
);

function walk(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const target = path.join(directory, entry.name);
    return entry.isDirectory() ? walk(target) : [target];
  });
}

for (const target of walk(path.join(frontendRoot, "src"))) {
  // Windows 的 path.relative 返回反斜杠，统一为 / 后再交给精确匹配与白名单判断
  const display = path.relative(frontendRoot, target).replace(/\\/g, "/");
  if (!/\.(?:tsx?|css|less)$/.test(display)) continue;
  const source = readFileSync(target, "utf8");
  if (display === "src/design/tokens.css") designTokenSource = { filename: display, source };
  else cssVariableConsumers.push({ filename: display, source });
  const issues = /\.(?:css|less)$/.test(display)
    ? inspectCss(source, { filename: display, tokenSource: display === "src/design/tokens.css" })
    : display === "src/design/tokens.ts" ? [] : inspectSource(source, `/${display}`, { catalogs });
  errors.push(...issues.map((issue) => `${display}:${issue.line} [${issue.rule}] ${issue.message}`));
}

errors.push(...inspectTypographyScale(
  readFileSync(path.join(frontendRoot, "src/design/tokens.ts"), "utf8"),
).map((issue) => `${issue.filename}:${issue.line} [${issue.rule}] ${issue.message}`));

errors.push(...inspectAntThemeMapping(
  readFileSync(path.join(frontendRoot, "src/config/theme.ts"), "utf8"),
).map((issue) => `${issue.filename}:${issue.line} [${issue.rule}] ${issue.message}`));

errors.push(...inspectDataPageArchitecture(cssVariableConsumers)
  .map((issue) => `${issue.filename}:${issue.line} [${issue.rule}] ${issue.message}`));

if (designTokenSource) {
  errors.push(...inspectCssVariableContract({ tokenSource: designTokenSource, consumers: cssVariableConsumers })
    .map((issue) => `${issue.filename}:${issue.line} [${issue.rule}] ${issue.message}`));
}

const pageSources = [];
for (const target of walk(path.join(frontendRoot, "src", "pages"))) {
  if (/\.tsx?$/.test(target)) pageSources.push({ filename: path.relative(frontendRoot, target).replace(/\\/g, "/"), source: readFileSync(target, "utf8") });
}
errors.push(...inspectTableOrdering(cssVariableConsumers).map((issue) => `${issue.filename}:${issue.line} [${issue.rule}] ${issue.message}`));
errors.push(...inspectQueryFieldBindings(cssVariableConsumers.filter(({filename}) => /\.tsx?$/.test(filename))).map((issue) => `${issue.filename}:${issue.line} [${issue.rule}] ${issue.message}`));
errors.push(...inspectEntityListForms(pageSources).map((issue) => `${issue.filename}:${issue.line} [${issue.rule}] ${issue.message}`));
const scrollSlotFile = (relative) => ({ filename: relative, source: readFileSync(path.join(frontendRoot, relative), "utf8") });
errors.push(...inspectScrollSlots({ slotsSource: scrollSlotFile("src/components/ui/overflowSlots.ts"), cssSource: scrollSlotFile("src/components/ui/overflowScroll.css") })
  .map((issue) => `${issue.filename}:${issue.line} [${issue.rule}] ${issue.message}`));
const packageManifest = JSON.parse(readFileSync(path.join(frontendRoot, "package.json"), "utf8"));
errors.push(...inspectDependencies({ ...packageManifest.dependencies, ...packageManifest.devDependencies }).map((name) => `package.json [FRONTEND-COMPONENTS] 禁止引入第二套通用组件库：${name}`));
errors.push(...inspectStyleDependencies({ ...packageManifest.dependencies, ...packageManifest.devDependencies }).map((name) => `package.json [FRONTEND-STYLE] 禁止引入第二套样式机制：${name}`));

const manifestPath = path.join(repositoryRoot, "docs/规范/manifest.json");
try {
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  errors.push(...inspectManifest(manifest, {
    exists: (target) => existsSync(path.join(repositoryRoot, target)),
    read: (target) => readFileSync(path.join(repositoryRoot, target), "utf8"),
    packageScripts: packageManifest.scripts,
    scripts: Object.fromEntries(readdirSync(path.join(frontendRoot, "scripts"), { withFileTypes: true })
      .filter((entry) => entry.isFile() && entry.name.endsWith(".mjs"))
      .map((entry) => [entry.name, readFileSync(path.join(frontendRoot, "scripts", entry.name), "utf8")])),
    list: (directory) => readdirSync(path.join(repositoryRoot, directory), { withFileTypes: true })
      .filter((entry) => entry.isFile()).map((entry) => `${directory}/${entry.name}`),
  }).map((message) => `docs/规范/manifest.json [FRONTEND-GATES] ${message}`));
} catch (error) {
  errors.push(`docs/规范/manifest.json [FRONTEND-GATES] 无法读取规则清单：${error.message}`);
}

if (errors.length) {
  console.error(errors.join("\n"));
  process.exit(1);
}
console.log("设计门禁通过：全量源码、组件边界、尺寸、颜色、文案与规则清单");
