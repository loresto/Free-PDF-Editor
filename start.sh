#!/usr/bin/env bash
# Запуск собранного редактора (macOS / Linux).
set -euo pipefail
cd "$(dirname "$0")"

if command -v bun >/dev/null 2>&1; then
  exec bun scripts/serve.mjs --open
fi
if command -v node >/dev/null 2>&1; then
  exec node scripts/serve.mjs --open
fi

echo "Не найдены Bun и Node.js. Запустите ./install.sh или установите Node.js: https://nodejs.org"
exit 1
