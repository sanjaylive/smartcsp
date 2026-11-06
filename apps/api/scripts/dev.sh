#!/bin/sh
# tsc (not esbuild) is required so Nest receives decorator metadata.
set -e
cd "$(dirname "$0")/.."
npx tsc -p tsconfig.build.json
npx tsc -p tsconfig.build.json --watch --preserveWatchOutput &
TSC=$!
trap 'kill $TSC' EXIT INT TERM
node --enable-source-maps --watch-path=dist dist/main.js
