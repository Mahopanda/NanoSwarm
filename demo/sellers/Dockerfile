FROM oven/bun:1
WORKDIR /app

# Install curl for healthcheck
RUN apt-get update && apt-get install -y curl && rm -rf /var/lib/apt/lists/*

COPY package.json ./
RUN bun install

COPY . .

# Run as non-root
USER bun

EXPOSE 4001 4002
# CMD is overridden by docker-compose to specify seller-a or seller-b
CMD ["bun", "run", "seller-a.ts"]
