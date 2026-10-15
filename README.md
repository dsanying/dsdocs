# dsdocs

dsdocs 是面向 Fumadocs 的文档管理项目，包含文档前台和管理后台。后台提供本地账号、可视化 MDX 编辑、草稿、发布、历史恢复、附件和中英文文档关联。前台使用 [Fumadocs](https://www.fumadocs.dev/) 的原生布局、组件、主题和语言菜单。

内容保存为 MDX 原文。后台使用数据库维护草稿和发布记录，也能导出已发布 MDX 与引用附件。独立文件读者端可直接从这些文件构建静态站点，不需要运行后台或连接数据库。静态站点更新需要重新导出、构建和替换产物。

当前为首版开发状态，尚未正式发布。可视化编辑使用 Fumadocs 官方编辑器，其上游仍处于实验阶段；不支持的语法保留源码编辑。具体语法范围见 [MDX 兼容矩阵](docs/设计/MDX兼容矩阵.md)。

## 本地运行

需要 Node.js 26 和 pnpm 12.8.1。

```sh
pnpm install:all
export DSDOCS_ADMIN_USERNAME=maintainer
# 在当前进程中设置 DSDOCS_ADMIN_PASSWORD，至少 12 个字符。
pnpm db:init -- --demo
pnpm build
pnpm start
```

浏览器访问 `http://localhost:3200/docs`，后台位于 `/docs/admin`。没有默认账号或默认密码。初始化仅允许执行一次，后续账号在后台管理。所有有效后台账号权限相同。

配置通过进程环境变量传入，参照 [.env.example](.env.example)。`DSDOCS_BASE_PATH` 默认 `/docs`，前后台构建使用相同值；`DSDOCS_ORIGIN` 为浏览器实际访问的 origin，例如 `https://example.org`。数据库默认位于内容服务的 `data/dsdocs.sqlite`。请将数据库和凭据放在源码目录之外。

## 独立文件部署

`apps/reader` 自带中英文示例，可以单独复制、安装和构建：

```sh
cd apps/reader
pnpm install --frozen-lockfile
pnpm build
```

将 `out` 挂载在域名的 `/docs` 子路径即可，不需要 Node.js 服务。部署到其他子路径时，在构建前设置 `DSDOCS_BASE_PATH`。

后台的“导出”下载已发布文档与附件的 ZIP。将包中的 `content/docs` 和 `public/assets` 放入文件读者端，再构建。替换整站内容时应先清理旧内容，避免已下线文件残留。命令行导出使用：

```sh
pnpm export:files -- --output /absolute/path/to/new-export-directory
```

导出目录必须不存在，命令不会覆盖已有内容。导出不包含草稿、账号、口令、会话或历史记录，不能用作数据库备份。

## 项目结构

| 目录               | 职责                                              |
| ------------------ | ------------------------------------------------- |
| `apps/admin`       | 管理界面和官方 MDX 编辑器接入                     |
| `apps/site`        | 内容服务、账号、API、数据库、动态读者端与私有预览 |
| `apps/reader`      | 使用官方文件内容源的独立静态读者端                |
| `examples/content` | 中英文 MDX 示例                                   |
| `docs`             | 架构、规范、部署与验证说明                        |

前台不修改 Fumadocs 上游源码。后台适配负责元数据、目录、翻译关联、内容校验和发布状态。SQLite 存储当前支持单实例部署。

## 开发与发布

开发和验证从 [维护手册](docs/维护手册.md) 开始。项目的运行边界见 [架构说明](ARCHITECTURE.md)，安全约束见 [安全说明](SECURITY.md)。

正式版本拟通过签名标签和 GitHub Release 发布，容器镜像与静态产物分别分发。当前只准备构建、验证和发布说明，不自动创建版本或上传镜像。详见 [发布说明](docs/发布.md)。
