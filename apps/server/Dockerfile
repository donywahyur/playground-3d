# Colyseus server. Build from the repo root: docker build -f apps/server/Dockerfile .
FROM node:24-alpine
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
RUN npm install -g pnpm@$(node -p "require('./package.json').packageManager.split('@')[1]")
# Every workspace manifest, so the lockfile matches; only the server's sources.
COPY packages/shared packages/shared
COPY apps/client/package.json apps/client/package.json
COPY apps/server apps/server
RUN pnpm install --frozen-lockfile --filter @hangout/server...

ENV NODE_ENV=production PORT=2567
EXPOSE 2567
USER node
WORKDIR /app/apps/server
# TURN: set CF_TURN_KEY_ID and CF_TURN_API_TOKEN on the container.
CMD ["node", "--import", "tsx", "src/index.ts"]
