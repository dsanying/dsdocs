DSdocs brings document management and reading into one project. Authors write in the management panel; readers see published versions on the documentation site. These starter guides are real documents that you can edit, publish or delete.

## Explore the documentation

- **Guide** explains how to write and publish a document.
- **Markdown examples** shows the supported formatting. Open its source to learn the syntax.
- **Deployment and backup** explains how to run the services and keep your data.

Browse the left sidebar or search for a title or phrase. The table of contents links to sections on the current page. On narrow screens, open the navigation menu to browse the site.

## Publish your first document

### 1. Sign in

The default local management address is `http://127.0.0.1:5182/`. For a deployed site, ask the site maintainer for the management address; it may use a different domain from the reader.

A new installation starts with `admin/admin`. You must change both the username and password, then sign in again. The super administrator manages accounts; administrators can edit documents and change their own account details.

### 2. Create and write

Open the documents section, choose the new-document action, and enter a title, path and language. Use a recognizable lowercase path such as `my-first-document`; its English reader address will be `/docs/en/my-first-document`.

Write in the visual editor or switch to source mode to edit Markdown. After making changes, wait for the saved status before continuing.

:::info
Autosave updates the draft. Readers do not see draft changes until you publish them.
:::

### 3. Publish and check

Click Publish and open the reader page to review the result. No rebuild is needed. Visible reader pages check periodically for updates and also check when you return to the window.

![The workflow from draft to published reader page]({{asset:workflow}})

## Make the site your own

Edit these documents directly, or create your own folders and pages before unpublishing or deleting the examples. Starter content is loaded only when a new content database is first created. Restarting the service does not restore content that you have changed or deleted.

Organize folders around reader needs, such as Getting started, Guides and Common questions. Keep a complete topic on one page and use section headings for closely related questions.

## Next steps

- Read [Writing and publishing](/docs/en/editor-guide) for folders, attachments, history and translation links.
- Explore [Markdown examples](/docs/en/markdown) and compare the page with its source.
- See [Deployment and backup](/docs/en/deployment) when running your own installation.
