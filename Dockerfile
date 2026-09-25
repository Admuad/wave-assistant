# Multi-stage Dockerfile for unified Frontend + Backend Wave Assistant
FROM node:22-alpine AS builder

WORKDIR /app

# Install pnpm
RUN npm install -g pnpm@12.6.0

# Copy workspace definitions and configuration
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc tsconfig.base.json tsconfig.json ./
COPY artifacts ./artifacts
COPY lib ./lib
COPY scripts ./scripts

# Install dependencies and build frontend + backend bundles
RUN pnpm install
RUN pnpm run build

# Production Runner stage
FROM node:22-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=5000

COPY --from=builder /app /app

EXPOSE 5000

CMD ["node", "artifacts/api-server/dist/index.mjs"]
