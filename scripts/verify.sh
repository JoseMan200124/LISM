#!/usr/bin/env bash
set -euo pipefail

npm ci --no-audit --no-fund
npm run typecheck
npm run build

echo "✓ NexaLab verificado correctamente"
