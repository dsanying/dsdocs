import { HighlightStyle, syntaxHighlighting } from '@codemirror/language';
import { Tag, tags } from '@lezer/highlight';

// The upstream source editor installs a fixed light theme. A stable native
// extension maps its semantic roles to the editor palette instead of replacing
// EditorState on a theme change, which would discard an uncommitted source draft.
const standardTags = Object.values(tags).filter((value): value is Tag => value instanceof Tag);
export const sourceTheme: ReturnType<typeof syntaxHighlighting>[] = [
  syntaxHighlighting(
    HighlightStyle.define([
      { tag: standardTags, color: 'var(--baseText)' },
      { tag: tags.heading, color: 'var(--baseTextContrast)', fontWeight: 'bold' },
      { tag: tags.link, color: 'var(--accentText)', textDecoration: 'underline' },
      { tag: tags.strong, fontWeight: 'bold' },
      { tag: tags.emphasis, fontStyle: 'italic' },
      { tag: tags.strikethrough, textDecoration: 'line-through' },
    ])
  ),
];
