@echo off
setlocal EnableExtensions
chcp 65001 >nul

set "ROOT=%~dp0.."
set "SCRIPT=%~dp0build_native_host.ps1"

if not exist "%SCRIPT%" (
    echo [ERROR] Missing native-host\build_native_host.ps1
    exit /b 1
)

powershell -NoProfile -ExecutionPolicy Bypass -File "%SCRIPT%"
exit /b %ERRORLEVEL%
