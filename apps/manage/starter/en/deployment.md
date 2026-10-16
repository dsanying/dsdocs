## Run locally

Install Node.js 26 and pnpm 12.8.1, then run these commands from the project root:

```bash
pnpm install:all
pnpm build
pnpm manage
```

Start the reader in another terminal:

```bash
pnpm preview
```

The default management address is `http://127.0.0.1:5182/`; the local reader is at `http://127.0.0.1:3200/docs`. Sign in with `admin/admin` on a new installation, then change both credentials.

A new content database automatically loads these guides. Set `DSDOCS_STARTER=none` before the first management startup to begin with an empty site. Restarting or upgrading an existing site does not overwrite its content or restore deleted starter pages.

## Configure storage

Copy `.env.example` to `.env` in the project root and adapt it to your environment. Both services must use the same `DSDOCS_DATA_DIR`. The default is `.local/share/dsdocs` under the service user's home directory; account data lives in its `accounts` subdirectory.

```bash
DSDOCS_DATA_DIR=/absolute/path/to/dsdocs-data
DSDOCS_URL=http://127.0.0.1:5182
```

Replace the example with your own absolute path. `DSDOCS_URL` must match the management origin used by the browser, including its scheme, hostname and port.

:::caution
Databases, attachments and accounts are runtime data. Keep them out of the source repository. Do not put deployed passwords or session keys in source control or public backups.
:::

## Containers and the reader path

The project provides `reader` and `management` image targets. Check the ports and configuration, then run from the project root:

```bash
docker compose up --build
```

The container example exposes management on local port 5182 and the reader on local port 3300 under `/docs`. Management can write the content volume; the reader mounts it read-only. Use an HTTPS proxy for production access. `deploy/Caddyfile` contains an example reader subpath configuration.

Management currently uses a separate entry point rather than `/docs/admin`. SQLite requires a single writer and a local persistent disk; do not share its writable database across replicas or use an NFS writable database.

## Publish content or upgrade the application

Content changes need only saving and publishing in the management panel. Changing application code or build-time settings requires the appropriate dependency installation, checks and rebuild.

Readers can continue viewing published content when the management service stops, provided that the database and attachment storage remain available. This is not an independent static export.

## Back up and restore

A complete backup includes the content database, attachment directory, account database and runtime keys. Use a consistent SQLite backup method. Stop management writes before restoring, and check file permissions and attachment references.

Optional Git backup exports content into an existing repository outside this project:

```bash
DSDOCS_GIT_BACKUP_DIR=/absolute/path/to/backup-repository pnpm backup:git
```

The command uses the existing Git identity and signing key to commit the export. It does not push by default; set `DSDOCS_GIT_PUSH=1` explicitly to push. Use your deployment environment's scheduler if periodic exports are needed.

:::info
Git export includes folders, drafts, published snapshots and attachment metadata. It excludes attachment binaries, accounts and keys and cannot replace a complete backup. Drafts may contain unpublished information, so restrict access to the backup repository appropriately.
:::
