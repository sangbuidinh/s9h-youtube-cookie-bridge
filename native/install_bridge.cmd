@echo off
setlocal EnableExtensions EnableDelayedExpansion
chcp 65001 >nul

set "NATIVE_DIR=%~dp0"
set "HOST_SCRIPT=%NATIVE_DIR%native_host.py"
set "INSTALL_SCRIPT=%NATIVE_DIR%install_native_host.ps1"

echo s9h YouTube Cookie Bridge - Native Host Install
echo.
echo This registers the local Native Messaging host for Chrome and Edge.
echo.

if not exist "%HOST_SCRIPT%" (
    echo [ERROR] Missing native host script: %HOST_SCRIPT%
    goto :fail
)

if not exist "%INSTALL_SCRIPT%" (
    echo [ERROR] Missing installer script: %INSTALL_SCRIPT%
    goto :fail
)

py -3 --version >nul 2>nul
if errorlevel 1 (
    echo [ERROR] Python launcher was not found.
    echo Install Python 3 and make sure the py launcher is available, then run this again.
    goto :fail
)

if not "%~1"=="" (
    set "RAW_ID=%~1"
    goto :sanitize_id
)

:prompt_id
set "RAW_ID="
set /p "RAW_ID=Paste the Chrome or Edge extension ID, or Q to quit: "
if /I "%RAW_ID%"=="Q" goto :cancel

:sanitize_id
set "EXT_ID="
for /f "usebackq delims=" %%I in (`powershell -NoProfile -Command "$s=$env:RAW_ID; if($null -eq $s){$s=''}; $s=($s -replace '[\x22\x27<>\s]','').ToLowerInvariant(); Write-Output $s"`) do set "EXT_ID=%%I"

powershell -NoProfile -Command "if ($env:EXT_ID -match '^[a-p]{32}$') { exit 0 } exit 1" >nul 2>nul
if errorlevel 1 (
    echo.
    echo [ERROR] Extension ID is invalid.
    echo It must be exactly 32 characters and use only letters a through p.
    echo.
    if not "%~1"=="" goto :fail
    goto :prompt_id
)

echo.
echo Installing native host...
powershell -NoProfile -ExecutionPolicy Bypass -File "%INSTALL_SCRIPT%" -ExtensionId "%EXT_ID%" -HostScriptPath "%HOST_SCRIPT%"
if errorlevel 1 goto :fail

echo.
echo [OK] Native host installed for Chrome and Edge.
echo Reload the extension, then use Test Native Host.
goto :done

:cancel
echo Install canceled.
goto :done

:fail
echo.
echo Install did not complete.

:done
echo.
pause
endlocal
