@echo off
title MantaRay AI — Startup
cd /d "%~dp0"

echo [1/5] Killing old processes...
powershell -NoProfile -Command "Get-Process python*,node* -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue; Get-NetTCPConnection -LocalPort 8000,4040 -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue }"
timeout /t 2 /nobreak >nul

echo [2/5] Starting ngrok on port 8000...
start "ngrok" /min ngrok http 8000
timeout /t 6 /nobreak >nul

echo [3/5] Reading ngrok URL and updating .env...
powershell -NoProfile -Command ^
  "$tunnel = (Invoke-RestMethod http://localhost:4040/api/tunnels).tunnels | Where-Object { $_.proto -eq 'https' } | Select-Object -First 1;" ^
  "if (-not $tunnel) { Write-Host '[ERROR] ngrok not ready — try running start.bat again'; pause; exit 1 }" ^
  "$url = $tunnel.public_url;" ^
  "$envPath = '%~dp0backend\.env';" ^
  "$content = Get-Content $envPath -Raw;" ^
  "$content = $content -replace 'PUBLIC_BASE_URL=[^\r\n]*', \"PUBLIC_BASE_URL=$url\";" ^
  "Set-Content $envPath $content -Encoding utf8 -NoNewline;" ^
  "Write-Host \"[URL] Tunnel active: $url\""
if %errorlevel% neq 0 ( pause & exit /b 1 )

echo [4/5] Starting backend...
start "MantaRay Backend" /d "%~dp0backend" cmd /k "uvicorn main:app --host 0.0.0.0 --port 8000 --reload"
timeout /t 4 /nobreak >nul

echo [5/5] Starting frontend...
start "MantaRay Frontend" /d "%~dp0frontend" cmd /k "npm run dev"

echo.
echo  All services started!
echo  Frontend : http://localhost:3000
echo  Backend  : http://localhost:8000
echo  ngrok UI : http://localhost:4040
echo.
pause
