# 病种识别系统 - 本地部署

## 快速启动

### Linux/macOS

```bash
# 赋予执行权限
chmod +x start.sh

# 启动服务
./start.sh
```

### Windows

双击运行 `start.bat` 或在命令行中执行：

```cmd
start.bat
```

### 手动启动

```bash
# 安装依赖
pnpm install

# 启动开发服务器
pnpm run dev
```

## 访问地址

启动成功后，在浏览器中访问：

```
http://localhost:5000
```

## 功能说明

- ✅ 上传Excel文件进行病种识别
- ✅ 自定义提示词
- ✅ 实时进度显示
- ✅ 自动重试失败项
- ✅ 分批保存结果
- ✅ 断点续传
- ✅ 历史记录管理

## 临时文件

处理过程中生成的文件保存在：

- **Linux/macOS**: `/tmp/excel-exports/`
- **Windows**: `C:\tmp\excel-exports\`

## 详细文档

完整的部署和配置说明，请查看：

📄 [本地部署完整指南](LOCAL_DEPLOYMENT.md)

## 常见问题

### 端口被占用

修改 `.coze` 文件中的端口号：

```toml
[dev]
run = ["pnpm", "run", "dev", "--port", "3000"]
```

### 内存不足

增加Node.js堆内存：

**Linux/macOS**:
```bash
export NODE_OPTIONS=--max-old-space-size=8192
pnpm run dev
```

**Windows**:
```cmd
set NODE_OPTIONS=--max-old-space-size=8192
pnpm run dev
```

### 依赖安装失败

```bash
# 清理缓存
rm -rf node_modules pnpm-lock.yaml
pnpm store prune

# 重新安装
pnpm install
```

## 技术支持

遇到问题？

1. 查看 [本地部署完整指南](LOCAL_DEPLOYMENT.md)
2. 检查浏览器控制台日志（F12）
3. 查看终端输出日志
