# 第三方依赖

dsdocs 自有代码按根目录 MIT 许可证提供。第三方依赖保留各自的许可证与版权，不因本项目的许可而变更。

主要运行依赖包括 React、Next.js、Ant Design、Fumadocs、Fumadocs Editor、FlexSearch、KaTeX、MDX 编译工具和 fflate。精确版本以各应用的依赖清单和锁文件为准。

管理端构建后，`scripts/bundle-admin.mjs` 根据实际生产依赖收集许可证，将完整声明写入制品的 `THIRD_PARTY_NOTICES.txt`。内容服务和容器中的第三方包保留自身许可证文件。再分发源码、管理端制品或容器时，应同时保留这些声明。
