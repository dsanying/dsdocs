# DSdocs

DSdocs 将 [Fumadocs](https://www.fumadocs.dev/) 的文档读者端与官方 Studio 组合成一个文件驱动的文档项目。页面使用原生布局、搜索、语言菜单和 MDX 组件；编辑端使用官方文件树和可视化编辑器，可选的 DSdocs 管理面板提供统一导航和必要的账号操作，编辑器仍使用官方组件。

文档保存在 `apps/reader/content/docs`。Studio 保存文件，Fumadocs 构建静态站点。读者端部署在 `/docs`，后台停止不会影响已部署内容。Studio 上游仍处于实验阶段，不支持的 MDX 语法需要源码编辑。

## 本地使用

需要 Node.js 26、pnpm 12.8.1。

```sh
pnpm install:all
pnpm studio
```

在 `http://127.0.0.1:5180` 编辑文档。Studio 默认只监听本机，不需要账号；它不是可直接匿名开放到公网的后台。

需要统一管理入口时运行 `pnpm manage`，访问 `http://127.0.0.1:5182`。不配置身份服务时只显示文档编辑，不要求数据库或账号。

另一个终端验证、构建和预览：

```sh
pnpm check
pnpm preview
```

访问 `http://127.0.0.1:3200/docs`。保存文件不会自动发布；更新后重新构建，重新打开读者页面即可看到新内容。

## 目录与语言

中文文档位于 `content/docs/zh`，英文位于 `content/docs/en`。对应译文使用相同的相对路径，语言菜单按路径关联。初始语言按浏览器判断，手动选择后保存在本地。Studio 分别编辑两份文件，不提供并排翻译面板。

使用真实文件夹与 `meta.json` 组织目录、命名和排序。编辑器中的图片上传保存到 `content/docs/assets`；构建时将图片复制到静态资源目录。删除正文中的图片不会自动删除磁盘附件，未使用的文件需维护者清理。

## 部署

`apps/reader/out` 是完整的静态产物，挂载到域名 `/docs` 即可，不需要数据库或 Studio。其他子路径可通过构建变量 `DSDOCS_BASE_PATH` 设置，并调整静态服务器配置。

基础 `compose.yaml` 只启动读者端；编辑与账号服务按需组合：

| 模式         | 叠加配置                                 | 内容                                       |
| ------------ | ---------------------------------------- | ------------------------------------------ |
| 本地统一面板 | `deploy/compose.local.yaml`              | 官方编辑组件，无账号依赖                   |
| 固定密码入口 | `deploy/compose.basic.yaml`              | 原版 Studio 与 Caddy Basic Authentication  |
| 动态账号管理 | `deploy/compose.authentik.yaml`          | 统一面板、authentik、PostgreSQL 与认证代理 |
| 已有身份服务 | `deploy/compose.authentik.external.yaml` | 复用现有 authentik，不重复部署身份数据库   |

账号管理采用 authentik 原生简体中文能力，统一面板提供中文的创建、启停和重置密码操作。文档编辑器保留 Fumadocs 官方英文界面。配置及访问范围见 [账号模块](docs/账号模块.md) 和 [部署说明](docs/部署.md)。

**Studio 当前协议端点固定在根路径，整套编辑端不能只靠官方配置完整放进 `/docs/admin`。** 因此采用独立的私有编辑入口，公开站点只占用 `/docs`，不修改上游协议。

## 项目结构

| 目录          | 用途                                        |
| ------------- | ------------------------------------------- |
| `apps/reader` | 独立的原生 Fumadocs 静态读者端及 MDX 文件   |
| `apps/studio` | 官方 Studio 的版本锁定和配置                |
| `apps/manage` | 可选统一导航、官方编辑组件与账号 API 薄适配 |
| `deploy`      | Caddy、authentik 及可选 Compose 配置        |
| `scripts`     | 附件复制、预览与验证工具                    |
| `docs`        | 维护、部署、能力边界和发布说明              |

MDX 是可信维护者提供的可执行构建输入。项目不提供匿名投稿、数据库草稿、审核流或自动 Git 提交。版本与回滚使用 Git，发布使用构建与部署流程。

当前尚未正式发布。开发从 [维护手册](docs/维护手册.md) 开始，发布方式见 [发布说明](docs/发布.md)。
