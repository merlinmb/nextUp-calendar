# ─────────────────────────────────────────────────────────────
# nextUp Calendar — Docker image
# Designed for homebridge.local Docker deployments
# ─────────────────────────────────────────────────────────────

FROM node:20-alpine AS base

WORKDIR /app

# Install only production dependencies
COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force

# Copy application source
COPY server.js ./
COPY routes/   ./routes/
COPY services/ ./services/
COPY public/   ./public/

# The data directory is expected to be a mounted volume.
# Create it here so the image works standalone too.
RUN mkdir -p data && chown -R node:node /app

# Drop privileges
USER node

EXPOSE 3000

# Environment defaults (override via docker-compose / -e flags)
ENV NODE_ENV=production \
    PORT=3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s \
  CMD wget -qO- http://localhost:${PORT}/health || exit 1

CMD ["node", "server.js"]
