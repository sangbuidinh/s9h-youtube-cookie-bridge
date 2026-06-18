@echo off
setlocal EnableExtensions
chcp 65001 >nul

echo This is not the release installer.
echo Please run ..\install_bridge.cmd from the repository root.
echo Delegating to release installer...
echo.

call "%~dp0..\install_bridge.cmd" %*
exit /b %ERRORLEVEL%
