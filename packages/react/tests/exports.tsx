import { MarkdownEditor, type MDXEditorMethods } from '@dsanying/dsdocs/editor';
import { PublishedContent } from '@dsanying/dsdocs/reader';
import { zhCNTranslation } from '@dsanying/dsdocs/locales/zh-CN';
import '@dsanying/dsdocs/style.css';
import { createRef } from 'react';
const editor = (
  <MarkdownEditor
    markdown="## 示例"
    editorRef={createRef<MDXEditorMethods>()}
    theme="dark"
    onChange={() => {}}
    translation={zhCNTranslation}
  />
);
const reader = (
  <PublishedContent>
    <p>示例</p>
  </PublishedContent>
);
export { editor, reader };
