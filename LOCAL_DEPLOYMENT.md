# 本地部署指南

## 问题分析

在沙箱环境中，系统总是在处理约2600条数据后中断，经过多次优化（内存优化、IO优化、并发优化）后问题仍然存在。

**根本原因**：沙箱平台对单个SSE连接可能有隐藏的超时限制或资源限制，导致连接在约2分钟后被强制关闭，无论代码中如何设置`maxDuration`。

**证据**：
- 日志显示请求在112秒后返回200，但实际应该需要更长时间
- 没有OOM、SIGKILL等明显错误
- 总是在相同位置（2600条左右）中断

**解决方案**：部署到本地环境运行，可以完全控制服务器配置和资源限制。

---

## 本地环境要求

### 基础环境
- **Node.js**: >= 18.17.0 (推荐 20.x 或 22.x)
- **pnpm**: >= 8.0.0
- **操作系统**: Windows、macOS 或 Linux

### 可选工具
- **Git**: 用于版本管理（可选）

---

## 部署步骤

### 1. 准备项目文件

从沙箱环境导出项目文件，主要包括：

```
workspace/projects/
├── src/                    # 源代码
├── public/                 # 静态资源
├── package.json            # 依赖配置
├── pnpm-lock.yaml          # 锁定文件
├── tsconfig.json           # TypeScript配置
├── next.config.js          # Next.js配置
├── tailwind.config.ts      # Tailwind配置
├── .coze                   # Coze CLI配置
├── .babelrc                # Babel配置
├── .eslintrc.json          # ESLint配置
├── .gitignore              # Git忽略文件
├── .npmrc                  # npm配置
└── .prettierrc             # Prettier配置
```

### 2. 本地初始化

#### 2.1 创建项目目录
```bash
# 在本地创建项目目录
mkdir disease-analysis-system
cd disease-analysis-system

# 复制所有项目文件到此目录
```

#### 2.2 安装依赖
```bash
# 使用pnpm安装依赖
pnpm install
```

#### 2.3 配置环境变量

创建 `.env.local` 文件：

```env
# 可选：配置Coze API密钥（如果使用自建LLM）
# COZE_API_KEY=your_api_key_here
```

### 3. 运行项目

#### 3.1 开发模式
```bash
# 启动开发服务器
pnpm run dev
```

项目将在 `http://localhost:5000` 启动。

#### 3.2 生产模式
```bash
# 构建生产版本
pnpm run build

# 启动生产服务器
pnpm run start
```

---

## 配置说明

### Next.js 配置 (`next.config.js`)

```javascript
/** @type {import('next').NextConfig} */
const nextConfig = {
  // 生产环境优化
  compress: true,
  poweredByHeader: false,
  
  // 超时配置（秒）
  experimental: {
    serverActions: {
      bodySizeLimit: '10mb',
    },
  },
}

module.exports = nextConfig
```

### TypeScript 配置 (`tsconfig.json`)

确保包含以下配置：

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "ESNext",
    "lib": ["ES2020", "DOM", "DOM.Iterable"],
    "jsx": "preserve",
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "allowJs": true,
    "strict": true,
    "noEmit": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "incremental": true,
    "plugins": [
      {
        "name": "next"
      }
    ],
    "paths": {
      "@/*": ["./src/*"]
    }
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
  "exclude": ["node_modules"]
}
```

---

## 性能调优建议

### 1. Node.js 运行参数

如果处理大量数据时遇到内存限制，可以增加Node.js堆内存：

```bash
# Windows
set NODE_OPTIONS=--max-old-space-size=4096 && pnpm run dev

# Linux/macOS
NODE_OPTIONS=--max-old-space-size=4096 pnpm run dev
```

### 2. 并发配置调整

根据本地机器性能调整并发参数：

在 `src/app/api/analyze/route.ts` 中：

```typescript
const CONCURRENT_BATCH_SIZE = 20; // 可以调整为10-50
const SAVE_INTERVAL = 100; // 每100条保存一次
```

**建议值**：
- CPU核心数 < 4: `CONCURRENT_BATCH_SIZE = 10`
- CPU核心数 4-8: `CONCURRENT_BATCH_SIZE = 20`
- CPU核心数 > 8: `CONCURRENT_BATCH_SIZE = 30-50`

### 3. 服务器超时配置

在 `src/app/api/analyze/route.ts` 中：

```typescript
export const maxDuration = 7200; // 120分钟（秒）
```

本地部署可以设置为更长时间：

```typescript
export const maxDuration = 14400; // 240分钟（4小时）
```

### 4. 临时文件清理

系统会在 `/tmp/excel-exports/` 目录保存CSV文件。

**定期清理脚本**（创建 `scripts/cleanup.sh`）：

```bash
#!/bin/bash
# 清理7天前的临时文件

EXPORT_DIR="/tmp/excel-exports"
TEMP_DIR="/tmp"

# 清理7天前的CSV文件
find "$EXPORT_DIR" -name "*.csv" -mtime +7 -delete

# 清理7天前的临时JSON文件
find "$TEMP_DIR" -name "disease-extraction-*.json" -mtime +7 -delete

echo "清理完成: $(date)"
```

设置定时任务（Linux/macOS）：

```bash
# 编辑crontab
crontab -e

# 添加每天凌晨2点清理
0 2 * * * /path/to/scripts/cleanup.sh >> /var/log/cleanup.log 2>&1
```

---

## 常见问题

### 1. 端口被占用

如果5000端口被占用，可以修改端口：

```bash
# 使用其他端口启动
pnpm run dev -- --port 3000
```

### 2. 依赖安装失败

```bash
# 清理缓存后重新安装
rm -rf node_modules pnpm-lock.yaml
pnpm store prune
pnpm install
```

### 3. 构建失败

```bash
# 清理Next.js缓存后重新构建
rm -rf .next
pnpm run build
```

### 4. TypeScript错误

```bash
# 检查类型错误
npx tsc --noEmit
```

### 5. 权限问题（Linux/macOS）

```bash
# 确保/tmp目录可写
chmod 777 /tmp/excel-exports
```

---

## 监控与日志

### 查看实时日志

开发模式下，日志会直接输出到终端。

### 日志文件位置

系统日志会写入：
- `/tmp/disease-extraction-{fileId}.log` - 临时分析日志
- `/tmp/excel-exports/` - 导出的CSV文件

### 性能监控

使用以下工具监控性能：

```bash
# 查看Node.js进程内存使用
node --inspect-brk ./node_modules/.bin/next dev

# 然后在Chrome浏览器访问 chrome://inspect
```

---

## 部署到服务器

### Docker 部署（推荐）

创建 `Dockerfile`：

```dockerfile
FROM node:22-alpine

WORKDIR /app

# 安装pnpm
RUN npm install -g pnpm

# 复制依赖文件
COPY package.json pnpm-lock.yaml ./

# 安装依赖
RUN pnpm install --frozen-lockfile

# 复制源代码
COPY . .

# 构建项目
RUN pnpm run build

# 暴露端口
EXPOSE 5000

# 启动应用
CMD ["pnpm", "run", "start"]
```

创建 `.dockerignore`：

```
node_modules
.next
.git
.env.local
*.log
```

构建和运行：

```bash
# 构建镜像
docker build -t disease-analysis .

# 运行容器
docker run -d \
  --name disease-analysis \
  -p 5000:5000 \
  -v /tmp:/tmp \
  --restart unless-stopped \
  disease-analysis
```

### PM2 部署（推荐生产环境）

```bash
# 安装PM2
npm install -g pm2

# 启动应用
pm2 start pnpm --name "disease-analysis" -- run start

# 查看状态
pm2 status

# 查看日志
pm2 logs disease-analysis

# 监控
pm2 monit

# 设置开机自启
pm2 startup
pm2 save
```

### Nginx 反向代理

配置 Nginx 作为反向代理：

```nginx
server {
    listen 80;
    server_name your-domain.com;

    location / {
        proxy_pass http://localhost:5000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;

        # 增加超时时间
        proxy_read_timeout 7200s;
        proxy_connect_timeout 7200s;
        proxy_send_timeout 7200s;
    }
}
```

---

## 安全建议

1. **API密钥管理**：
   - 使用环境变量存储敏感信息
   - 不要将 `.env.local` 提交到版本控制

2. **访问控制**：
   - 生产环境添加身份验证
   - 使用HTTPS加密传输

3. **数据安全**：
   - 定期备份重要数据
   - 设置文件访问权限

---

## 联系支持

如果遇到问题：

1. 查看日志文件
2. 检查系统资源（CPU、内存、磁盘）
3. 查看本文档的常见问题部分
4. 提交Issue到项目仓库

---

## 更新日志

### 2025-02-07
- 初始版本
- 添加本地部署指南
- 添加Docker部署方案
- 添加性能调优建议
