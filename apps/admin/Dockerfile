# syntax=docker/dockerfile:1.7

# Base image (shared)
FROM node:20-alpine AS base

# pnpm via corepack
RUN corepack enable && corepack prepare pnpm@10.12.1 --activate

ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"

WORKDIR /app

# Dependencies stage (cacheable)
FROM base AS deps

# Install pnpm
RUN corepack enable && corepack prepare pnpm@10.12.1 --activate

# Copy root package files for pnpm workspace
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY .npmrc ./
COPY tsconfig.json ./

# Copy app package files
COPY apps/admin/package.json ./apps/admin/

# Workspace packages (SDL-602 packages/ui, SDL-603 packages/engine) are copied
# whole, not just their package.json: each has a `prepare` script that builds
# dist/ during `pnpm install` below, and the admin resolves them from that dist.
COPY packages ./packages

# Install dependencies (use BuildKit cache for pnpm store)
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
    pnpm install --frozen-lockfile

# Allow native deps/scripts to run (if configured)
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
    pnpm rebuild

# Build stage
FROM deps AS builder

# Copy source code
COPY apps/admin ./apps/admin

# Some apps may not have a public/ directory; ensure it exists for the runner stage COPY.
RUN mkdir -p /app/apps/admin/public

# Build the application
WORKDIR /app/apps/admin
# SDL-71: no default. An absolute host baked here ends up inlined in the
# client bundle, which ties the image to one environment — the reason the test
# contour would have called production from the browser. Left unset, the admin
# uses the relative /api base and the deployed contour proxies /api/v1 to its
# own gateway. Pass this only for setups where admin and gateway are not behind
# one origin (local dev against a remote API, self-host compose).
ARG NEXT_PUBLIC_API_URL=""
# SDL-308: NEXT_PUBLIC_TELEGRAM_BOT_USERNAME removed. The Telegram deeplink
# is built server-side by auth-service (internal/services/auth_service.go,
# https://t.me/%s?start=login_%s from its own TELEGRAM_BOT_USERNAME env); the
# admin only renders the string the API returns (features/auth/oauth-buttons.tsx).
# The build arg inlined a value nothing read, and made the single promoted
# image look environment-bound when it never was. Per-contour override lives
# in auth-service, not here.
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
# Showcase: the sub-path the app is mounted under (e.g. /markerloop-studio)
# and the standalone output this image runs.
ARG NEXT_PUBLIC_BASE_PATH=""
ENV NEXT_PUBLIC_BASE_PATH=$NEXT_PUBLIC_BASE_PATH
ENV NEXT_OUTPUT=standalone
# Sentry (SDL-85). BUILD_SHA doubles as the Sentry release (the runner stage
# re-declares it for /api/health). The DSN is safe to inline — it is an ingest
# address, public in the client bundle by definition — and it does NOT tie the
# image to an environment: reporting is gated at runtime (hostname on the
# client, SENTRY_DSN env on the server), so self-host installs stay silent.
# SENTRY_AUTH_TOKEN comes in as a secret mount, never an ARG/ENV — an ENV
# would persist the credential in the layer history of a public-ish image.
# Without it the build succeeds and source maps are simply not uploaded.
ARG BUILD_SHA=""
ARG NEXT_PUBLIC_SENTRY_DSN=""
ENV BUILD_SHA=$BUILD_SHA
ENV NEXT_PUBLIC_BUILD_SHA=$BUILD_SHA
ENV NEXT_PUBLIC_SENTRY_DSN=$NEXT_PUBLIC_SENTRY_DSN
RUN --mount=type=secret,id=sentry_auth_token \
    if [ -s /run/secrets/sentry_auth_token ]; then \
      SENTRY_AUTH_TOKEN=$(cat /run/secrets/sentry_auth_token) pnpm exec next build; \
    else \
      pnpm exec next build; \
    fi

# Production stage
FROM node:20-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production

# Which artifact this container is (SDL-97). /api/health echoes it back, so CI
# can wait for *its own* image to be rolled out before running e2e instead of
# sleeping for a guessed number of seconds and testing whatever happens to be
# serving. Runtime env on purpose — the health route is server-rendered, so
# there is nothing to inline into the client bundle and nothing that would
# force a rebuild.
ARG BUILD_SHA="unknown"
ENV BUILD_SHA=$BUILD_SHA

# Copy necessary files from builder
COPY --from=builder /app/apps/admin/public ./public
COPY --from=builder /app/apps/admin/.next/standalone ./
#
# In monorepos, Next.js standalone server may resolve assets relative to
# /app/apps/admin, so we copy static assets to BOTH locations.
COPY --from=builder /app/apps/admin/.next/static ./.next/static
COPY --from=builder /app/apps/admin/.next/static ./apps/admin/.next/static
COPY --from=builder /app/apps/admin/public ./apps/admin/public

# Copy i18n messages if needed
COPY --from=builder /app/apps/admin/src/messages ./messages

# Expose port
EXPOSE 3000

ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

# Start the application
CMD ["node", "apps/admin/server.js"]

