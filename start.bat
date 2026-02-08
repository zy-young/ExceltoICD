@echo off
chcp 65001 >nul

echo ==========================================
echo   病种识别系统 - 本地启动
echo ==========================================

REM 检查Node.js
where node >nul 2>nul
if %errorlevel% neq 0 (
    echo ❌ 未检测到Node.js，请先安装Node.js ^>= 18.17.0
    echo    下载地址: https://nodejs.org/
    pause
    exit /b 1
)

echo ✅ Node.js版本:
node -v

REM 检查pnpm
where pnpm >nul 2>nul
if %errorlevel% neq 0 (
    echo ❌ 未检测到pnpm，正在安装...
    call npm install -g pnpm
)

echo ✅ pnpm版本:
call pnpm -v

REM 检查依赖
if not exist "node_modules" (
    echo 📦 正在安装依赖...
    call pnpm install
)

REM 创建临时目录
if not exist "C:\tmp\excel-exports" mkdir C:\tmp\excel-exports

REM 设置环境变量
set NODE_OPTIONS=--max-old-space-size=4096

echo.
echo 🚀 正在启动开发服务器...
echo    访问地址: http://localhost:5000
echo    按 Ctrl+C 停止服务
echo.

REM 启动服务
call pnpm run dev
