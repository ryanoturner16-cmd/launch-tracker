#!/usr/bin/env bash
# CI data step (used by .github/workflows/fetch-launches.yml; runnable locally for tests).
#  1. restore the last PUBLISHED data/launches.json (curl -L follows Pages redirects; the body must pass
#     tools/check-data.mjs, so an HTML error/redirect page is never used)
#  2. run the LL2 fetch on top of it
#  3. decide: deploy only if the upcoming list is fresh (fetch exit 0) or the published copy was restored.
#     If both failed, don't deploy: the repo's committed launches.json may be days old.
# This script itself never fails the job; tools/ci-health.mjs (last workflow step) turns problems red.
# env: PAGES_DATA_URL (required), FETCH_ARGS (optional, e.g. offline fixtures for tests), GITHUB_OUTPUT (set by Actions)
set -uo pipefail
cd "$(dirname "$0")/.." || exit 1
DATA="${DATA_FILE:-data/launches.json}"   # override only for tests
URL="${PAGES_DATA_URL:?set PAGES_DATA_URL}"
out() { echo "$1"; [ -n "${GITHUB_OUTPUT:-}" ] && echo "$1" >> "$GITHUB_OUTPUT"; return 0; }

restored=false
tmp="$(mktemp)"
if curl -fsSL --proto '=https,http' --max-time 30 --retry 2 -o "$tmp" "$URL"; then
  if node tools/check-data.mjs "$tmp" "$DATA"; then cp "$tmp" "$DATA"; restored=true
  else echo "::warning::downloaded $URL is not usable launch data; ignoring it"; fi
else
  echo "::warning::could not download the last published data from $URL"
fi
rm -f "$tmp"

# shellcheck disable=SC2086
node tools/fetch-launches.mjs ${FETCH_ARGS:-}; code=$?
case "$code" in
  0) fresh=true ;;
  2|3) fresh=false ;;             # 2 = nothing refreshed, 3 = only the past-48h part refreshed
  *) fresh=false; echo "::warning::fetch-launches.mjs exited with $code" ;;
esac
if [ "$fresh" = true ] || [ "$restored" = true ]; then deploy=true
else deploy=false; echo "::warning::LL2 fetch failed and the published data could not be restored; skipping deploy so stale committed data is not shipped"; fi
out "restored=$restored"; out "fetch_code=$code"; out "deploy=$deploy"
exit 0
