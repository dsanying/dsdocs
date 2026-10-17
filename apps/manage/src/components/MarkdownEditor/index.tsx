import { upload, type Doc } from '@/services';
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
} from '@mdxeditor/editor';
import '@mdxeditor/editor/style.css';
import type { RefObject } from 'react';
import { useTranslation } from 'react-i18next';
import './style.css';
export function MarkdownEditor({
  theme,
  active,
  busy,
  editor,
  onChange,
  onError,
}: {
  theme: string;
  active: Doc;
  busy: boolean;
  editor: RefObject<MDXEditorMethods | null>;
  onChange: (body: string) => void;
  onError: (message: string) => void;
}) {
  const { t } = useTranslation();
  return (
    <MDXEditor
      className={theme === 'dark' ? 'ds-markdown-editor dark-theme' : 'ds-markdown-editor'}
      readOnly={busy}
      ref={editor}
      markdown={active.body}
      suppressHtmlProcessing
      onChange={onChange}
      onError={({ error }) => onError(error)}
      contentEditableClassName="document-prose"
      plugins={[
        headingsPlugin(),
        listsPlugin(),
        quotePlugin(),
        thematicBreakPlugin(),
        markdownShortcutPlugin(),
        linkPlugin(),
        linkDialogPlugin(),
        imagePlugin({
          imagePreviewHandler: async (src) =>
            src.replace('/docs/assets/', '/__dsdocs_content/assets/'),
          imageUploadHandler: async (file) => (await upload(file)).src,
        }),
        tablePlugin(),
        codeBlockPlugin({ defaultCodeBlockLanguage: 'text' }),
        codeMirrorPlugin({
          codeBlockLanguages: {
            text: t('dsdocs.plainText'),
            bash: 'Shell',
            json: 'JSON',
            python: 'Python',
            js: 'JavaScript',
            ts: 'TypeScript',
            yaml: 'YAML',
            sql: 'SQL',
          },
        }),
        directivesPlugin({ directiveDescriptors: [AdmonitionDirectiveDescriptor] }),
        diffSourcePlugin(),
        toolbarPlugin({
          toolbarClassName: 'document-toolbar',
          toolbarContents: () => (
            <DiffSourceToggleWrapper>
              <UndoRedo />
              <BoldItalicUnderlineToggles options={['Bold', 'Italic']} />
              <ListsToggle />
              <BlockTypeSelect />
              <CreateLink />
              <InsertImage />
              <InsertTable />
              <InsertAdmonition />
              <InsertThematicBreak />
              <ConditionalContents
                options={[
                  {
                    when: (e) => e?.editorType === 'codeblock',
                    contents: () => <ChangeCodeMirrorLanguage />,
                  },
                  { fallback: () => <InsertCodeBlock /> },
                ]}
              />
            </DiffSourceToggleWrapper>
          ),
        }),
      ]}
    />
  );
}
