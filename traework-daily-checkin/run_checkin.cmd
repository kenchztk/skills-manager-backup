@echo off
setlocal

:: ============================================
:: TraeWork 每日自动签到 - 执行入口
:: ============================================

:: 配置 TRAE SOLO CN 可执行文件路径
:: 如需修改，请更新下方 TRAE_EXE 变量
set "TRAE_EXE=D:\1·AI agent\TRAE CN\TRAE SOLO CN\TRAE SOLO CN.exe"

:: 检查可执行文件是否存在
if not exist "%TRAE_EXE%" (
  echo ERROR: TRAE SOLO CN.exe not found at: %TRAE_EXE%
  echo Please edit this file and update TRAE_EXE path.
  exit /b 1
)

set ELECTRON_RUN_AS_NODE=1
set VSCODE_DEV=
"%TRAE_EXE%" "%~dp0checkin.js"

endlocal
