#!/usr/bin/env bash
# PDF Правка — установка и первый запуск (macOS / Linux).
set -euo pipefail
cd "$(dirname "$0")"

echo "============================================================"
echo "  PDF Правка — установка"
echo "  Редактор PDF работает в браузере, данные не покидают машину."
echo "============================================================"

if command -v bun >/dev/null 2>&1; then
  PM=bun
elif command -v npm >/dev/null 2>&1; then
  PM=npm
else
  echo "Не найдены ни Bun (https://bun.sh), ни Node.js (https://nodejs.org, версия 20+)."
  exit 1
fi

echo "[1/2] Зависимости через $PM…"
"$PM" install

echo
echo "[2/2] Сборка…"
"$PM" run build

echo
echo "Готово. Открываю редактор: http://127.0.0.1:4173"
echo "Остановить сервер — Ctrl+C."
exec "$PM" run start:open
