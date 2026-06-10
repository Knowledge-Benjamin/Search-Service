---
title: Aris Search Service
emoji: "🔎"
colorFrom: "blue"
colorTo: "indigo"
sdk: docker
sdk_version: "1"
app_port: 8080
app_file: Dockerfile
pinned: false
---

# Aris Search Service

A custom search proxy service designed for deployed internet search access with basic proxy rotation and bot-detection evasion.

## Features

- POST `/api/search` for remote search queries
- Supports Google, Bing, DuckDuckGo, and Searx backends
- Rotates user agents, referers, and optional proxies
- Retries blocked requests with different proxies
- Deployable on Hugging Face via Docker

## Configuration

Copy `.env.example` to `.env` and configure:

- `SEARCH_PROXY_LIST` - comma-separated HTTP(S) proxy URLs; leave blank to use direct connections
- `SEARCH_SEARX_URL` - optional self-hosted Searx deployment for JSON search; when set, Searx is preferred in the default engine order
- `SEARCH_TOOL_ENGINES` - optional engine list override, e.g. `searx,duckduckgo,bing,google`
- `SEARCH_SERVICE_ORIGIN` - optional health label
- `PORT` - service listen port
- `SEARCH_EXTRACT_TIMEOUT_MS` - optional timeout for page extraction requests; defaults to `22000`

If you deploy this service in the same Hugging Face space as your app, point `SEARCH_SEARX_URL` to the local Searx instance URL so all search traffic stays self-hosted.

### Local monolithic Searx + search service

Use the included `docker-compose.yml` to run Searx and the search service together:

```bash
docker-compose up --build
```

Then use these values for local development:

- `SEARCH_SERVICE_URL=http://localhost:8080`
- `SEARCH_SEARX_URL=http://localhost:8081/search`

Inside Docker Compose, the search service talks to Searx via:

- `SEARCH_SEARX_URL=http://searx:8080/search`

### Single Docker image entrypoint

This repo now supports a single Docker image that starts both Searx and the search service together.

- The search service listens on port `8080`
- Searx listens on port `8081`
- The built image uses `docker-entrypoint.sh` to launch both processes
- If `SEARCH_SEARX_URL` is not provided, it defaults to `http://127.0.0.1:8081/search`

### Hugging Face Space usage

If you deploy this image in a Hugging Face Space, the public URL that Aris should call is the search service endpoint:

- `SEARCH_SERVICE_URL=https://<your-space-name>.hf.space`

You do not need to expose Searx directly to Aris. `SEARCH_SEARX_URL` is only for the internal search service container and should point to the local Searx endpoint inside the same image or space:

- `SEARCH_SEARX_URL=http://127.0.0.1:8081/search`

That means Aris connects to the Hugging Face Space URL for the search service, and the search service connects internally to Searx.

> Do not commit `.env` into the repository or build image. Local `.env` values are excluded from Docker builds via `.dockerignore`.

## API

POST `/api/search`

Body:

```json
{
  "query": "latest AI news",
  "engines": "google,bing,duckduckgo",
  "limit": 6
}
```

Response includes `results`, `engineUsed`, and optional `proxyUsed`.

POST `/api/extract`

Body:

```json
{
  "urls": [
    "https://example.com/article",
    "https://example.com/another-post"
  ],
  "timeoutMs": 20000,
  "limit": 3
}
```

Response includes `results` with `url`, `title`, `snippet`, and extracted `content`.
