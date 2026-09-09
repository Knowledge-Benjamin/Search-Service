FROM node:20-bookworm-slim

RUN apt-get update \
  && apt-get install -y --no-install-recommends \
    python3 \
    python3-pip \
    python3-venv \
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

ENV PATH="/opt/searx-venv/bin:$PATH"

COPY package.json ./
RUN npm install

RUN python3 -m venv /opt/searx-venv \
  && /opt/searx-venv/bin/pip install --no-cache-dir --upgrade pip \
  && /opt/searx-venv/bin/pip install --no-cache-dir searx

COPY . .
RUN npm run build
RUN npm prune --production
RUN chmod +x /app/docker-entrypoint.sh

EXPOSE 8080 8081

ENTRYPOINT ["/app/docker-entrypoint.sh"]
