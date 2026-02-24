FROM oven/bun:1 AS base
WORKDIR /app

# Layer cache: copy package files first
COPY package.json bun.lock ./
COPY packages/core/package.json packages/core/
COPY packages/server/package.json packages/server/
COPY packages/channels/package.json packages/channels/
COPY packages/orchestrator/package.json packages/orchestrator/
COPY packages/a2a/package.json packages/a2a/
COPY packages/cli/package.json packages/cli/
RUN bun install --frozen-lockfile

# Copy source
COPY tsconfig.json ./
COPY packages/ packages/

# Prepare writable dirs for non-root user, then drop privileges
RUN mkdir -p /home/bun/.nanoswarm/workspace && chown -R bun:bun /home/bun/.nanoswarm
USER bun

EXPOSE 4000
ENTRYPOINT ["bun", "run", "packages/cli/src/index.ts"]
CMD ["gateway"]
