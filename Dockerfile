FROM node:22-bookworm-slim

WORKDIR /app

# Coolify runs HTTP healthchecks from inside the app container.
# node:*-slim does not include curl/wget by default.
RUN apt-get update \
  && apt-get install -y --no-install-recommends curl \
  && rm -rf /var/lib/apt/lists/*

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

EXPOSE 8787

CMD ["npm", "start"]
