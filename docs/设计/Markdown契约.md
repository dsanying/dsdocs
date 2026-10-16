# Markdown 契约

| 内容 | 编辑 | 读者 | 首版范围 |
| --- | --- | --- | --- |
| 段落、标题、强调、引用、分隔线 | MDXEditor 官方插件 | react-markdown + Fumadocs 原生组件 | 支持 |
| 列表、任务列表、表格 | 官方插件 | remark-gfm | 支持 |
| 链接、图片 | 官方插件及上传回调 | 原生链接与图片 | HTTP(S)、mailto、/docs/ 站内路径、锚点 |
| 代码围栏 | 官方 CodeMirror 插件 | Shiki + Fumadocs CodeBlock | 文本、Shell、JSON、Python、JS、TS、YAML、SQL，未知语言保留文本 |
| 提示框 | 官方 AdmonitionDirectiveDescriptor | remark-directive → Callout | note/tip/info/caution/danger，不允许任意属性 |
| 步骤 | 标准有序列表、分级标题 | 标准排版与目录 | 支持 |
| JSX、import、HTML、脚本、任意 directive | 不提供入口 | 不执行 | 发布拒绝 HTML/JSX 及未知指令 |

Markdown 可在编辑器中规范化空行、列表符号和强调符号，不保证字节不变。验收检查文字、层级、链接、代码和提示框语义往返。源码错误可存草稿但不得发布；错误不能替换读者上一版。不得把某个工具支持导入等同于所有语法无损。
