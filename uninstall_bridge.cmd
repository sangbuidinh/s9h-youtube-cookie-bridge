@echo off
setlocal EnableExtensions
chcp 65001 >nul

set "ROOT=%~dp0"
cd /d "%ROOT%"

echo S9H YouTube Cookie Bridge - Go cai dat Native Host
echo.

powershell -NoProfile -ExecutionPolicy Bypass -File "%ROOT%native-host\uninstall_native_host.ps1" -RemoveGenerated
if errorlevel 1 (
    echo.
    echo [LOI] Go cai dat that bai.
) else (
    echo.
    echo [OK] Da chay go cai dat native host.
)

echo.
pause
endlocal
