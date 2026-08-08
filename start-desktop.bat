@echo off
REM Neuravex Desktop Launcher (Windows)
REM Double-click this file to start the website builder.
cd /d "%~dp0"
node electron\server.js %*
pause
