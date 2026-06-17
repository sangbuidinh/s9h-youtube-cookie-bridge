@echo off
setlocal EnableExtensions
chcp 65001 >nul

set "NATIVE_DIR=%~dp0"
set "UNINSTALL_SCRIPT=%NATIVE_DIR%uninstall_native_host.ps1"

echo s9h YouTube Cookie Bridge - Native Host Uninstall
echo.

if not exist "%UNINSTALL_SCRIPT%" (
    echo [ERROR] Missing uninstaller script: %UNINSTALL_SCRIPT%
    goto :fail
)

powershell -NoProfile -ExecutionPolicy Bypass -File "%UNINSTALL_SCRIPT%" -RemoveGenerated
if errorlevel 1 goto :fail

echo.
echo [OK] Native host removed for Chrome and Edge.
goto :done

:fail
echo.
echo Uninstall did not complete.

:done
echo.
pause
endlocal
