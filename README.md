# ExceltoICD - Excel病种识别系统

基于 Next.js 16.1.1 的医疗文本病种识别系统，支持批量处理Excel文件，自动识别并分类病种信息。

## 功能特性

- ✅ **批量处理**：支持一次处理大量数据（100条数据约10秒）
- ✅ **病种分类**：自动按器官分类（肝、胃、胰腺、胆囊、胆道、肾、膀胱、结直肠、卵巢）
- ✅ **保留原始数据**：导出CSV时完整保留原始Excel的所有列
- ✅ **实时进度**：显示处理进度和运行时长
- ✅ **断点续传**：支持中断后继续处理
- ✅ **高性能**：批处理优化，50并发，20条/批

## 系统要求

### 必需依赖

| 依赖 | 最低版本 | 推荐版本 | 检查命令 |
|------|---------|---------|----------|
| **Node.js** | 18.0.0 | 20.x LTS | `node -v` |
| **pnpm** | 9.0.0 | 9.x | `pnpm -v` |
| **bash** | 4.0+ | 5.x | `bash --version` |

### 操作系统支持

- ✅ Linux (Ubuntu 20.04+, CentOS 8+, Debian 11+)
- ✅ macOS (10.15+)
- ✅ Windows 10/11 (需要 Git Bash 或 WSL)

### 端口要求

- **默认端口**：3010 (可通过环境变量 `DEPLOY_RUN_PORT` 修改)

## 快速开始

### 1. 安装依赖

#### 安装 Node.js

**Linux (Ubuntu/Debian):**
```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs
```

**Linux (CentOS/RHEL):**
```bash
curl -fsSL https://rpm.nodesource.com/setup_20.x | sudo bash -
sudo yum install -y nodejs
```

**macOS:**
```bash
brew install node@20
```

**Windows:**
- 下载安装包：https://nodejs.org/

#### 安装 pnpm

```bash
npm install -g pnpm@9
```

#### 验证安装

```bash
node -v    # 应显示 v18.x.x 或更高
pnpm -v    # 应显示 9.x.x 或更高
bash --version  # 确认 bash 可用
```

### 2. 克隆项目

```bash
git clone <repository-url>
cd ExceltoICD
```

### 3. 安装项目依赖

```bash
pnpm install
```

> **注意**：项目强制使用 pnpm，如果使用 npm 或 yarn 会报错。

### 4. 配置环境变量（可选）

创建 `.env.local` 文件：

```bash
# 自定义端口（可选，默认3010）
DEPLOY_RUN_PORT=3010

# 工作目录（可选，默认当前目录）
COZE_WORKSPACE_PATH=/path/to/project
```

### 5. 启动服务

#### 开发环境

```bash
pnpm dev
```

服务将在 http://localhost:3010 启动

#### 生产环境

```bash
# 1. 构建项目
pnpm build

# 2. 启动生产服务
pnpm start
```

服务将在 http://localhost:3010 启动

## 启动脚本说明

### 开发环境 (`pnpm dev`)

- **脚本位置**：`scripts/dev.sh`
- **默认端口**：3010
- **功能**：
  - 自动清理占用端口的进程
  - 启动 Next.js 开发服务器
  - 支持热重载

### 生产环境 (`pnpm start`)

- **脚本位置**：`scripts/start.sh`
- **默认端口**：3010
- **功能**：
  - 检查 Node.js 和 pnpm 版本
  - 检查构建产物是否存在
  - 自动清理占用端口的进程
  - 启动 Next.js 生产服务器

### 构建 (`pnpm build`)

- **脚本位置**：`scripts/build.sh`
- **功能**：
  - 编译 TypeScript
  - 构建 Next.js 应用
  - 生成优化的生产代码

## 常见问题

### 1. 端口被占用

**错误信息：**
```
Error: listen EADDRINUSE: address already in use :::3010
```

**解决方法：**

**Linux/Mac:**
```bash
# 查找占用端口的进程
lsof -ti:3010

# 终止进程
kill -9 $(lsof -ti:3010)
```

**Windows (Git Bash):**
```bash
# 查找占用端口的进程
netstat -ano | grep :3010

# 终止进程（替换 PID 为实际进程ID）
taskkill //F //PID <PID>
```

或者，使用不同的端口：
```bash
DEPLOY_RUN_PORT=3011 pnpm dev
```

### 2. pnpm 版本过低

**错误信息：**
```
ERROR: This project requires pnpm version >= 9.0.0
```

**解决方法：**
```bash
npm install -g pnpm@9
```

### 3. 缺少构建产物

**错误信息：**
```
错误: 未找到构建产物，请先运行 'pnpm build'
```

**解决方法：**
```bash
pnpm build
```

### 4. bash 命令不可用 (Windows)

**错误信息：**
```
'bash' is not recognized as an internal or external command
```

**解决方法：**

**选项1：安装 Git Bash**
- 下载并安装 Git for Windows：https://git-scm.com/download/win
- 使用 Git Bash 终端运行命令

**选项2：使用 WSL (Windows Subsystem for Linux)**
```powershell
# 在 PowerShell (管理员) 中运行
wsl --install
```

**选项3：直接使用 npx 命令**
```bash
# 开发环境
npx next dev --port 3010

# 生产环境（需先构建）
npx next build
npx next start --port 3010
```

### 5. 依赖安装失败

**错误信息：**
```
ERR_PNPM_FETCH_* 或网络错误
```

**解决方法：**

**选项1：使用国内镜像**
```bash
pnpm config set registry https://registry.npmmirror.com
pnpm install
```

**选项2：清理缓存重试**
```bash
pnpm store prune
pnpm install
```

### 6. Linux 服务器上 ss 命令不可用

**错误信息：**
```
ss: command not found
```

**解决方法：**

修改 `scripts/dev.sh`，将端口检查逻辑改为使用 `netstat`：

```bash
# 查找占用端口的进程
netstat -tlnp 2>/dev/null | grep :3010
```

或者安装 `ss` 命令：
```bash
# Ubuntu/Debian
sudo apt-get install iproute2

# CentOS/RHEL
sudo yum install iproute
```

## 使用说明

### 1. 上传Excel文件

- 支持 `.xlsx` 和 `.xls` 格式
- 文件需包含表头行
- 选择要分析的列（通常是诊断报告列）

### 2. 开始分析

- 点击"开始分析"按钮
- 实时显示处理进度
- 可随时中断，支持断点续传

### 3. 导出结果

- 点击"导出 CSV"按钮
- 导出的CSV包含：
  - **原始Excel的所有列**（完整保留）
  - **识别的病种列**（按器官分类）
  - **其他病种列**
  - **状态列**（成功/失败）

## 性能指标

- **处理速度**：约10条/秒（100条数据约10秒）
- **并发数**：50个并发请求
- **批处理大小**：20条/批
- **支持数据量**：10万条数据约5小时

## 部署到服务器

### 方法1：使用 PM2 (推荐)

```bash
# 1. 安装 PM2
npm install -g pm2

# 2. 构建项目
pnpm build

# 3. 使用 PM2 启动
pm2 start npm --name "exceltoidc" -- start

# 4. 查看日志
pm2 logs exceltoidc

# 5. 设置开机自启
pm2 startup
pm2 save
```

### 方法2：使用 systemd (Linux)

创建服务文件 `/etc/systemd/system/exceltoidc.service`：

```ini
[Unit]
Description=ExceltoICD Service
After=network.target

[Service]
Type=simple
User=your-user
WorkingDirectory=/path/to/ExceltoICD
Environment="DEPLOY_RUN_PORT=3010"
ExecStart=/usr/bin/pnpm start
Restart=on-failure

[Install]
WantedBy=multi-user.target
```

启动服务：
```bash
sudo systemctl daemon-reload
sudo systemctl enable exceltoidc
sudo systemctl start exceltoidc
sudo systemctl status exceltoidc
```

### 方法3：使用 Docker

创建 `Dockerfile`：

```dockerfile
FROM node:20-alpine

# 安装 pnpm 和 bash
RUN apk add --no-cache bash && npm install -g pnpm@9

WORKDIR /app

# 复制依赖文件
COPY package.json pnpm-lock.yaml ./

# 安装依赖
RUN pnpm install --frozen-lockfile

# 复制项目文件
COPY . .

# 构建
RUN pnpm build

# 暴露端口
EXPOSE 3010

# 启动
CMD ["pnpm", "start"]
```

构建并运行：
```bash
docker build -t exceltoidc .
docker run -d -p 3010:3010 --name exceltoidc exceltoidc
```

## 环境变量

| 变量名 | 说明 | 默认值 | 示例 |
|--------|------|--------|------|
| `DEPLOY_RUN_PORT` | 服务端口 | 3010 | 3010 |
| `COZE_WORKSPACE_PATH` | 工作目录 | 当前目录 | /app |
| `NODE_ENV` | 运行环境 | development | production |

## 技术栈

- **框架**：Next.js 16.1.1
- **UI库**：React 19.2.3
- **样式**：Tailwind CSS 4
- **组件库**：shadcn/ui
- **Excel处理**：xlsx 0.18.5
- **包管理器**：pnpm 9.0.0

## 项目结构

```
ExceltoICD/
├── src/
│   ├── app/
│   │   ├── api/
│   │   │   ├── analyze-batch/    # 批处理API
│   │   │   └── retry/            # 重试API
│   │   ├── page.tsx              # 主页面
│   │   ├── layout.tsx            # 根布局
│   │   └── globals.css           # 全局样式
│   ├── components/
│   │   └── ui/                   # shadcn/ui 组件
│   └── lib/                      # 工具库
├── scripts/
│   ├── dev.sh                    # 开发启动脚本
│   ├── start.sh                  # 生产启动脚本
│   └── build.sh                  # 构建脚本
├── package.json                  # 项目配置
└── README.md                     # 本文件
```

## 开发指南

### 本地开发

```bash
# 1. 安装依赖
pnpm install

# 2. 启动开发服务器
pnpm dev

# 3. 访问 http://localhost:3010
```

### 代码检查

```bash
# TypeScript 类型检查
pnpm ts-check

# ESLint 检查
pnpm lint
```

### 构建生产版本

```bash
# 构建
pnpm build

# 启动生产服务器
pnpm start
```

## 重要提示

1. **必须使用 pnpm** 作为包管理器
2. **优先使用 shadcn/ui 组件** 而不是从零开发基础组件
3. **遵循 Next.js App Router 规范**，正确区分服务端/客户端组件
4. **使用 TypeScript** 进行类型安全开发
5. **使用 `@/` 路径别名** 导入模块（已配置）

## 更新日志

### v1.0.0 (2026-03-29)
- ✅ 批处理优化，性能提升10倍
- ✅ 支持保留原始Excel所有列
- ✅ 添加实时进度显示
- ✅ 支持断点续传
- ✅ 优化错误处理和重试机制
- ✅ 默认端口改为3010
