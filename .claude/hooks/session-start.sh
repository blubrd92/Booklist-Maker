#!/bin/bash
# SessionStart hook for Claude Code on the web: installs the dev
# dependencies (ESLint + Vitest) so `npm run lint` and `npm run test`
# work from the first message of a session. The tool itself has no
# build step, so this is all the environment setup the repo needs.
set -euo pipefail

# Only needed in remote (web) sessions; local checkouts manage their
# own node_modules.
if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

cd "$CLAUDE_PROJECT_DIR"

# Idempotent and cache-friendly: npm install is a fast no-op when
# node_modules is already present in the cached container state.
npm install --no-audit --no-fund
