@echo off
setlocal EnableExtensions
chcp 65001 >nul

echo [INFO] This native\ installer is for development only.
echo [INFO] Release install uses the packaged EXE.
echo [INFO] Redirecting to the release installer: ..\install_bridge.cmd
echo.

call "%~dp0..\install_bridge.cmd" %*
exit /b %ERRORLEVEL%
