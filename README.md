# DSdocs

DSdocs 是一个可自行部署的文档站项目，包含文档管理后台和独立读者端。管理端使用 Ant Design 和 MDXEditor，读者端使用 [Fumadocs](https://www.fumadocs.dev/) 的原生布局与交互组件。

文档正文使用 Markdown，数据库保存草稿和已发布版本。编辑自动保存为草稿，点击发布后更新读者页面，无需重新构建网站。支持目录管理、中英文关联、提示框、代码块、表格、图片和附件。

## 本地使用

需要 Node.js 26 和 pnpm 12.8.1。

```sh
pnpm install:all
pnpm build
pnpm manage
```

管理入口为 `http://127.0.0.1:5182`。首次自动创建 admin/admin，必须修改用户名和密码后才能管理文档。超级管理员管理账号，普通管理员编辑文档并维护自己的账号。

另开终端运行 `pnpm preview`，访问 `http://127.0.0.1:3200/docs`。首次没有已发布文档，从后台创建并发布即可。数据默认保存在用户目录 `.local/share/dsdocs`，可用 DSDOCS_DATA_DIR 调整，管理和读者必须指向同一内容目录。

## 范围

支持 Markdown、GFM 及限定提示框指令，不执行任意 MDX、HTML 或 JavaScript。管理端与读者端分别运行，管理进程停止后仍可读取已发布内容；数据库和附件存储仍需可用。SQLite 采用单写实例，不用于多副本共享写入。

管理界面使用成熟组件的公开接口，DSdocs 负责目录、内容、账号和发布流程。可显式关闭本地账号模块，或将内容导出到 Git 备份。

## 开发与维护

- [维护手册](docs/维护手册.md)
- [架构](ARCHITECTURE.md)
- [部署](docs/部署.md)
- [Markdown 范围](docs/设计/Markdown契约.md)
- [接口契约](docs/设计/API契约.md)
- [验收记录](docs/设计/验收记录.md)
- [发布准备](docs/发布.md)

运行 `pnpm check` 检查服务行为、类型和构建，`pnpm test:browser` 执行隔离浏览器测试。项目采用 MIT 许可证，第三方依赖保留各自许可。
