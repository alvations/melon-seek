# melon-seek — zero-build Node app (only runtime dep: leaflet)
FROM node:22-alpine

ENV NODE_ENV=production \
    PORT=5173

WORKDIR /app

# Install production deps first for better layer caching.
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

# App source (see .dockerignore for what is excluded).
# COPY . (filtered by .dockerignore) so a missing/empty data/ dir in a fresh
# clone doesn't break the build; committed data/snapshots/*.json are included.
COPY . ./

# Run as the unprivileged "node" user that ships with the image.
# data/cache must be writable for the disk cache.
RUN mkdir -p /app/data/cache /app/data/snapshots && chown -R node:node /app/data
USER node

EXPOSE 5173

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -q -O /dev/null "http://127.0.0.1:${PORT}/api/companies" || exit 1

CMD ["npm", "start"]
