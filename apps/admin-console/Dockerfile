# PEZHWAN — admin-console (Vite SPA) image.
#
# Build from the repository root so the workspace install is satisfied:
#   docker build -f apps/admin-console/Dockerfile -t pezhwan-admin-console .
#
# Multi-stage: deps + build in node:22-alpine, then serve the static `dist/`
# with the default nginx:alpine. The default nginx config already serves
# /usr/share/nginx/html as a static site; the SPA handles its own routing, so
# no custom nginx.conf is needed here.

# ---- build stage ----
FROM node:22-alpine AS build
WORKDIR /app

# Install deps from the root workspaces (package-lock.json applies to the whole
# monorepo). Copying just package.json + the app manifest keeps this layer
# cacheable.
COPY package.json package-lock.json ./
COPY apps/admin-console/package.json ./apps/admin-console/package.json
RUN npm ci

# Copy the app sources and build the SPA (vite -> apps/admin-console/dist).
COPY apps/admin-console ./apps/admin-console
RUN npm run build --workspace pezhwan-admin-console

# ---- serve stage ----
FROM nginx:alpine
COPY --from=build /app/apps/admin-console/dist /usr/share/nginx/html

# BusyBox wget is present in nginx:alpine — probe the served SPA.
HEALTHCHECK --interval=30s --timeout=3s --retries=3 \
  CMD wget -qO- http://127.0.0.1/ >/dev/null || exit 1

EXPOSE 80