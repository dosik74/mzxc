@echo off
chcp 65001 >nul

REM Ensure script runs from project root
setlocal
cd /d "%~dp0"

REM Normalize ROOT without trailing backslash
set "ROOT=%~dp0"
if "%ROOT:~-1%"=="\" set "ROOT=%ROOT:~0,-1%"

echo Starting Spot backend in a new window...
start "Spot Backend" cmd /k "cd /d \"%ROOT%\" && echo Installing backend deps... && npm install && echo Starting server... && node server.js"

timeout /t 1 >nul

echo Starting Spot client in a new window...
start "Spot Client" cmd /k "cd /d \"%ROOT%\client\" && echo Installing client deps... && npm install && echo Starting dev server... && npm run dev"

echo Launched backend and client. Check the new windows for logs.
endlocal
exit /b 0
