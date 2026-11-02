#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
node --version
npm ci
npm test
npm run test:ui
