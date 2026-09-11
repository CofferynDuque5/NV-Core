@echo off
chcp 65001 >nul
title NV Agente PC - Publicando (deja esta ventana abierta)
cd /d "%~dp0"
:otra
node agente.mjs run
echo.
echo El agente se detuvo. Reintento en 15 segundos... (cierra la ventana para parar)
timeout /t 15 >nul
goto otra
