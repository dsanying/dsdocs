# MDX 兼容矩阵

MDX 文件直接作为 Fumadocs 构建输入，保留原文。官方 Studio 提供可视化与源码模式；未被可视化识别的语法使用源码编辑，不承诺全语法可视化。

| 内容                                         | 读者端                                      | 编辑端                                 |
| -------------------------------------------- | ------------------------------------------- | -------------------------------------- |
| Markdown、GFM、frontmatter、代码围栏         | 原生 Fumadocs 编译与组件                    | 官方编辑器                             |
| Callout、Cards/Card、Tabs/Tab、Steps/Step    | 原生组件注册                                | Studio 默认组件                        |
| Accordions/Accordion、Files/Folder/File      | 原生组件注册                                | Studio 默认组件                        |
| 数学公式                                     | 官方文档所述 remark-math、rehype-katex      | 官方 syntax.math 配置                  |
| Studio 上传图片                              | 构建复制资产，图片路径适配 /docs/assets     | 官方上传与资源接口                     |
| JavaScript、import/export、自定义 React 组件 | 遵循 MDX 原生构建规则，必须由可信维护者提供 | 源码保留；需要自行提供渲染绑定         |
| Mermaid、OpenAPI、TypeTable、include 等扩展  | 当前未配置专门渲染                          | 编辑器可能提供入口，不代表读者端已接入 |

上游 Studio 默认支持的组件多于本项目读者端注册集合。新增扩展必须使用官方公开配置并验证最终读者页面；不能只看到编辑器有按钮就声称整条链路支持。
