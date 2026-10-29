#!/usr/bin/env bash
# Запускає tests/index.html у headless Chrome проти локального сервера (preview "energist", порт 8420)
# і друкує підсумок. Код виходу 0 лише коли всі тести пройшли.
set -euo pipefail

url="${1:-http://localhost:8420/tests/}"
chrome="/c/Program Files/Google/Chrome/Application/chrome.exe"
profile="${TMPDIR:-/tmp}/energist-headless"

dom=$("$chrome" --headless=new --disable-gpu --no-first-run --user-data-dir="$profile" \
  --virtual-time-budget=8000 --dump-dom "$url" 2>/dev/null)

echo "$dom" | grep -oE '<li class="fail">[^<]*' | sed 's/<li class="fail">/  /' || true
summary=$(echo "$dom" | grep -oE '<p id="summary">[^<]*' | sed 's/<p id="summary">//')
echo "${summary:-no summary (server down?)}"
[[ "$summary" == PASS* ]]
