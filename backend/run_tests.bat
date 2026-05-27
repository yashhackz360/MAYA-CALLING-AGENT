@echo off
title MantaRay AI — Test Suite
cd /d "%~dp0"

echo.
echo ========================================================
echo   MantaRay AI — Pre-Demo Test Suite
echo   Running all 3 test scripts...
echo ========================================================
echo.

REM Install pytest if needed
python -m pytest --version >nul 2>&1
if %errorlevel% neq 0 (
    echo [SETUP] Installing pytest...
    pip install pytest httpx --quiet
)

REM Run all three test scripts with detailed output + report
python -m pytest ^
    test_data_layer.py ^
    test_api_endpoints.py ^
    test_system_pipeline.py ^
    -v ^
    --tb=short ^
    --no-header ^
    -p no:warnings ^
    --color=yes ^
    -q ^
    2>&1 | tee test_report.txt

echo.
echo ========================================================
echo   Report saved to: backend\test_report.txt
echo ========================================================
echo.
pause
