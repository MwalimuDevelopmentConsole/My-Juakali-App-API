FROM node:20-slim AS base
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable
WORKDIR /app

FROM base AS prod-deps
# Install build dependencies for native modules (like bcrypt)
RUN apt-get update && apt-get install -y python3 make g++ build-essential && rm -rf /var/lib/apt/lists/*
COPY package.json pnpm-lock.yaml ./
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --prod --frozen-lockfile

FROM base
COPY --from=prod-deps /app/node_modules /app/node_modules
COPY . /app
EXPOSE 3500
RUN mkdir -p uploads storage logs
CMD [ "npm", "start" ]
