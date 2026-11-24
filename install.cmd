@echo off
chcp 65001 >nul
setlocal
cd /d "%~dp0"

echo ============================================================
echo   PDF Правка — установка
echo   Редактор PDF целиком работает в браузере, сервер не нужен.
echo ============================================================
echo.

where bun >nul 2>nul
if %errorlevel%==0 (
  set "PM=bun"
  goto install
)

where npm >nul 2>nul
if %errorlevel%==0 (
  set "PM=npm"
  goto install
)

echo Не найдены ни Bun, ни Node.js.
echo Установите один из них и запустите install.cmd снова:
echo   Bun  — https://bun.sh
echo   Node — https://nodejs.org  (версия 20 или новее)
echo.
pause
exit /b 1

:install
echo [1/2] Ставлю зависимости через %PM% …
call %PM% install
if errorlevel 1 goto fail

echo.
echo [2/2] Собираю приложение …
call %PM% run build
if errorlevel 1 goto fail

echo.
echo Установка завершена. Открываю редактор в браузере.
echo Не закрывайте это окно: пока оно открыто, работает локальный сервер.
echo Для следующего запуска используйте start.cmd.
echo.
call %PM% run start:open
goto :eof

:fail
echo.
echo Установка прервана из-за ошибки. Проверьте сообщения выше.
pause
exit /b 1
