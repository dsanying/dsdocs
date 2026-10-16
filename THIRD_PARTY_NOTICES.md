# 第三方许可

DSdocs 自身采用 MIT。Fumadocs、官方 Editor/Studio 及其他依赖保留各自版权、品牌和许可证，不因整合而成为 DSdocs 自研代码。

构建时通过 `scripts/collect-licenses.mjs` 从实际安装的读者端生产依赖生成 `apps/reader/out/THIRD_PARTY_NOTICES.txt`。无法从包中找到许可的已核实文件保存在 licenses，版本及来源见 manifest.json。新增依赖必须核实许可，不能虚构版权声明。

容器中的 Node.js、Caddy 与 Studio 发行包还保留其上游许可文件。`pnpm check` 和 Studio 容器构建同时生成 `apps/studio/THIRD_PARTY_NOTICES.txt`，列出实际生产依赖许可。

统一面板的实际生产依赖另生成 `apps/manage/THIRD_PARTY_NOTICES.txt`，包含在 management 镜像中。authentik 与 PostgreSQL 通过独立官方容器运行，保留其各自许可，不将镜像许可改写为 DSdocs 的 MIT。
