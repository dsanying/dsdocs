## Organize folders and pages

Create a folder in the folder management section and give it Chinese and English names. Choose a parent folder when you need another level. Different topics can share one sidebar without separate handbooks.

Use the document's folder field to move it. Renaming a folder updates reader navigation; changes to a document's title, path, description, folder or body reach readers when you publish. A folder containing documents or child folders cannot be deleted directly.

:::tip
Folders organize topics; headings organize a page. A few related questions often work better as sections on the same page.
:::

## Edit and save

Use the visual editor for everyday writing: choose heading levels and insert lists, tables, links, images, callouts and code blocks. Switch to source mode to edit Markdown, then return to the visual editor to check the layout.

Watch the save status:

| Status            | What to do                                                          |
| ----------------- | ------------------------------------------------------------------- |
| Waiting or saving | Keep the page open until saving finishes                            |
| Saved             | The draft is in the database; continue editing or publish           |
| Save failed       | Read the error and retry; keep a copy of your work before reloading |

If another window has modified the same document, the server rejects an outdated save. Keep your text, reload the latest version and merge the changes rather than repeatedly trying to publish.

## Publish, unpublish and restore

- **Publish** checks and exposes the current draft. Invalid formatting or missing attachments leave the previous published version intact.
- **Unpublish** removes the reader page while keeping its draft and publication history.
- **History** restores an earlier published version as a draft. Publish again to update the reader.
- **Delete** removes the document and its history. Use Unpublish if you only want to hide it temporarily.

## Images and attachments

Upload an image through the editor's image dialog. The insert-attachment action uploads a file and adds a download link. The attachment management section lets you upload and delete files centrally.

Supported types are PNG, JPEG, WebP, PDF and plain text, with a limit of 5 MiB per file. A reader can access a file only when a published document references it.

:::caution
A file referenced by a draft or published document cannot be deleted. Remove the references and publish the change first. References in historical versions do not independently prevent deletion, so check attachments after restoring an old version.
:::

## Link Chinese and English versions

1. Create a document in one language.
2. Create its counterpart in the other language and select the first document in the translation association field.
3. Write and publish both versions separately.
4. Switch languages in the reader and check that it opens the corresponding topic.

The two versions have independent drafts and publication states. DSdocs does not automatically translate the body. On the first visit, the reader chooses a language from the browser; a manual selection is remembered. The starter guides are already paired so you can try this behavior.

## Accounts and permissions

The super administrator creates and manages ordinary administrators. The super administrator account cannot be deleted or downgraded. Administrators can see only their own account and must verify their current password before changing their username or password.

Both roles have the same document editing permissions. Account changes revoke sessions and require signing in again. Passwords are stored as hashes and cannot be viewed; the super administrator can reset an ordinary administrator's password.
