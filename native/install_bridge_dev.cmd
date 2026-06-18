@echo off
setlocal EnableExtensions EnableDelayedExpansion
chcp 65001 >nul

set "NATIVE_DIR=%~dp0"
set "HOST_SCRIPT=%NATIVE_DIR%native_host.py"
set "INSTALL_SCRIPT=%NATIVE_DIR%install_native_host.ps1"

echo DEV ONLY - registers Python script native host.
echo Normal users should run ..\install_bridge.cmd instead.
echo.

if not exist "%HOST_SCRIPT%" (
    echo [ERROR] Missing native host shim: %HOST_SCRIPT%
    exit /b 1
)

if not exist "%INSTALL_SCRIPT%" (
    echo [ERROR] Missing developer installer script: %INSTALL_SCRIPT%
    exit /b 1
)

py -3 --version >nul 2>nul
if errorlevel 1 (
    echo [ERROR] Python launcher was not found.
    echo Install Python 3 and make sure the py launcher is available.
    exit /b 1
)

if not "%~1"=="" (
    set "RAW_ID=%~1"
    goto :sanitize_id
)

:prompt_id
set "RAW_ID="
set /p "RAW_ID=Paste Chrome/Edge extension ID, or Q to quit: "
if /I "%RAW_ID%"=="Q" (
    echo Developer install canceled.
    exit /b 1
)

:sanitize_id
set "EXT_ID="
for /f "usebackq delims=" %%I in (`powershell -NoProfile -Command "$s=$env:RAW_ID; if($null -eq $s){$s=''}; $s=($s -replace '[\x22\x27<>\s]','').ToLowerInvariant(); Write-Output $s"`) do set "EXT_ID=%%I"

powershell -NoProfile -Command "if ($env:EXT_ID -match '^[a-p]{32}$') { exit 0 } exit 1" >nul 2>nul
if errorlevel 1 (
    echo [ERROR] Extension ID is invalid.
    echo It must be exactly 32 lowercase letters from a to p.
    if not "%~1"=="" exit /b 1
    goto :prompt_id
)

powershell -NoProfile -ExecutionPolicy Bypass -File "%INSTALL_SCRIPT%" -ExtensionId "%EXT_ID%" -HostScriptPath "%HOST_SCRIPT%"
if errorlevel 1 (
    echo [ERROR] Developer script-mode native host install failed.
    exit /b 1
)

echo.
echo [OK] Developer script-mode native host installed.
echo Release users should reinstall with ..\install_bridge.cmd before packaging or normal use.
exit /b 0
