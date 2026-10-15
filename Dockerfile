ARG NODE_VERSION=26.10.0
FROM node:${NODE_VERSION}-bookworm-slim AS build
WORKDIR /app
RUN npm install --global pnpm@12.8.1
COPY . .
ARG DSDOCS_BASE_PATH=/docs
ENV DSDOCS_BASE_PATH=${DSDOCS_BASE_PATH}
RUN pnpm install:all && pnpm build

FROM node:${NODE_VERSION}-bookworm-slim AS backend
WORKDIR /app/apps/site
ARG DSDOCS_BASE_PATH=/docs
ENV NODE_ENV=production DSDOCS_BASE_PATH=${DSDOCS_BASE_PATH} DSDOCS_DATABASE=/app/data/dsdocs.sqlite
COPY --from=build --chown=node:node /app/apps/site ./
COPY --from=build /app/LICENSE /app/THIRD_PARTY_NOTICES.md /app/
COPY --from=build /app/licenses /app/licenses
RUN mkdir -p /app/data && chown node:node /app/data && chmod 700 /app/data
USER node
EXPOSE 3200
CMD ["node", "node_modules/next/dist/bin/next", "start", "--hostname", "0.0.0.0", "--port", "3200"]
