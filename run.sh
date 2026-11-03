#!/usr/bin/env sh
set -eu
cd "$(dirname "$0")"
(cd web && npm ci && npm run build)
exec dotnet run --project src/Relay.Api
