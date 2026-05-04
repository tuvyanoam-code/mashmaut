#!/usr/bin/env bash
set -e

# One-time setup script for the mashmaut-api Cloudflare Worker.
# Prerequisite: `npx wrangler login` (you only do this once, in a browser).

cd "$(dirname "$0")"

echo ""
echo "▶ Installing wrangler…"
npm install --silent

echo ""
echo "▶ Verifying Cloudflare auth…"
if ! npx wrangler whoami >/dev/null 2>&1; then
  echo "  Not logged in. Run: npx wrangler login"
  exit 1
fi

# Helper: read existing namespace ID, or create + capture it.
ensure_kv () {
  local NAME="$1"
  local CUR=$(grep -A1 "binding = \"$NAME\"" wrangler.toml | grep '^id =' | sed -E 's/.*"([^"]+)".*/\1/')
  if [ "$CUR" = "REPLACE_WITH_${NAME}_KV_ID" ] || [ -z "$CUR" ]; then
    echo "  Creating KV namespace: $NAME"
    OUT=$(npx wrangler kv namespace create "$NAME" 2>&1)
    ID=$(echo "$OUT" | grep -oE 'id = "[a-f0-9]+"' | head -1 | sed -E 's/.*"([^"]+)".*/\1/')
    if [ -z "$ID" ]; then
      echo "  Failed to parse namespace ID. Output: $OUT"
      exit 1
    fi
    echo "  → $ID"
    # Replace placeholder in wrangler.toml
    sed -i.bak "s/REPLACE_WITH_${NAME}_KV_ID/$ID/" wrangler.toml
    rm -f wrangler.toml.bak
  else
    echo "  KV namespace $NAME already configured: $CUR"
  fi
}

echo ""
echo "▶ Creating KV namespaces…"
ensure_kv "EMAILS"
ensure_kv "EVENTS"

echo ""
echo "▶ Setting secrets…"
if [ -f .dev.vars ]; then
  while IFS='=' read -r k v; do
    [ -z "$k" ] || [ "${k#\#}" != "$k" ] && continue
    echo "  Setting $k"
    echo "$v" | npx wrangler secret put "$k" >/dev/null 2>&1 || true
  done < .dev.vars
fi

echo ""
echo "▶ Deploying Worker…"
npx wrangler deploy

echo ""
echo "▶ Done."
echo ""
echo "Your Worker URL is shown above (looks like https://mashmaut-api.<subdomain>.workers.dev)."
echo "Paste it into the admin Settings page (apiBase + adminApiKey)."
