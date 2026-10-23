# syntax=docker/dockerfile:1.7

# Pinned base image: version tag + digest (node:22-slim, Debian 12).
# To update: docker pull node:22-slim, then copy the new tag and digest here.
ARG NODE_IMAGE=node:22.23.4-slim@sha256:de170b39439eb0e5a3444ad7d60b015614a381e10fecae2e30ec9e735122f38d

# ---- build: all dependencies, build the site and the Pagefind index ----
FROM ${NODE_IMAGE} AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN --mount=type=cache,target=/root/.npm npm ci --ignore-scripts
COPY . .
RUN npm run build

# ---- prod-deps: production dependencies only ----
FROM ${NODE_IMAGE} AS prod-deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN --mount=type=cache,target=/root/.npm npm ci --omit=dev --ignore-scripts

# ---- client: the static site only. Export it with:
#   docker build --target client --output type=local,dest=./out .
# nginx serves the result from dist/client.
FROM scratch AS client
COPY --from=build /app/dist/client/ /

# ---- runtime: Node API server (comments, contact, moderation) ----
FROM ${NODE_IMAGE} AS runtime
ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=4321 \
    DB_PATH=/data/blog.db
WORKDIR /app
COPY --from=prod-deps /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY package.json ./
COPY scripts/dump.mjs ./scripts/dump.mjs
# /data is the SQLite volume; create it owned by the unprivileged user so a new
# named volume inherits that ownership.
RUN mkdir /data && chown node:node /data
USER node
VOLUME /data
EXPOSE 4321
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:'+process.env.PORT+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"]
CMD ["node", "dist/server/entry.mjs"]
