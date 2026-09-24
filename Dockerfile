FROM node:20-slim AS base
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN npm install -g pnpm@latest
WORKDIR /craftory

FROM base AS prod-deps
RUN apt-get update && apt-get install -y python3 make g++ build-essential && rm -rf /var/lib/apt/lists/*
COPY package.json pnpm-lock.yaml* ./
RUN pnpm install --prod --no-frozen-lockfile

FROM base
COPY --from=prod-deps /craftory/node_modules /craftory/node_modules
COPY . /craftory
EXPOSE 3500
RUN mkdir -p uploads storage logs
CMD [ "node", "server.js" ]