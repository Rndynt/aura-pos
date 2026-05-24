# ── Stage 1: builder ──────────────────────────────────────────────────────────
# Full install (devDeps required for: turbo, vite, esbuild, TypeScript)
FROM node:20-alpine AS builder

ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable

WORKDIR /app
COPY . .

RUN pnpm install --frozen-lockfile

# Runs: turbo (packages → frontend vite build → api esbuild) + build:static:api
# Result: apps/pos-terminal-web/dist/ + apps/api/dist/ + apps/api/dist/public/
RUN pnpm run build

# ── Stage 2: production dep isolation ────────────────────────────────────────
# pnpm deploy creates a standalone directory containing only the production
# node_modules for @pos/api (express, drizzle-orm, better-auth, etc.).
# Workspace packages (@pos/*) are already inlined into apps/api/dist/index.js
# by esbuild, so they do NOT need to be present at runtime.
FROM builder AS deploy-prep
RUN pnpm --filter @pos/api deploy --prod /standalone

# ── Stage 3: minimal runner ───────────────────────────────────────────────────
FROM node:20-alpine AS runner

WORKDIR /app

# Production npm dependencies (express, drizzle-orm, better-auth, ws, etc.)
# Workspace packages are NOT needed — they are bundled into dist/index.js.
COPY --from=deploy-prep /standalone/node_modules ./node_modules

# Compiled API bundle (~280 KB, all workspace code inlined by esbuild)
# Frontend static assets are at apps/api/dist/public/ (copied by build:static:api)
COPY --from=builder /app/apps/api/dist ./apps/api/dist

# SQL migration files. The bundle resolves migrations at startup via:
#   path.resolve(import.meta.dirname, "../../../migrations")
# = apps/api/dist/../../../migrations = /app/migrations  ✓
COPY --from=builder /app/migrations ./migrations

ENV NODE_ENV=production
ENV PORT=8080
EXPOSE 8080

# Run from /app so Node's module resolution finds ./node_modules
CMD ["node", "apps/api/dist/index.js"]
