# Colyseus server. Build from the repo root: docker build -f apps/server/Dockerfile .
FROM node:24-alpine AS build
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
RUN npm install -g pnpm@$(node -p "require('./package.json').packageManager.split('@')[1]")
# Every workspace manifest, so the lockfile matches; only the server's sources.
COPY packages/shared packages/shared
COPY apps/client/package.json apps/client/package.json
COPY apps/server apps/server
RUN pnpm install --frozen-lockfile --filter @hangout/server...
# One self-contained file (server + shared + dependencies): the runtime image needs no node_modules.
RUN pnpm --filter @hangout/server build

FROM node:24-alpine
# Commit SHA from CI, served on GET /status; the client compares it with its own (unset: "dev").
ARG BUILD_ID
ENV NODE_ENV=production PORT=2567 BUILD_ID=$BUILD_ID
WORKDIR /app
COPY --from=build /app/apps/server/dist/index.mjs ./
EXPOSE 2567
USER node
# TURN: set CF_TURN_KEY_ID and CF_TURN_API_TOKEN on the container.
CMD ["node", "index.mjs"]
