# syntax=docker/dockerfile:1.7
# Shared Dockerfile for the Next.js apps (APP=web or APP=admin). Requires `output: 'standalone'`.
#   docker build -f infra/docker/next.Dockerfile --build-arg APP=web --build-arg API_URL=http://api:4610 -t csp2all-web .
FROM node:24-bookworm-slim AS build
ARG APP=web
# Next.js bakes rewrites in at build time: the /api proxy target must be provided here.
ARG API_URL=http://api:4610
ENV API_URL=${API_URL}
# Admin only: serve under a path (e.g. /admin) instead of its own hostname. Baked in at build time.
ARG ADMIN_BASE_PATH=
ENV ADMIN_BASE_PATH=${ADMIN_BASE_PATH}
RUN corepack enable
WORKDIR /repo
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc tsconfig.base.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/${APP}/package.json apps/${APP}/
RUN pnpm install --frozen-lockfile --filter @csp2all/${APP}...
COPY packages/shared packages/shared
COPY apps/${APP} apps/${APP}
ENV NEXT_TELEMETRY_DISABLED=1
RUN pnpm --filter @csp2all/shared build && pnpm --filter @csp2all/${APP} build

FROM node:24-bookworm-slim
ARG APP=web
RUN apt-get update && apt-get install -y --no-install-recommends tini && rm -rf /var/lib/apt/lists/*
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 HOSTNAME=0.0.0.0 PORT=3000
WORKDIR /app
COPY --from=build --chown=node:node /repo/apps/${APP}/.next/standalone ./
COPY --from=build --chown=node:node /repo/apps/${APP}/.next/static ./apps/${APP}/.next/static
COPY --from=build --chown=node:node /repo/apps/${APP}/public ./apps/${APP}/public
ENV APP_DIR=apps/${APP}
USER node
EXPOSE 3000
ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["sh", "-c", "node $APP_DIR/server.js"]
