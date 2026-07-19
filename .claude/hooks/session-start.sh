#!/bin/bash
# 3PandaLabs Claude Code on the web setup: org git identity + dev CLIs.
# Mirrors 3pandalabs/ops/claude-setup/setup.sh (the source of truth for local
# machines) so a web session has the same toolchain any org repo expects.
set -euo pipefail

if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

# --- Git identity: commits in any github.com/3pandalabs/* repo are authored
# as 3PandaLabs, never the harness default. ---
GITCONFIG_ORG="$HOME/.gitconfig-3pandalabs"
cat > "$GITCONFIG_ORG" <<'GITEOF'
[user]
	name = 3PandaLabs
	email = 305452129+3pandalabs-admin@users.noreply.github.com
GITEOF
git config --global 'includeIf.hasconfig:remote.*.url:https://github.com/3pandalabs/**.path' "$GITCONFIG_ORG"

# --- Dev CLIs (see 3pandalabs/ops tech-stack.md "DEV TOOLS" section; keep in
# sync with that list and with ops/claude-setup/setup.sh / setup.ps1) ---
if ! command -v gh >/dev/null 2>&1; then
  echo "Installing GitHub CLI (gh)..."
  apt-get update -qq && DEBIAN_FRONTEND=noninteractive apt-get install -y -qq gh
fi

if command -v npm >/dev/null 2>&1; then
  MISSING=()
  command -v supabase >/dev/null 2>&1 || MISSING+=(supabase)
  command -v vercel >/dev/null 2>&1 || MISSING+=(vercel)
  command -v eas >/dev/null 2>&1 || MISSING+=(eas-cli)
  if [ "${#MISSING[@]}" -gt 0 ]; then
    echo "Installing global CLIs: ${MISSING[*]}..."
    npm install -g "${MISSING[@]}"
  fi
fi

# Expo itself is invoked as `npx expo` (Expo deprecated the standalone global expo-cli) - no install needed.

echo "3PandaLabs dev tooling ready: gh, supabase, vercel, eas-cli."
