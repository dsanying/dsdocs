# 第三方许可

DSdocs 自身采用 MIT。Ant Design、MDXEditor、Fumadocs、Better Auth 及其他依赖保留各自版权和许可证。项目通过它们的公开接口组合，不将上游实现声称为 DSdocs 自研代码。

构建通过 scripts/collect-licenses.mjs 收集实际安装的两端生产依赖许可。读者清单生成于 apps/reader/public/THIRD_PARTY_NOTICES.txt，管理端清单生成于 apps/manage/THIRD_PARTY_NOTICES.txt。缺失许可会使收集失败；版本固定的补充许可保存在 licenses，manifest.json 记录来源。

管理端公共组件从个人前端体系复制后由本仓独立维护，保留组件契约并按项目适配。容器中 Node.js 和第三方原生依赖保留其发行许可。
