Open this document in the management panel to try the supported formatting. The reader shows the result; source mode shows the Markdown. Practice in a draft, then publish to see the changes on the reader page.

:::note
This page covers common formats supported by DSdocs, not every Markdown extension. Enter the title and path in the document fields; front matter is not needed in the body.
:::

## Headings and navigation

Start body sections with level-two headings and use deeper levels only when needed. The reader generates a table of contents and heading anchors.

### Level-three heading

Use this for a subtopic within a section.

#### Level-four heading

Use this when a subtopic needs another level. Avoid overly deep outlines.

## Text and paragraphs

This is a normal paragraph. Use **bold** for key terms, _italics_ for light emphasis and ~~strikethrough~~ for a retired approach. `DSDOCS_DATA_DIR` is inline code.

Separate paragraphs with a blank line. Escape Markdown punctuation when you want to show it literally, for example \*these words are not italic\*.

> A blockquote can contain an excerpt or supporting explanation.
>
> It can include **emphasis**, `inline code` and multiple paragraphs.

---

The line above separates content. In most documents, headings provide enough structure without many horizontal rules.

## Lists and steps

Use bullets for parallel points:

- Folders organize topics.
- Pages answer specific questions.
  - Headings explain subtopics.
  - Paragraphs provide the details.

Use a numbered list for a sequence:

1. Create a document.
2. Write the body and wait for it to save.
3. Publish and open the reader page.

Use a task list to display checks:

- [x] Write a title and description.
- [x] Check links and code examples.
- [ ] Adapt this example to your own needs.

Task lists are display-only in the reader. Change the checkboxes in the editor and publish to update them.

## Tables

| Content    | Purpose                          | Example                |
| ---------- | -------------------------------- | ---------------------- |
| Heading    | Structure sections               | Getting started        |
| Callout    | Highlight supporting information | Saving updates a draft |
| Code block | Show copyable code               | JSON, Shell, Python    |

Tables work best for short comparisons. Keep long explanations in paragraphs so that narrow screens remain easy to read.

## Callouts

:::note
**Note:** Introduce context needed for the current topic.
:::

:::info
**Information:** Autosave updates the draft; publishing makes it visible to readers.
:::

:::tip
**Tip:** Check links, images and code on the reader page after writing.
:::

:::caution
**Caution:** Reloading can discard unsaved work. Keep a copy before continuing.
:::

:::danger
**Important action:** Deleting a document also removes its history. Check that you no longer need it.
:::

Use the following syntax. The directive name can be `note`, `info`, `tip`, `caution` or `danger`:

```text
:::tip
Write the message here, including **bold text** or lists.
:::
```

## Code blocks

Code blocks preserve indentation and line breaks and provide a copy button. Put the language name after the opening fence for syntax highlighting. Displayed code is not executed.

### Shell

```bash
pnpm install:all
pnpm build
pnpm manage
```

### JSON

```json
{
  "project": "DSdocs",
  "languages": ["zh", "en"],
  "publishAfterSaving": true
}
```

### Python

```python
def greet(name: str) -> str:
    return f"Hello, {name}!"

print(greet("DSdocs"))
```

### TypeScript

```ts
type DocumentStatus = 'draft' | 'published';

const document: { title: string; status: DocumentStatus } = {
  title: 'Getting started',
  status: 'draft',
};
```

### Plain text

```text
Use numbered lists for steps.
Use code fences for configuration and commands.
The body does not execute HTML, JavaScript or arbitrary React components.
```

## Links, images and attachments

- [Internal link: Writing and publishing](/docs/en/editor-guide)
- [Heading anchor: Headings and navigation](#headings-and-navigation)
- [Download the example text file]({{asset:example}})

Give images descriptive alternative text. This image is bundled with the starter content and does not depend on an external image service.

![The DSdocs draft, publish and reader workflow]({{asset:workflow}})

Write an image as `![Description](image-address)` and a download as `[Download](attachment-address)`. After uploading, use the address supplied by DSdocs rather than typing a file ID yourself.

## Supported scope

The first version supports ordinary Markdown, GFM tables and task lists, plus the five callouts shown here. Unrecognized code languages are preserved as plain text.

Tabs, mathematical formulas, footnotes, Mermaid diagrams, arbitrary HTML, MDX imports and executable components are outside the current scope. Put such syntax in a code block when you need to explain it literally.
