@echo off
REM Neuravex Desktop Launcher (Windows)
REM Double-click this file to start the website builder.
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo [neuravex] Node.js is not installed, or this window cannot find it.
  echo [neuravex] Install Node.js 22.12 or newer from https://nodejs.org, then open this again.
  pause
  exit /b 1
)
node electron\server.js %*
pause
