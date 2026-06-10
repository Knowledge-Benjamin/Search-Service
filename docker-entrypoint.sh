#!/bin/sh
set -e

# If SEARCH_SEARX_URL is not explicitly provided, use the local bundled Searx service.
if [ -z "$SEARCH_SEARX_URL" ]; then
  export SEARCH_SEARX_URL="http://127.0.0.1:8081/search"
fi

# Start Searx in the background on port 8081 only if the configured URL is local/internal.
printf "Using SEARCH_SEARX_URL=%s\n" "$SEARCH_SEARX_URL"

START_LOCAL_SEARX=0
SEARCH_SEARX_HOST=$(printf '%s' "$SEARCH_SEARX_URL" | sed -E 's#^https?://([^/]+).*#\1#')
case "$SEARCH_SEARX_HOST" in
  localhost|127.0.0.1|searx)
    START_LOCAL_SEARX=1
    ;;
  *)
    START_LOCAL_SEARX=0
    ;;
esac

if [ "$START_LOCAL_SEARX" -eq 1 ]; then
  export SEARX_BIND_ADDRESS=0.0.0.0
  export SEARX_BIND_PORT=8081

  START_CMD=""
  if command -v searx >/dev/null 2>&1; then
    START_CMD="searx"
  elif python3 -c "import searx" >/dev/null 2>&1; then
    if python3 -c "import searx.webapp" >/dev/null 2>&1; then
      START_CMD="python3 -m searx.webapp"
    elif python3 -c "import searx.run" >/dev/null 2>&1; then
      START_CMD="python3 -m searx.run"
    else
      START_CMD="python3 -m searx"
    fi
  fi

  if [ -z "$START_CMD" ]; then
    echo "ERROR: Could not determine how to start Searx."
    exit 1
  fi

  printf "Starting local Searx with: %s\n" "$START_CMD"
  sh -c "$START_CMD" &
  SEARX_PID=$!
  sleep 5
else
  printf "SEARCH_SEARX_URL is not local/internal, skipping local Searx startup.\n"
fi

printf "Starting Aris search service on port 8080\n"
npm run start

if [ "$START_LOCAL_SEARX" -eq 1 ]; then
  kill "$SEARX_PID"
fi
