# SimHub — lightweight production image.
#
# The app has no build step and a single runtime dependency (Express), so a
# plain Alpine Node base keeps the final image small (~60 MB). Everything
# mutable lives under /app/data, which should be mounted as a volume.

FROM node:20-alpine

ENV NODE_ENV=production
WORKDIR /app

# Install production dependencies first so this layer only rebuilds when the
# dependency manifest changes, not on every source edit.
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

# Application source (`.dockerignore` excludes tests, docs, git metadata and
# any local data directory).
COPY server.js seed.js ./
COPY public ./public

# Persistent flat-file storage. Pre-create it owned by the unprivileged
# `node` user so named volumes inherit sane ownership on first use.
RUN mkdir -p data && chown -R node:node /app
USER node
VOLUME ["/app/data"]

EXPOSE 3000

# Liveness probe against the unauthenticated /api/health endpoint.
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/api/health').then(r => process.exit(r.status === 200 ? 0 : 1)).catch(() => process.exit(1))"

# Run node directly (not via npm) so SIGTERM reaches the server process and
# the graceful-shutdown handler in server.js can flush state.
CMD ["node", "server.js"]
