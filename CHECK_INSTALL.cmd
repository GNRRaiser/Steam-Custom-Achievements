@echo off
setlocal
title Steam Custom Achievements - Check installation
"%SystemRoot%\System32\WindowsPowerShell\v1.0\powershell.exe" -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0tools\Install-Plugin.ps1" -CheckOnly %*
set "SCA_INSTALL_EXITCODE=%errorlevel%"
echo.
pause
exit /b %SCA_INSTALL_EXITCODE%
