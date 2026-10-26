# Static client on nginx. Build from the repo root:
#   docker build -f apps/client/Dockerfile --build-arg VITE_SERVER_URL=wss://your-server .
FROM node:24-alpine AS build
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
RUN npm install -g pnpm@$(node -p "require('./package.json').packageManager.split('@')[1]")
# Every workspace manifest, so the lockfile matches; only the client's sources.
COPY packages/shared packages/shared
COPY apps/server/package.json apps/server/package.json
COPY apps/client apps/client
RUN pnpm install --frozen-lockfile --filter @hangout/client...
# Baked into the bundle at build time (public, so never put secrets in VITE_*).
ARG VITE_SERVER_URL
RUN test -n "$VITE_SERVER_URL" || (echo "VITE_SERVER_URL build arg is required" && exit 1)
RUN pnpm --filter @hangout/client build
# Compress once at build time at the highest level; nginx serves the .gz files as they are (gzip_static).
# Meshopt GLBs are laid out to compress well with gzip. PNGs are already compressed.
RUN find apps/client/dist -type f \( -name '*.js' -o -name '*.css' -o -name '*.html' -o -name '*.svg' -o -name '*.json' -o -name '*.glb' \) -exec gzip -9 -k {} +

FROM nginx:1.27-alpine
COPY apps/client/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/apps/client/dist /usr/share/nginx/html
