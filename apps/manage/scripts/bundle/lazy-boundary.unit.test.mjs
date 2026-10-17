import assert from "node:assert/strict";
import test from "node:test";
import { inspectLazyBoundaries } from "./lazy-boundary.mjs";

const boundary = {
  id: "chat-markdown",
  ownerModule: "/src/pages/ChatPage/index.tsx",
  lazyModule: "/src/pages/ChatPage/components/AssistantContent.tsx",
  dependencies: ["/react-markdown/", "/remark-gfm/", "/rehype-highlight/", "/highlight.js/"],
};
const chunk = ({ fileName, modules, imports = [], dynamicImports = [], isEntry = false }) => ({
  type: "chunk", fileName, modules: Object.fromEntries(modules.map((id) => [id, {}])), imports, dynamicImports, isEntry,
});
const lazyBundle = () => ({
  "entry.js": chunk({ fileName: "entry.js", modules: ["/repo/src/main.tsx"], imports: ["chat.js"], isEntry: true }),
  "chat.js": chunk({ fileName: "chat.js", modules: [boundary.ownerModule], dynamicImports: ["assistant.js"] }),
  "assistant.js": chunk({
    fileName: "assistant.js",
    modules: [boundary.lazyModule, ...boundary.dependencies.map((name) => `/repo/node_modules${name}index.js`)],
  }),
});

test("按需依赖只存在于声明的异步边界", () => {
  assert.deepEqual(inspectLazyBoundaries(lazyBundle(), [boundary]), []);
});

test("拒绝手工分包将按需依赖泄漏到生产入口", () => {
  const bundle = lazyBundle();
  bundle["entry.js"].imports.push("markdown.js");
  bundle["assistant.js"].imports.push("markdown.js");
  bundle["markdown.js"] = chunk({
    fileName: "markdown.js",
    modules: boundary.dependencies.map((name) => `/repo/node_modules${name}index.js`),
  });
  assert.match(inspectLazyBoundaries(bundle, [boundary]).join("\n"), /泄漏到生产入口静态闭包/);
});
