/**
 * UI 测试预览服务的地址：默认 127.0.0.1:4173；同机并行跑其他项目的 UI 测试（同样默认 4173）时
 * 用 FRONTEND_UI_PORT 换端口。playwright.config 与需要拼完整地址的用例共用这一处。
 */
export const APP_PORT = Number(process.env.FRONTEND_UI_PORT ?? 4173);
export const APP_HOST = `127.0.0.1:${APP_PORT}`;
export const APP_ORIGIN = `http://${APP_HOST}`;
