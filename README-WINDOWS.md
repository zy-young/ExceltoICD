# Windows 启动指南

## 快速启动

### 方式 1：双击启动（推荐）
直接双击 `start-windows.bat` 文件即可启动开发服务器。

### 方式 2：命令行启动
```bash
# 开发模式
pnpm run dev

# 生产模式（需要先构建）
pnpm run build
pnpm run start
```

## 访问地址
- 开发模式：http://localhost:3010
- 生产模式：http://localhost:3010

## 常见问题

### 1. 提示找不到 pnpm
```bash
npm install -g pnpm@9
```

### 2. 端口被占用
修改 `scripts/dev.sh` 中的 `PORT=3010` 为其他端口。

### 3. 内存不足
已在启动脚本中设置 `NODE_OPTIONS=--max-old-space-size=4096`（4GB）。

## Linux 部署
请参考 README.md 中的 Linux 部署说明。
