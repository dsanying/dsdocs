# API 契约

所有管理接口要求登录且完成首次设置；DSDOCS_AUTH=none 仅用于显式关闭账号的受保护入口。写操作要求同源 Origin，JSON 使用字段允许清单。正文最大 1 MiB，JSON 请求最大 1.2 MB，附件最大 5 MiB。成功返回 JSON，失败返回 `{error}`，状态 400/401/403/404/409/413/415/422；内部异常为 500，不暴露详情。

| 路径 | 方法 | 权限与行为 | 验证 |
| --- | --- | --- | --- |
| /__dsdocs_auth/sign-in/username | POST | 登录，受限流保护 | system.test.mjs 首次设置与登录 |
| /__dsdocs_accounts/capabilities | GET | 是否启用账号及当前账号（id、username、role、needsSetup）；不含密码/会话 | system-browser |
| /__dsdocs_accounts | GET/POST | 管理员只读自己；超管列举和创建普通管理员 | system.test.mjs 角色隔离 |
| /__dsdocs_accounts/me | PATCH | 自己改名/改密；首次设置强制两者修改 | system.test.mjs 首次设置 |
| /__dsdocs_accounts/:id | PATCH/DELETE | 仅超管管理普通管理员 | system.test.mjs 会话撤销 |
| /__dsdocs_accounts/logout | POST | 注销当前会话 | 账号功能回归 |
| /__dsdocs_content | GET | 完整管理工作区（包括草稿），不公开 | system.test.mjs 草稿隔离 |
| /__dsdocs_content/settings | GET/PATCH | 非敏感网站设置，version 乐观锁，引用图片保护 | files.test.mjs |
| /__dsdocs_content/runtime | GET | 仅运行信息允许清单，不含密钥 | files.test.mjs |
| /__dsdocs_content/files | GET | 文件同步状态与异常 | files.test.mjs |
| /__dsdocs_content/files/compare | POST | 比较文件和面板正文，不执行内容 | files.test.mjs |
| /__dsdocs_content/files/resolve | POST | key/source/fileHash/version 校验后采用明确版本 | files.test.mjs |
| /__dsdocs_content/documents | POST | 新建文档；可指定已有 translationId 关联翻译 | system.test.mjs 翻译关联 |
| /__dsdocs_content/documents/:id | PATCH/DELETE | 版本号保存草稿／删除文档和历史 | system.test.mjs 版本冲突 |
| /__dsdocs_content/documents/:id/publish | POST | 校验 version、语法、附件后原子发布 | system.test.mjs 发布及非法正文 |
| /__dsdocs_content/documents/:id/unpublish | POST | 撤下，不删除草稿 | 内容回归 |
| /__dsdocs_content/documents/:id/revisions | GET | 发布历史 | system.test.mjs 发布历史 |
| /__dsdocs_content/documents/:id/restore | POST | 指定 revision 和 version，恢复到草稿 | 内容回归 |
| /__dsdocs_content/folders[/:id] | POST/PATCH/DELETE | 中英名称、父目录；循环与非空删除拒绝 | system.test.mjs 目录保护 |
| /__dsdocs_content/assets | GET/POST | 附件管理列表及原始二进制上传 | system.test.mjs 附件保护 |
| /__dsdocs_content/assets/:id | GET/DELETE | 登录预览／引用保护删除 | system.test.mjs 附件保护 |
| /docs/version | GET | 公开已发布内容指纹，不包含草稿正文 | 浏览器发布更新 |
| /docs/search-index.json | GET | 公开搜索，仅已发布文档，locale 区分中英 | system-browser 搜索 |
| /docs/assets/:id | GET | 仅已发布正文或网站标识设置引用的附件可读 | 读者回归 |

读者页为 `/docs/{zh|en}/{slug}`，与管理 API 不共用权限模型。默认本地管理入口为独立端口；统一域名部署使用部署文件中的代理配置，不将未保护端口直接暴露。

管理页面通过 `/`、`/folders`、`/assets`、`/settings`、`/files`、`/accounts` 提供 SPA 入口。匿名访问转到 `/login`；登录页与首次设置使用同一 React 产物。只有构建目录中格式受限的哈希静态资源可匿名读取，以支持登录表单；内容、附件与账号 API 不因此公开。`/server/`、环境文件、数据库和源码映射不属于静态入口。
