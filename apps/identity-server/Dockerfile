# syntax=docker/dockerfile:1

# PEZHWAN Identity Server — multi-stage image.
#
# Stage 1: build all workspaces (required because the identity server depends
# on @pezhwan/* packages via npm workspaces at the monorepo root).
#
# Stage 2: production runtime — thin image, non-root user, only dist + node_modules.

# ---------- build ----------
FROM node:22-alpine AS build

WORKDIR /app

# Install deps first (cache-friendly layer).
COPY package.json package-lock.json ./
COPY tsconfig.base.json ./
COPY packages/shared/package.json packages/shared/package.json
COPY packages/crypto/package.json packages/crypto/package.json
COPY packages/oauth/package.json packages/oauth/package.json
COPY packages/core/package.json packages/core/package.json
COPY packages/node/package.json packages/node/package.json
COPY packages/express/package.json packages/express/package.json
COPY packages/react/package.json packages/react/package.json
COPY apps/identity-server/package.json apps/identity-server/package.json

# argon2 is a native module; Alpine needs build tools.
RUN apk add --no-cache python3 make g++ && npm ci --ignore-scripts=false

# Copy source and compile.
COPY packages packages
COPY apps/identity-server apps/identity-server
COPY demo demo
RUN npm run build

# Prune to production deps for the runtime stage.
RUN npm ci --omit=dev --ignore-scripts=false

# ---------- runtime ----------
FROM node:22-alpine AS runtime

ENV NODE_ENV=production

# Non-root user.
RUN addgroup -S pezhwan && adduser -S pezhwan -G pezhwan

WORKDIR /app

COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/packages/shared/dist ./packages/shared/dist
COPY --from=build /app/packages/shared/package.json ./packages/shared/package.json
COPY --from=build /app/packages/crypto/dist ./packages/crypto/dist
COPY --from=build /app/packages/crypto/package.json ./packages/crypto/package.json
COPY --from=build /app/packages/oauth/dist ./packages/oauth/dist
COPY --from=build /app/packages/oauth/package.json ./packages/oauth/package.json
COPY --from=build /app/packages/core/dist ./packages/core/dist
COPY --from=build /app/packages/core/package.json ./packages/core/package.json
COPY --from=build /app/packages/express/dist ./packages/express/dist
COPY --from=build /app/packages/express/package.json ./packages/express/package.json
COPY --from=build /app/packages/node/dist ./packages/node/dist
COPY --from=build /app/packages/node/package.json ./packages/node/package.json
COPY --from=build /app/apps/identity-server/dist ./apps/identity-server/dist
COPY --from=build /app/apps/identity-server/package.json ./apps/identity-server/package.json
COPY --from=build /app/demo ./demo

# libcrypto/argon2 native bindings are provided by node_modules.
WORKDIR /app/apps/identity-server

USER pezhwan

EXPOSE 4011

HEALTHCHECK --interval=15s --timeout=3s --retries=10 \
  CMD node -e "fetch('http://127.0.0.1:4011/.well-known/jwks.json').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "dist/server.js"]