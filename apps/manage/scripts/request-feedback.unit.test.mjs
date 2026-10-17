import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire, registerHooks } from "node:module";
import test from "node:test";
import { pathToFileURL } from "node:url";

// 运行真实请求拦截器、错误提取器和通知入口；仅替换 DOM 通知桥与浏览器 i18n 初始化。
const require = createRequire(import.meta.url);
const i18nextUrl = pathToFileURL(require.resolve("i18next")).href;
const zh = JSON.parse(await readFile(new URL("../src/i18n/locales/zh-CN.json", import.meta.url), "utf8"));
const en = JSON.parse(await readFile(new URL("../src/i18n/locales/en-US.json", import.meta.url), "utf8"));
const moduleUrl = (source) => `data:text/javascript,${encodeURIComponent(source)}`;
const i18nUrl = moduleUrl(`
 import i18next from ${JSON.stringify(i18nextUrl)};
 const instance = i18next.createInstance();
 await instance.init({lng:'zh-CN',fallbackLng:'zh-CN',resources:${JSON.stringify({ "zh-CN": { translation: zh }, "en-US": { translation: en } })},interpolation:{prefix:'{',suffix:'}',escapeValue:false}});
 export default instance;
 export const tFragment=(key)=>instance.t(key);
`);
const notificationUrl = moduleUrl(`
 export const notices=[];
 export const notification={error:(value)=>notices.push(value),success:(value)=>notices.push(value),warning:(value)=>notices.push(value)};
`);
const hooks = registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "@/i18n") return { url: i18nUrl, shortCircuit: true };
    if (specifier === "./antdStatic" && context.parentURL?.endsWith("/utils/feedback.ts")) return { url: notificationUrl, shortCircuit: true };
    if (specifier === "./requestError" && /\/utils\/(?:request|feedback)\.ts$/.test(context.parentURL ?? "")) {
      return { url: new URL("../src/utils/requestError.ts", import.meta.url).href, shortCircuit: true };
    }
    return nextResolve(specifier, context);
  },
});
const { default: axiosInstance, request, RequestError } = await import("../src/utils/request.ts");
const { failureReason, notifyActionFailed } = await import("../src/utils/feedback.ts");
const { extractRequestErrorMessage } = await import("../src/utils/requestError.ts");
const { default: i18n } = await import(i18nUrl);
const { notices } = await import(notificationUrl);
const originalAdapter = axiosInstance.defaults.adapter;

test.after(() => { axiosInstance.defaults.adapter = originalAdapter; hooks.deregister(); });

async function rejectedHttp(status, data, requester) {
  axiosInstance.defaults.adapter = async (config) => {
    const error = new Error(`Request failed with status code ${status}`);
    error.response = { status, data, config, headers: { "content-type": "application/json" } };
    throw error;
  };
  try { await requester("/test/write", { method: "POST" }); }
  catch (error) { return error; }
  assert.fail("HTTP failure must reject");
}

const requester = request;
const entry = "Shared";
for (const language of ["zh-CN", "en-US"]) {
  test(`${entry}/${language}：真实 HTTP 5xx 的读取、写入与 Error.message 均隐藏正文`, async () => {
    await i18n.changeLanguage(language);
    for (const status of [500, 502, 503, 599]) {
      const secret = "INTERNAL_DATABASE_DETAIL_SENTINEL";
      const error = await rejectedHttp(status, { code: 50, message: secret }, requester);
      assert.ok(error instanceof RequestError);
      assert.equal(error.status, status);
      assert.equal(error.message, `${i18n.t("common.request.failed")} (${status})`);
      assert.equal(extractRequestErrorMessage(error, "Load failed"), `Load failed (${status})`);
      const before = notices.length;
      notifyActionFailed("save", error);
      assert.equal(notices.length, before + 1);
      assert.equal(notices.at(-1).description, `${i18n.t("common.request.failed")} (${status})`);
      assert.ok(!JSON.stringify(notices.at(-1)).includes(secret));
    }
  });

  test(`${entry}/${language}：403 结构化业务原因保留，裸正文与 HTML 不进入写通知`, async () => {
    await i18n.changeLanguage(language);
    const error = await rejectedHttp(403, { code: 43, message: "permission denied" }, requester);
    assert.equal(error.message, "permission denied");
    assert.equal(failureReason(error), "permission denied");
    assert.equal(extractRequestErrorMessage(error, "Load failed"), "permission denied");
    for (const body of ["raw secret", "<html>secret</html>", { message: "<html>secret</html>" }]) {
      const unsafe = await rejectedHttp(403, body, requester);
      assert.equal(unsafe.message, `${i18n.t("common.request.failed")} (403)`);
      assert.equal(failureReason(unsafe), `${i18n.t("common.request.failed")} (403)`);
    }
  });
  test(`${entry}/${language}：HTTP200 业务拒绝和网络失败正常对照`, async () => {
    await i18n.changeLanguage(language);
    axiosInstance.defaults.adapter = async (config) => ({ data: { code: 12, message: "business permission denied", data: null }, status: 200, statusText: "OK", config, headers: { "content-type": "application/json" } });
    await assert.rejects(requester("/write", { method: "POST" }), (error) => {
      assert.ok(error instanceof RequestError);
      assert.equal(error.code, 12);
      assert.equal(error.status, undefined);
      assert.equal(failureReason(error), "business permission denied");
      notifyActionFailed("save", error);
      assert.equal(notices.at(-1).description, "business permission denied");
      return true;
    });
    axiosInstance.defaults.adapter = async () => { throw Object.assign(new Error("transport secret"), { request: {} }); };
    await assert.rejects(requester("/write", { method: "POST" }), (error) => {
      assert.ok(error instanceof RequestError);
      assert.equal(error.message, i18n.t("common.request.noResponse"));
      assert.equal(failureReason(error), i18n.t("common.request.noResponse"));
      notifyActionFailed("save", error);
      assert.equal(notices.at(-1).description, i18n.t("common.request.noResponse"));
      return true;
    });
  });

}

test("绕过请求封装的 HTTP 错误仍通过写入口过滤，本地 Error/业务字符串保持", () => {
  const raw = Object.assign(new Error("SERVER_SENTINEL"), { response: { status: 503, data: { message: "SERVER_SENTINEL" } } });
  assert.equal(failureReason(raw), `${i18n.t("common.request.failed")} (503)`);
  notifyActionFailed("delete", raw);
  assert.ok(!JSON.stringify(notices.at(-1)).includes("SERVER_SENTINEL"));
  assert.equal(failureReason(new Error("本地文件生成失败")), "本地文件生成失败");
  assert.equal(failureReason("  本地校验说明  "), "本地校验说明");
  assert.equal(failureReason(undefined), undefined);
  assert.equal(failureReason(new Error("")), undefined);
  assert.equal(failureReason({}), undefined);
});
