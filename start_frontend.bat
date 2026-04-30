@echo off
echo ╔════════════════════════════════════════╗
echo ║   MantaRay AI - Frontend Setup         ║
echo ╚════════════════════════════════════════╝
echo.

:: Add Node.js to PATH for this session
SET "PATH=C:\Program Files\nodejs;%APPDATA%\npm;%PATH%"

cd /d "%~dp0frontend"

echo Installing Node.js dependencies...
call npm install

echo.
echo Starting React frontend on http://localhost:3000 ...
call npm run dev

pause
