@echo off
set "PATH=%~dp0.tools\node-v22.23.1-win-x64;%PATH%"
cd /d "%~dp0"
call npm.cmd run dev
