@echo off
setlocal EnableExtensions
chcp 65001 >nul

set "ROOT=%~dp0"
set "VERIFY_SCRIPT=%ROOT%native-host\verify_native_host.ps1"

if not exist "%VERIFY_SCRIPT%" (
    echo [ERROR] Missing native-host\verify_native_host.ps1
    exit /b 1
)

powershell -NoProfile -ExecutionPolicy Bypass -File "%VERIFY_SCRIPT%"
exit /b %ERRORLEVEL%
