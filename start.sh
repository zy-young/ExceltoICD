#!/bin/bash

# 病种识别系统 - 快速启动脚本

echo "=========================================="
echo "  病种识别系统 - 本地启动"
echo "=========================================="

# 检查Node.js
if ! command -v node &> /dev/null; then
    echo "❌ 未检测到Node.js，请先安装Node.js >= 18.17.0"
    echo "   下载地址: https://nodejs.org/"
    exit 1
fi

echo "✅ Node.js版本: $(node -v)"

# 检查pnpm
if ! command -v pnpm &> /dev/null; then
    echo "❌ 未检测到pnpm，正在安装..."
    npm install -g pnpm
fi

echo "✅ pnpm版本: $(pnpm -v)"

# 检查依赖
if [ ! -d "node_modules" ]; then
    echo "📦 正在安装依赖..."
    pnpm install
fi

# 创建临时目录
mkdir -p /tmp/excel-exports

# 设置环境变量
export NODE_OPTIONS=--max-old-space-size=4096

echo ""
echo "🚀 正在启动开发服务器..."
echo "   访问地址: http://localhost:5000"
echo "   按 Ctrl+C 停止服务"
echo ""

# 启动服务
pnpm run dev
