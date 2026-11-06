# syntax=docker/dockerfile:1.7
# CSP2All API + worker image (same image; the worker runs `node dist/worker.js`).
# Build from the repository root:  docker build -f infra/docker/api.Dockerfile -t csp2all-api .
FROM node:24-bookworm-slim AS build
RUN corepack enable && apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
WORKDIR /repo
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc tsconfig.base.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/api/package.json apps/api/
RUN pnpm install --frozen-lockfile --filter @csp2all/api...
COPY packages/shared packages/shared
COPY apps/api apps/api
RUN pnpm --filter @csp2all/shared build \
 && pnpm --filter @csp2all/api build \
 && pnpm deploy --legacy --filter=@csp2all/api --prod /out \
 && cp -r apps/api/dist apps/api/prisma /out/ \
 && cd /out && ./node_modules/.bin/prisma generate

FROM node:24-bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates tini && rm -rf /var/lib/apt/lists/*
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build --chown=node:node /out ./
USER node
EXPOSE 4610
HEALTHCHECK --interval=30s --timeout=5s --retries=3 CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||4610)+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["node", "dist/main.js"]
