ARG NODE_VERSION=26.10.0
FROM node:${NODE_VERSION}-bookworm-slim AS build
WORKDIR /app
RUN npm install --global pnpm@12.8.1
COPY . .
RUN pnpm -C apps/reader install --frozen-lockfile && node scripts/sync-assets.mjs && pnpm -C apps/reader build && node scripts/reader-notices.mjs

FROM caddy:2.11.7 AS reader
COPY --from=build /app/apps/reader/out /srv/reader
COPY deploy/Caddyfile /etc/caddy/Caddyfile

FROM node:${NODE_VERSION}-bookworm-slim AS studio
WORKDIR /app
RUN npm install --global pnpm@12.8.1
COPY --chown=node:node apps/studio ./apps/studio
COPY LICENSE THIRD_PARTY_NOTICES.md ./
COPY licenses ./licenses
COPY scripts/collect-licenses.mjs scripts/studio-notices.mjs ./scripts/
RUN pnpm -C apps/studio install --prod --frozen-lockfile && node scripts/studio-notices.mjs && chown -R node:node /app
COPY --chown=node:node apps/reader/content/docs ./apps/reader/content/docs
USER node
WORKDIR /app/apps/studio
EXPOSE 5180
CMD ["node", "node_modules/@fumadocs-editor/studio/dist/cli.js", "--host", "--no-open"]

# Optional DSdocs shell; the official Studio target remains independently usable.
FROM node:${NODE_VERSION}-bookworm-slim AS management
WORKDIR /app
RUN npm install --global pnpm@12.8.1
COPY --chown=node:node apps/manage/package.json apps/manage/pnpm-lock.yaml apps/manage/pnpm-workspace.yaml ./apps/manage/
RUN pnpm -C apps/manage install --prod --frozen-lockfile
COPY --chown=node:node apps/manage ./apps/manage
COPY LICENSE THIRD_PARTY_NOTICES.md ./
COPY licenses ./licenses
COPY scripts/collect-licenses.mjs scripts/manage-notices.mjs ./scripts/
RUN node scripts/manage-notices.mjs && chown -R node:node /app
COPY --chown=node:node apps/reader/content/docs ./apps/reader/content/docs
USER node
WORKDIR /app/apps/manage
EXPOSE 5182
CMD ["node", "node_modules/vite/bin/vite.js", "--host", "0.0.0.0", "--port", "5182"]
