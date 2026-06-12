# Multi-stage build: node:22-alpine builder -> slim runtime image that only
# contains server/dist (self-contained esbuild bundle) + client/dist.

FROM node:22-alpine AS build
WORKDIR /app

# Install deps first for layer caching.
COPY package.json package-lock.json ./
COPY shared/package.json shared/
COPY server/package.json server/
COPY client/package.json client/
RUN npm ci

COPY . .
RUN npm run build

# ---- runtime ----
FROM node:22-alpine
ENV NODE_ENV=production
WORKDIR /app

COPY --from=build /app/server/dist ./server/dist
COPY --from=build /app/client/dist ./client/dist

# Writable dir for the persistent leaderboard (mount a volume here).
RUN mkdir -p /app/data && chown -R node:node /app/data

EXPOSE 8080
USER node
CMD ["node", "server/dist/index.js"]
