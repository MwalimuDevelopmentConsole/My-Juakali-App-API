FROM node:20-slim

WORKDIR /craftory

# Install build dependencies for native packages
RUN apt-get update && apt-get install -y python3 make g++ build-essential && rm -rf /var/lib/apt/lists/*

COPY package.json ./

RUN npm install --omit=dev

COPY . .

EXPOSE 3500
RUN mkdir -p uploads storage logs

CMD [ "node", "server.js" ]