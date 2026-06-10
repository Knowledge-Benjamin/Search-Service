FROM node:20-bullseye-slim

RUN apt-get update \
  && apt-get install -y --no-install-recommends \
    python3 \
    python3-pip \
    python3-dev \
    build-essential \
    libxml2-dev \
    libxslt1-dev \
    zlib1g-dev \
    libffi-dev \
    libssl-dev \
    pkg-config \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

RUN python3 -m pip install --no-cache-dir searx

COPY . .
RUN npm run build
RUN npm prune --production
RUN chmod +x /app/docker-entrypoint.sh

EXPOSE 8080 8081

ENTRYPOINT ["/app/docker-entrypoint.sh"]
