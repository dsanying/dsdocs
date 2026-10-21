'use client';

import {
  AdmonitionDirectiveDescriptor,
  BlockTypeSelect,
  BoldItalicUnderlineToggles,
  ChangeCodeMirrorLanguage,
  codeBlockPlugin,
  codeMirrorPlugin,
  ConditionalContents,
  CreateLink,
  diffSourcePlugin,
  DiffSourceToggleWrapper,
  directivesPlugin,
  headingsPlugin,
  imagePlugin,
  InsertAdmonition,
  InsertCodeBlock,
  InsertImage,
  InsertTable,
  InsertThematicBreak,
  linkDialogPlugin,
  linkPlugin,
  listsPlugin,
  ListsToggle,
  markdownShortcutPlugin,
  MDXEditor,
  quotePlugin,
  tablePlugin,
  thematicBreakPlugin,
  toolbarPlugin,
  UndoRedo,
  type MDXEditorMethods,
  type MDXEditorProps,
} from '@mdxeditor/editor';
import { useMemo, type Ref } from 'react';

export type { MDXEditorMethods } from '@mdxeditor/editor';

/** The host owns authorization, persistence and upload URLs; this package never fetches content. */
export interface MarkdownEditorProps {
  markdown: string;
  className?: string;
  editorRef?: Ref<MDXEditorMethods>;
  readOnly?: boolean;
  theme?: 'light' | 'dark';
  onChange: MDXEditorProps['onChange'];
  onError?: MDXEditorProps['onError'];
  translation?: MDXEditorProps['translation'];
  uploadImage?: (file: File) => Promise<string>;
  previewImage?: (src: string) => Promise<string>;
  admonitions?: boolean;
  codeBlockLanguages?: Record<string, string>;
}

const defaultLanguages = {
  text: 'Text',
  bash: 'Shell',
  json: 'JSON',
  python: 'Python',
  js: 'JavaScript',
  ts: 'TypeScript',
  yaml: 'YAML',
  sql: 'SQL',
};

export function MarkdownEditor({
  markdown,
  className,
  editorRef,
  readOnly = false,
  theme = 'light',
  onChange,
  onError,
  translation,
  uploadImage,
  previewImage,
  admonitions = true,
  codeBlockLanguages = defaultLanguages,
}: MarkdownEditorProps) {
  const plugins = useMemo(
    () => [
      headingsPlugin(),
      listsPlugin(),
      quotePlugin(),
      thematicBreakPlugin(),
      markdownShortcutPlugin(),
      linkPlugin(),
      linkDialogPlugin(),
      imagePlugin({ imageUploadHandler: uploadImage, imagePreviewHandler: previewImage }),
      tablePlugin(),
      codeBlockPlugin({ defaultCodeBlockLanguage: 'text' }),
      codeMirrorPlugin({ codeBlockLanguages }),
      ...(admonitions
        ? [directivesPlugin({ directiveDescriptors: [AdmonitionDirectiveDescriptor] })]
        : []),
      diffSourcePlugin(),
      toolbarPlugin({
        toolbarClassName: 'dsdocs-editor-toolbar',
        toolbarContents: () => (
          <DiffSourceToggleWrapper>
            <UndoRedo />
            <BoldItalicUnderlineToggles options={['Bold', 'Italic']} />
            <ListsToggle />
            <BlockTypeSelect />
            <CreateLink />
            <InsertImage />
            <InsertTable />
            {admonitions ? <InsertAdmonition /> : null}
            <InsertThematicBreak />
            <ConditionalContents
              options={[
                {
                  when: (editor) => editor?.editorType === 'codeblock',
                  contents: () => <ChangeCodeMirrorLanguage />,
                },
                { fallback: () => <InsertCodeBlock /> },
              ]}
            />
          </DiffSourceToggleWrapper>
        ),
      }),
    ],
    [uploadImage, previewImage, admonitions, codeBlockLanguages]
  );
  return (
    <MDXEditor
      className={['dsdocs-editor', className, theme === 'dark' ? 'dark-theme' : '']
        .filter(Boolean)
        .join(' ')}
      contentEditableClassName="dsdocs-editor-prose"
      ref={editorRef}
      markdown={markdown}
      readOnly={readOnly}
      suppressHtmlProcessing
      onChange={onChange}
      onError={onError}
      translation={translation}
      plugins={plugins}
    />
  );
}
