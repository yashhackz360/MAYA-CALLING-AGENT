@echo off
echo ╔════════════════════════════════════════╗
echo ║   MantaRay AI - Backend Setup          ║
echo ╚════════════════════════════════════════╝
echo.

cd /d "%~dp0backend"

echo Starting FastAPI backend on http://localhost:8000 ...
python main.py

pause
