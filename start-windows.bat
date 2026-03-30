@echo off
chcp 65001 >nul
echo ==========================================
echo   ExceltoICD - Windows 快速启动
echo ==========================================

:: 检查 Node.js
where node >nul 2>&1
if %errorlevel% neq 0 (
    echo [错误] 未检测到 Node.js，请先安装 Node.js ^>= 18.17.0
    echo 下载地址: https://nodejs.org/
    pause
    exit /b 1
)

echo [√] Node.js 版本:
node -v

:: 检查 pnpm
where pnpm >nul 2>&1
if %errorlevel% neq 0 (
    echo [!] 未检测到 pnpm，正在安装...
    npm install -g pnpm
)

echo [√] pnpm 版本:
pnpm -v

:: 检查依赖
if not exist "node_modules" (
    echo [*] 正在安装依赖...
    pnpm install
)

:: 设置环境变量
set NODE_OPTIONS=--max-old-space-size=4096

echo.
echo [*] 正在启动开发服务器...
echo     访问地址: http://localhost:3010
echo     按 Ctrl+C 停止服务
echo.

:: 启动服务
pnpm run dev
