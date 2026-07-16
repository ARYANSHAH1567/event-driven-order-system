FROM node:22-slim

WORKDIR /app

RUN apt-get update -y \
    && apt-get install -y openssl curl \
    && rm -rf /var/lib/apt/lists/*

RUN corepack enable \
    && corepack prepare pnpm@9.15.9 --activate

COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./

COPY packages/shared/package.json \
    ./packages/shared/package.json

COPY services/order-service/package.json \
    ./services/order-service/package.json

COPY services/inventory-service/package.json \
    ./services/inventory-service/package.json

COPY services/payment-service/package.json \
    ./services/payment-service/package.json

COPY services/shipping-service/package.json \
    ./services/shipping-service/package.json

RUN pnpm install --frozen-lockfile

COPY . .

ENV NODE_ENV=development

RUN pnpm --filter @ordersys/order-service run prisma:generate \
    && pnpm --filter @ordersys/inventory-service run prisma:generate \
    && pnpm --filter @ordersys/payment-service run prisma:generate \
    && pnpm --filter @ordersys/shipping-service run prisma:generate

CMD ["pnpm", "dev:order"]