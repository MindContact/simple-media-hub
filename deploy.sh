#!/usr/bin/env bash
# Builds the image on a remote Docker host (build context streamed over ssh) and recreates the
# container there. For a local Docker host, docker-compose.yml is simpler.
#
#   HOST=user@server ./deploy.sh
#
# On the server, ENV_FILE holds ADMIN_PASSWORD and the Jellyfin settings (see .env.example);
# keep it readable by root only. DATA_DIR keeps the settings database and the background picture.
set -euo pipefail
cd "$(dirname "$0")"

: "${HOST:?set HOST, e.g. HOST=user@server ./deploy.sh}"
PORT=${PORT:-8099}
ENV_FILE=${ENV_FILE:-/opt/media-hub/.env}
DATA_DIR=${DATA_DIR:-/opt/media-hub/data}
# Some NAS systems have a read-only $HOME: point DOCKER_CONFIG somewhere writable.
REMOTE_DOCKER_CONFIG=${REMOTE_DOCKER_CONFIG:-/tmp/media-hub-docker}

tar -c --exclude=node_modules --exclude=.git --exclude=test --exclude=data --exclude=.env . \
  | ssh "$HOST" DOCKER_CONFIG="$REMOTE_DOCKER_CONFIG" docker build -q -t simple-media-hub:latest -

ssh "$HOST" "docker rm -f media-hub >/dev/null 2>&1 || true; docker run -d --name media-hub \
  --restart unless-stopped \
  -p $PORT:8080 \
  -v $ENV_FILE:/run/secrets/media-hub.env:ro \
  -v $DATA_DIR:/data \
  simple-media-hub:latest >/dev/null && sleep 2 && docker logs media-hub"
