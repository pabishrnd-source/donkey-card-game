@echo off
title Donkey Card Game Server
cd /d "%~dp0"
set DONKEY_LAN_DEV=1
echo Starting Donkey Card Game...
echo Keep this window open while playing.
echo.
call pnpm start
echo.
echo The server stopped. Press any key to close this window.
pause >nul
