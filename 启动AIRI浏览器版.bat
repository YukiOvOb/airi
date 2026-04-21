@echo off
chcp 65001 >nul
title AIRI

cd /d "%~dp0"
set VITE_SKIP_MKCERT=true

echo Starting AIRI...
start "" "http://localhost:5173"
pnpm dev
pause
