# 本地部署快速开始

## 步骤 1：准备项目文件

将以下文件从沙箱环境复制到本地目录：

```
项目根目录/
├── src/                    # 源代码
├── public/                 # 静态资源
├── package.json            # 依赖配置
├── pnpm-lock.yaml          # 锁定文件
├── tsconfig.json           # TypeScript配置
├── next.config.js          # Next.js配置
├── tailwind.config.ts      # Tailwind配置
├── .coze                   # Coze CLI配置
├── .babelrc                # Babel配置
├── .env.example            # 环境变量示例
└── 其他配置文件...
```

## 步骤 2：安装依赖

```bash
pnpm install
```

## 步骤 3：配置 API Key

### 方法 A：使用 .env.local 文件（推荐）

```bash
# 复制示例文件
cp .env.example .env.local

# 编辑 .env.local，设置你的 API Key
# COZE_WORKLOAD_IDENTITY_API_KEY=your-api-key-here
```

### 方法 B：使用环境变量

**Linux/macOS**:
```bash
export COZE_WORKLOAD_IDENTITY_API_KEY="your-api-key-here"
```

**Windows**:
```cmd
set COZE_WORKLOAD_IDENTITY_API_KEY=your-api-key-here
```

## 步骤 4：启动应用

### 方法 A：使用启动脚本（推荐）

**Linux/macOS**:
```bash
chmod +x start.sh
./start.sh
```

**Windows**:
```cmd
start.bat
```

### 方法 B：手动启动

```bash
pnpm run dev
```

## 步骤 5：访问应用

在浏览器中打开：

```
http://localhost:5000
```

## 常见问题

### Q: 如何获取 API Key？

A: 访问 [Coze 开放平台](https://www.coze.com/) 注册并获取 API Key。详细说明请查看 [API Key 配置指南](API_KEY_CONFIG.md)。

### Q: 端口 5000 被占用怎么办？

A: 修改 `.coze` 文件中的端口号：

```toml
[dev]
run = ["pnpm", "run", "dev", "--port", "3000"]
```

### Q: 内存不足怎么办？

A: 增加 Node.js 堆内存：

```bash
# Linux/macOS
export NODE_OPTIONS=--max-old-space-size=8192
pnpm run dev

# Windows
set NODE_OPTIONS=--max-old-space-size=8192
pnpm run dev
```

## 详细文档

| 文档 | 说明 |
|------|------|
| [API_KEY_CONFIG.md](API_KEY_CONFIG.md) | API Key 配置详细说明 |
| [LOCAL_DEPLOYMENT.md](LOCAL_DEPLOYMENT.md) | 完整部署指南 |
| [README_LOCAL.md](README_LOCAL.md) | 本地部署说明 |
| [COMPRESSED_SUMMARY.md](COMPRESSED_SUMMARY.md) | 项目技术总结 |
