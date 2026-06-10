#!/bin/sh
set -e

# If SEARCH_SEARX_URL is not explicitly provided, use the local bundled Searx service.
if [ -z "$SEARCH_SEARX_URL" ]; then
  export SEARCH_SEARX_URL="http://127.0.0.1:8081/search"
fi

# Start Searx in the background on port 8081.
# Use env vars for the bundled Searx instance.
printf "Starting Searx at %s\n" "$SEARCH_SEARX_URL"
export SEARX_BIND_ADDRESS=0.0.0.0
export SEARX_BIND_PORT=8081
python3 -m searx &
SEARX_PID=$!

# Wait a moment for Searx to initialize before starting the search service.
sleep 5

printf "Starting Aris search service on port 8080\n"
npm run start

# If the node process exits, ensure Searx is terminated as well.
kill "$SEARX_PID"
