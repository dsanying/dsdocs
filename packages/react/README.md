# @dsanying/dsdocs

DSdocs 的 React 集成包。宿主继续管理登录、权限、内容、草稿、发布和附件；无需启动 DSdocs 的 Node.js 管理服务或 Next.js 读者服务。

```sh
npm install @dsanying/dsdocs@0.1.0
```

宿主使用 React 19 与 React DOM 19。使用 `/editor` 时另需 `@mdxeditor/editor` 4；使用 `/reader` 时另需 `fumadocs-ui` 16，两者为可选 peer，以免仅使用编辑器的宿主安装整套读者依赖。本仓库验证的组合是 React 19.3.0、MDXEditor 4.3.3、Fumadocs UI 16.17.3；宿主应精确固定所选版本并提交锁文件。

```tsx
import { MarkdownEditor } from '@dsanying/dsdocs/editor';
import { PublishedContent } from '@dsanying/dsdocs/reader';
import '@dsanying/dsdocs/style.css';
import { zhCNTranslation } from '@dsanying/dsdocs/locales/zh-CN';
```

`MarkdownEditor` 使用 MDXEditor 官方插件，接受 `markdown`、`editorRef`、`onChange`、`onError`、`readOnly`、`theme`、`translation`、`uploadImage` 和 `previewImage`。切换文档时由宿主调用 `editorRef.current.setMarkdown()`；显式替换会重新建立内容与撤销历史，并保留当前阅读模式；普通输入、主题变化与重渲染不重建编辑器。保存期间由宿主使用原生 `inert` 暂停交互，避免将临时网络忙碌混同于文档访问权限的 `readOnly`。宿主不支持提示框指令时显式设置 `admonitions={false}`，服务端必须独立校验发布语法。

编辑器应位于客户端组件中。`onChange` 第二个参数为上游的初始化规范化标志；宿主应区分初始化与用户编辑，避免挂载即显示未保存状态。`uploadImage` 返回可写入 Markdown 的持久 URL；`previewImage` 只转换编辑会话的预览地址，不修改已保存链接。上传及预览仍须经过宿主服务端授权，不能依靠组件的 `readOnly` 实现权限。

中文界面传入 `translation={zhCNTranslation}`；英文界面使用默认翻译。中文词表来自锁定 MDXEditor 版本的官方翻译，来源和许可随包保留；宿主也可传入符合上游接口的自有翻译函数。

`PublishedContent` 使用 Fumadocs 原生正文容器；可传入受限 Markdown 渲染结果作为 children，或由宿主服务端完成校验和净化的 HTML。不得向 `dangerouslySetInnerHTML` 传入未校验的用户输入。

React 19、MDXEditor 4 与 Fumadocs 16 为 peer dependencies。CSS 必须仅从文档入口加载；公开的 `--dsdocs-surface`、`--dsdocs-text`、`--dsdocs-border` 变量可映射到宿主主题。

包只负责编辑和阅读组件。保存不自动代表发布，存储版本冲突、历史、链接和权限由宿主适配器保证。升级先在隔离环境执行宿主的编辑、发布、历史恢复、权限和浏览器回归，再统一构建发布程序；日常正文发布无需构建。
