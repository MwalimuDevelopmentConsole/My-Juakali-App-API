FROM node:20-slim AS base
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable
# [CHANGE 1] Set workdir to craftory
WORKDIR /craftory

FROM base AS prod-deps
# Install build dependencies for native modules (like bcrypt)
RUN apt-get update && apt-get install -y python3 make g++ build-essential && rm -rf /var/lib/apt/lists/*
COPY package.json pnpm-lock.yaml* ./
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --prod

FROM base
# [CHANGE 2] Copy from /craftory path
COPY --from=prod-deps /craftory/node_modules /craftory/node_modules
# [CHANGE 3] Copy source to /craftory
COPY . /craftory
EXPOSE 3500
RUN mkdir -p uploads storage logs
CMD [ "npm", "start" ]