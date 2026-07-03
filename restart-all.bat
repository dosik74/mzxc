@echo off
chcp 65001>nul
echo ==============================================
echo Restarting Spot backend and client
echo ==============================================
echo Stopping any process listening on port 3008...
for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":3008" ^| findstr LISTENING') do taskkill /F /PID %%a >nul 2>&1

if "%1"=="build" (
  echo Building client (production)...
  pushd "%~dp0client"
  npm run build
  popd
)

echo Starting backend (new window)...
start "Spot Backend" cmd /k "cd /d %~dp0 && node simple-server.js"
echo Starting client dev server (new window)...
start "Spot Client" cmd /k "cd /d %~dp0client && npm run dev"

echo All done. Use the opened windows to view logs.
exit /b 0
