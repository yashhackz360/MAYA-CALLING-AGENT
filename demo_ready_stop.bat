@echo off
title MAYA AI - Enable Safe Mode (DEMO_MODE=true)
echo ============================================================
echo   MAYA AI Calling Agent - Switching to SAFE DEMO MODE...
echo   (Disables real Twilio calls to protect your credits)
echo ============================================================

echo.
echo [1/2] Instant runtime toggle on Render (no rebuild wait)...
curl.exe -sS -X POST "https://mantaray-backend.onrender.com/api/admin/demo-mode" ^
  -H "Content-Type: application/json" ^
  -d "{\"demo_mode\": true, \"key\": \"admin123\"}"
echo.

echo.
echo [2/2] Updating render.yaml (DEMO_MODE: "true") and pushing to GitHub...
powershell -NoProfile -Command "(Get-Content render.yaml) -replace 'value: \"false\"', 'value: \"true\"' | Set-Content render.yaml"
git add render.yaml
git commit -m "chore: set DEMO_MODE=true for public resume link" 2>nul
git push origin Maya-renewed-intelligence:main 2>nul
git push origin Maya-renewed-intelligence 2>nul

echo.
echo ============================================================
echo   SAFE MODE ON! Outbound calls are now simulated.
echo ============================================================
pause
