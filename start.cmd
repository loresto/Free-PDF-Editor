@echo off
chcp 65001 >nul
cd /d "%~dp0"

where bun >nul 2>nul
if %errorlevel%==0 (
  call bun scripts/serve.mjs --open
  goto :eof
)

where node >nul 2>nul
if %errorlevel%==0 (
  call node scripts/serve.mjs --open
  goto :eof
)

echo Не найдены Bun и Node.js. Запустите install.cmd или установите Node.js: https://nodejs.org
pause
