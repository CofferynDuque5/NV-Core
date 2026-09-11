@echo off
chcp 65001 >nul
title NV Agente PC - Instalar
cd /d "%~dp0"
echo ================================================
echo   NV Agente PC - Instalacion (solo la primera vez)
echo ================================================
echo.
where node >nul 2>nul
if errorlevel 1 (
  echo Falta Node.js. Descargalo e instalalo desde https://nodejs.org (version LTS^) y vuelve a abrir este archivo.
  pause
  exit /b 1
)
echo Instalando dependencias...
call npm install --no-audit --no-fund
if errorlevel 1 ( echo Fallo npm install. & pause & exit /b 1 )
echo Instalando el navegador (Chromium)...
call npx playwright install chromium
if errorlevel 1 ( echo Fallo la instalacion de Chromium. & pause & exit /b 1 )
echo.
echo Instalacion completa. Ahora abre "INICIAR SESION.bat".
pause
