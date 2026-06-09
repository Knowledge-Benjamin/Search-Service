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
- `SEARCH_SEARX_URL` - optional Searx deployment for JSON search; leave blank to use default search backends
- `SEARCH_SERVICE_ORIGIN` - optional health label
- `PORT` - service listen port

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
