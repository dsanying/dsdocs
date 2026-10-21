import { MarkdownEditor as DSdocsEditor, type MDXEditorMethods } from '@dsanying/dsdocs/editor';
import '@dsanying/dsdocs/style.css';
import { upload, type Doc } from '@/services';
import { useMemo, type RefObject } from 'react';
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
  const languages = useMemo(
    () => ({
      text: t('dsdocs.plainText'),
      bash: 'Shell',
      json: 'JSON',
      python: 'Python',
      js: 'JavaScript',
      ts: 'TypeScript',
      yaml: 'YAML',
      sql: 'SQL',
    }),
    [t]
  );
  return (
    <div inert={busy}>
      <DSdocsEditor
        className="ds-markdown-editor"
        codeBlockLanguages={languages}
        theme={theme === 'dark' ? 'dark' : 'light'}
        markdown={active.body}
        editorRef={editor}
        onChange={(markdown, initialNormalize) => {
          if (!initialNormalize) onChange(markdown);
        }}
        onError={({ error }) => onError(error)}
        uploadImage={async (file) => (await upload(file)).src}
        previewImage={async (src) => src.replace('/docs/assets/', '/__dsdocs_content/assets/')}
      />
    </div>
  );
}
