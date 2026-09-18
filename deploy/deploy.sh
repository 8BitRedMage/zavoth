#!/usr/bin/env bash
# Builds the Wasp app and deploys it to InstaCloud as two compute services:
#   server  Node API, from Wasp's generated Dockerfile in app/.wasp/out
#   web     static client, including the prerendered landing page (deploy/web)
# First-time setup is in deploy/README.md. Extra args (e.g. --branch staging) go to `insta deploy`.
#
#   API_URL=https://<server url> ./deploy/deploy.sh [--branch <b>]
set -euo pipefail

: "${API_URL:?Set API_URL to the server's public URL (see deploy/README.md)}"

root="$(cd "$(dirname "$0")/.." && pwd)"
cd "$root/app"

EMAIL_PROVIDER=Resend wasp build
REACT_APP_API_URL="$API_URL" npx vite build

rm -rf "$root/deploy/web/build"
cp -R .wasp/out/web-app/build "$root/deploy/web/build"

# Run insta from the repo root, where `insta project link` wrote .insta/project.json.
cd "$root"
insta deploy app/.wasp/out --group server "$@"
insta deploy deploy/web --group web "$@"
