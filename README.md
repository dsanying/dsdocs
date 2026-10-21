# DSdocs

DSdocs 是一个可自行部署的文档站项目，包含文档管理后台和独立读者端。管理端使用 Ant Design 和 MDXEditor，读者端使用 [Fumadocs](https://www.fumadocs.dev/) 的原生布局与交互组件。

文档正文使用 Markdown，数据库保存草稿和已发布版本。编辑自动保存为草稿，点击发布后更新读者页面，无需重新构建网站。支持目录管理、中英文关联、提示框、代码块、表格、图片和附件。

## 集成到现有 React 平台

公共组件包为 `@dsanying/dsdocs`，通过 `/editor`、`/reader` 和 `/style.css` 入口接入。宿主保留原有账号、权限、内容存储、历史与发布流程，不必再运行独立管理和读者服务。安装及升级契约见 [React 包说明](packages/react/README.md)。

## 本地使用

需要 Node.js 26 和 pnpm 12.9.0。

```sh
pnpm install:all
pnpm build
pnpm manage
```

管理入口为 `http://127.0.0.1:5182`。首次自动创建 admin/admin，必须修改用户名和密码后才能管理文档。超级管理员管理账号，普通管理员编辑文档并维护自己的账号。

另开终端运行 `pnpm preview`，访问 `http://127.0.0.1:3200/docs`。全新部署会载入中英文使用教程与 Markdown 格式示例，可直接在后台修改或删除。数据默认保存在用户目录 `.local/share/dsdocs`，可用 DSDOCS_DATA_DIR 调整，管理和读者必须指向同一内容目录。

## 范围

支持 Markdown、GFM 及限定提示框指令，不执行任意 MDX、HTML 或 JavaScript。管理端与读者端分别运行，管理进程停止后仍可读取已发布内容；数据库和附件存储仍需可用。SQLite 采用单写实例，不用于多副本共享写入。

管理界面使用成熟组件的公开接口，DSdocs 负责目录、内容、账号和发布流程。可显式关闭本地账号模块，或将内容导出到 Git 备份。

## 开发与维护

- [维护手册](docs/维护手册.md)
- [架构](ARCHITECTURE.md)
- [部署](docs/部署.md)
- [初始教程](docs/设计/初始内容.md)
- [Markdown 范围](docs/设计/Markdown契约.md)
- [接口契约](docs/设计/API契约.md)
- [验收记录](docs/设计/验收记录.md)
- [发布流程](docs/发布.md)

运行 `pnpm check` 完整检查规范、服务行为、两端类型和构建，并执行共享组件与业务浏览器测试。首次检查前运行 `pnpm -C apps/manage exec playwright install chromium firefox`；业务测试默认使用本机 Chrome，也可设置 `DSDOCS_CHROME_CHANNEL=chromium`。CI 执行静态检查及构建，浏览器验收在本地执行。项目采用 MIT 许可证，第三方依赖保留各自许可。

网站名称、字体、主题、导航与页脚可在后台「网站设置」修改，也可直接编辑数据目录中的 `workspace/site.json`。文档支持后台可视化、源码模式与 Markdown 文件三个入口；文件改动先存草稿，发布后读者可见。详细格式与冲突处理见 [文件与站点设置](docs/设计/文件与站点设置.md)。
