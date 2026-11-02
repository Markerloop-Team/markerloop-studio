# syntax=docker/dockerfile:1.7
#
# The workspace site (SDL-685): Next standalone server, port 3000.
# Built from the repo root:  docker build -f apps/site/Dockerfile .
# Same shape as apps/admin/Dockerfile; the image is environment-free — every
# address and the Sentry DSN come from runtime env:
#   PAGES_PUBLIC_API_URL  pages-service public plane (e.g. http://pages-service:8089)
#   SITES_BASE_DOMAIN     <base> of <slug>.<base>; CSP connect-src gets https://api.<base>
#   SENTRY_DSN / SENTRY_ENVIRONMENT  server-side error reporting (unset → off)

FROM node:20-alpine AS base
RUN corepack enable && corepack prepare pnpm@10.12.1 --activate
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
WORKDIR /app

FROM base AS deps
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY .npmrc ./
COPY tsconfig.json ./
COPY apps/site/package.json ./apps/site/
# Workspace packages are copied whole: their `prepare` builds dist/ during install.
COPY packages ./packages
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
    pnpm install --frozen-lockfile --filter site...

FROM deps AS builder
COPY apps/site ./apps/site
# The Element catalog manifest the site reports as X-Element-Catalog is the
# admin's generated file at the same commit (src/lib/catalog-version.ts).
COPY apps/admin/src/widgets/pages/element-catalog.json ./apps/admin/src/widgets/pages/element-catalog.json
RUN mkdir -p /app/apps/site/public
WORKDIR /app/apps/site
ARG BUILD_SHA=""
ENV BUILD_SHA=$BUILD_SHA
# SENTRY_AUTH_TOKEN only as a secret mount (source maps); never an ARG/ENV.
RUN --mount=type=secret,id=sentry_auth_token \
    if [ -s /run/secrets/sentry_auth_token ]; then \
      SENTRY_AUTH_TOKEN=$(cat /run/secrets/sentry_auth_token) pnpm exec next build; \
    else \
      pnpm exec next build; \
    fi

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ARG BUILD_SHA="unknown"
ENV BUILD_SHA=$BUILD_SHA
COPY --from=builder /app/apps/site/.next/standalone ./
COPY --from=builder /app/apps/site/.next/static ./apps/site/.next/static
COPY --from=builder /app/apps/site/public ./apps/site/public
USER node
EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"
CMD ["node", "apps/site/server.js"]
