@echo off
title MAYA AI - Enable Live Calls (DEMO_MODE=false)
echo ============================================================
echo   MAYA AI Calling Agent - Switching to LIVE CALLS mode...
echo ============================================================

echo.
echo [1/2] Instant runtime toggle on Render (no rebuild wait)...
curl.exe -sS -X POST "https://mantaray-backend.onrender.com/api/admin/demo-mode" ^
  -H "Content-Type: application/json" ^
  -d "{\"demo_mode\": false, \"key\": \"admin123\"}"
echo.

echo.
echo [2/2] Updating render.yaml (DEMO_MODE: "false") and pushing to GitHub...
powershell -NoProfile -Command "(Get-Content render.yaml) -replace 'value: \"true\"', 'value: \"false\"' | Set-Content render.yaml"
git add render.yaml
git commit -m "chore: set DEMO_MODE=false for live presentation" 2>nul
git push origin Maya-renewed-intelligence:main 2>nul
git push origin Maya-renewed-intelligence 2>nul

echo.
echo ============================================================
echo   READY! Live Twilio + ElevenLabs calling is now ACTIVE.
echo   Dashboard: https://maya-calling-agent.vercel.app
echo ============================================================
pause
