@echo off
chcp 65001 >nul
title NV Agente PC - Iniciar sesion en Facebook e Instagram
cd /d "%~dp0"
node agente.mjs login
pause
