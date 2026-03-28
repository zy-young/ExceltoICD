#!/bin/bash
set -Eeuo pipefail

COZE_WORKSPACE_PATH="${COZE_WORKSPACE_PATH:-$(pwd)}"
PORT=3010
DEPLOY_RUN_PORT="${DEPLOY_RUN_PORT:-$PORT}"

# 检查依赖
check_dependencies() {
    echo "检查依赖..."

    # 检查 Node.js
    if ! command -v node &> /dev/null; then
        echo "错误: 未找到 Node.js，请先安装 Node.js (>= 18.0.0)"
        exit 1
    fi

    NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
    if [ "$NODE_VERSION" -lt 18 ]; then
        echo "错误: Node.js 版本过低 (当前: $(node -v))，需要 >= 18.0.0"
        exit 1
    fi

    # 检查 pnpm
    if ! command -v pnpm &> /dev/null; then
        echo "错误: 未找到 pnpm，请先安装 pnpm (>= 9.0.0)"
        echo "安装命令: npm install -g pnpm@9"
        exit 1
    fi

    PNPM_VERSION=$(pnpm -v | cut -d'.' -f1)
    if [ "$PNPM_VERSION" -lt 9 ]; then
        echo "错误: pnpm 版本过低 (当前: $(pnpm -v))，需要 >= 9.0.0"
        echo "升级命令: npm install -g pnpm@9"
        exit 1
    fi

    echo "✓ 依赖检查通过"
}

# 检查构建产物
check_build() {
    if [ ! -d "${COZE_WORKSPACE_PATH}/.next" ]; then
        echo "错误: 未找到构建产物，请先运行 'pnpm build'"
        exit 1
    fi
    echo "✓ 构建产物存在"
}

# 清理端口
clear_port() {
    echo "检查端口 ${DEPLOY_RUN_PORT}..."

    # Windows 环境
    if [[ "$OSTYPE" == "msys" || "$OSTYPE" == "win32" ]]; then
        PIDS=$(netstat -ano | grep ":${DEPLOY_RUN_PORT}" | awk '{print $5}' | sort -u)
        if [ ! -z "$PIDS" ]; then
            echo "端口 ${DEPLOY_RUN_PORT} 被占用，尝试清理..."
            for PID in $PIDS; do
                if [ "$PID" != "0" ]; then
                    taskkill //F //PID $PID 2>/dev/null || true
                fi
            done
            sleep 2
        fi
    # Linux/Mac 环境
    else
        PIDS=$(lsof -ti:${DEPLOY_RUN_PORT} 2>/dev/null || true)
        if [ ! -z "$PIDS" ]; then
            echo "端口 ${DEPLOY_RUN_PORT} 被占用，尝试清理..."
            kill -9 $PIDS 2>/dev/null || true
            sleep 2
        fi
    fi

    echo "✓ 端口 ${DEPLOY_RUN_PORT} 可用"
}

start_service() {
    cd "${COZE_WORKSPACE_PATH}"
    echo "在端口 ${DEPLOY_RUN_PORT} 启动生产服务..."
    echo "访问地址: http://localhost:${DEPLOY_RUN_PORT}"
    npx next start --port ${DEPLOY_RUN_PORT}
}

# 主流程
echo "========================================="
echo "ExceltoICD 生产环境启动脚本"
echo "========================================="
check_dependencies
check_build
clear_port
echo "========================================="
start_service
