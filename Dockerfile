ARG NODE_VERSION=26.10.0
FROM node:${NODE_VERSION}-bookworm-slim AS build
WORKDIR /app
RUN npm install --global pnpm@12.8.1
COPY package.json ./
COPY apps/manage/package.json apps/manage/pnpm-lock.yaml apps/manage/pnpm-workspace.yaml ./apps/manage/
COPY apps/manage/patches ./apps/manage/patches
COPY apps/reader/package.json apps/reader/pnpm-lock.yaml apps/reader/pnpm-workspace.yaml ./apps/reader/
RUN --mount=type=cache,id=dsdocs-pnpm,target=/root/.local/share/pnpm/store pnpm install:all
COPY . .
RUN pnpm build

FROM node:${NODE_VERSION}-bookworm-slim AS reader
WORKDIR /app
COPY --from=build --chown=node:node /app/apps/reader/.next/standalone ./
COPY --from=build --chown=node:node /app/apps/reader/.next/static ./apps/reader/.next/static
COPY --from=build --chown=node:node /app/apps/reader/public ./apps/reader/public
RUN mkdir /data && chown node:node /data
ENV DSDOCS_DATA_DIR=/data HOSTNAME=0.0.0.0 PORT=3300
USER node
EXPOSE 3300
CMD ["node", "apps/reader/server.js"]

FROM node:${NODE_VERSION}-bookworm-slim AS management
WORKDIR /app
COPY --from=build --chown=node:node /app/apps/manage ./apps/manage
COPY --from=build --chown=node:node /app/packages ./packages
RUN mkdir /data && chown node:node /data
ENV DSDOCS_DATA_DIR=/data DSDOCS_HOST=0.0.0.0 DSDOCS_PORT=5182
USER node
EXPOSE 5182
CMD ["node", "apps/manage/server/start.mjs"]
