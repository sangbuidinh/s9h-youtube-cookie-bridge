@echo off
setlocal EnableExtensions EnableDelayedExpansion
chcp 65001 >nul

set "ROOT=%~dp0"
set "HOST_EXE=%ROOT%native-host\dist\cookie_bridge_host.exe"
set "INSTALL_SCRIPT=%ROOT%native-host\install_native_host.ps1"

cd /d "%ROOT%"

echo Installing S9H YouTube Cookie Bridge native host...
echo Native host EXE: %HOST_EXE%
echo.

if not exist "%HOST_EXE%" (
    echo [ERROR] Missing native-host\dist\cookie_bridge_host.exe
    echo [ERROR] Build the native host first or use the release ZIP.
    exit /b 1
)

if not exist "%INSTALL_SCRIPT%" (
    echo [ERROR] Missing native-host\install_native_host.ps1
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
    echo Install canceled.
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

set "BRAVE_ARG="
set "REGISTER_BRAVE="
set /p "REGISTER_BRAVE=Register Brave too? (y/N): "
if /I "%REGISTER_BRAVE%"=="Y" set "BRAVE_ARG=-RegisterBrave"

echo.
powershell -NoProfile -ExecutionPolicy Bypass -File "%INSTALL_SCRIPT%" -ExtensionId "%EXT_ID%" -HostExePath "%HOST_EXE%" %BRAVE_ARG%
if errorlevel 1 (
    echo [ERROR] Native host install failed.
    exit /b 1
)

echo.
echo Done.
echo Please reload the browser extension.
exit /b 0
