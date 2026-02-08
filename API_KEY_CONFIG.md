# LLM API Key 配置说明

## 配置位置

### 1. 代码中的初始化位置

LLM 客户端在以下文件中初始化：

**主要位置**：`src/app/api/analyze/route.ts`

```typescript
// 第 327-331 行
const config = new Config({ timeout: 30000 });
const client = new LLMClient(config);
```

**其他位置**：
- `src/app/api/retry/route.ts` - 重试功能
- `src/app/api/analyze-stream/route.ts` - 流式分析（备用）

---

## API Key 的获取方式

`coze-coding-dev-sdk` 的 `Config` 类支持以下两种方式获取 API Key：

### 方式 1：环境变量（推荐）

SDK 会自动从以下环境变量读取 API Key：

```bash
export COZE_WORKLOAD_IDENTITY_API_KEY="your-api-key-here"
```

### 方式 2：直接传入 Config 对象

```typescript
const config = new Config({ 
  apiKey: 'your-api-key-here',
  timeout: 30000 
});
const client = new LLMClient(config);
```

---

## 配置示例

### 沙箱环境

在当前的沙箱环境中，API Key 可能已经由平台自动配置（通过注入环境变量），无需手动配置。

**查看当前配置**：
```bash
echo $COZE_WORKLOAD_IDENTITY_API_KEY
```

### 本地环境（推荐）

在本地环境部署时，需要手动配置 API Key。

#### 方法 A：使用 .env 文件

1. 创建 `.env.local` 文件：

```env
# LLM API Key 配置
COZE_WORKLOAD_IDENTITY_API_KEY=your-api-key-here

# 可选：配置自定义 Base URL
COZE_INTEGRATION_BASE_URL=https://api.coze.com
COZE_INTEGRATION_MODEL_BASE_URL=https://api.coze.com/v3
```

2. 确保 `.env.local` 在 `.gitignore` 中（已配置）

3. 重启开发服务器：

```bash
pnpm run dev
```

#### 方法 B：使用系统环境变量

**Linux/macOS**:
```bash
# 临时设置（仅当前会话）
export COZE_WORKLOAD_IDENTITY_API_KEY="your-api-key-here"
pnpm run dev

# 永久设置（添加到 ~/.bashrc 或 ~/.zshrc）
echo 'export COZE_WORKLOAD_IDENTITY_API_KEY="your-api-key-here"' >> ~/.bashrc
source ~/.bashrc
```

**Windows (CMD)**:
```cmd
set COZE_WORKLOAD_IDENTITY_API_KEY=your-api-key-here
pnpm run dev
```

**Windows (PowerShell)**:
```powershell
$env:COZE_WORKLOAD_IDENTITY_API_KEY="your-api-key-here"
pnpm run dev
```

#### 方法 C：修改代码（不推荐）

在 `src/app/api/analyze/route.ts` 中修改：

```typescript
// 第 327 行
const config = new Config({ 
  apiKey: 'your-api-key-here',  // 添加 API Key
  timeout: 30000 
});
```

⚠️ **注意**：这种方法不安全，不要将包含真实 API Key 的代码提交到版本控制系统！

---

## 如何获取 API Key

### 获取 Coze API Key

1. 访问 [Coze 开放平台](https://www.coze.com/)
2. 登录或注册账号
3. 进入控制台
4. 创建应用或使用已有应用
5. 在应用设置中找到 API Key

### 其他兼容的 LLM 服务

如果您想使用其他 LLM 服务（如 OpenAI、DeepSeek、Kimi 等），需要修改代码中的：

1. **API Key 配置**
2. **Base URL 配置**（`COZE_INTEGRATION_BASE_URL` 或 `COZE_INTEGRATION_MODEL_BASE_URL`）
3. **模型名称**（`LLM_MODEL` 常量）

---

## 验证配置

### 验证环境变量

**Linux/macOS**:
```bash
echo $COZE_WORKLOAD_IDENTITY_API_KEY
```

**Windows (CMD)**:
```cmd
echo %COZE_WORKLOAD_IDENTITY_API_KEY%
```

**Windows (PowerShell)**:
```powershell
echo $env:COZE_WORKLOAD_IDENTITY_API_KEY
```

### 验证代码中的配置

在 `src/app/api/analyze/route.ts` 中添加日志：

```typescript
const config = new Config({ timeout: 30000 });
console.log('API Key configured:', !!config.apiKey); // 应该输出 true
const client = new LLMClient(config);
```

---

## 完整的环境变量列表

| 环境变量 | 说明 | 默认值 | 必需 |
|---------|------|--------|------|
| `COZE_WORKLOAD_IDENTITY_API_KEY` | LLM API Key | 无 | ✅ 是 |
| `COZE_INTEGRATION_BASE_URL` | API Base URL | 平台默认 | ❌ 否 |
| `COZE_INTEGRATION_MODEL_BASE_URL` | 模型 API Base URL | 平台默认 | ❌ 否 |

---

## 常见问题

### Q1: 如何确认 API Key 是否配置成功？

**方法 1**：查看环境变量
```bash
echo $COZE_WORKLOAD_IDENTITY_API_KEY
```

**方法 2**：查看错误日志
如果 API Key 未配置，会看到类似错误：
```
API key is required. Set COZE_WORKLOAD_IDENTITY_API_KEY or provide apiKey in config.
```

### Q2: API Key 需要收费吗？

这取决于您使用的 LLM 服务：
- Coze 平台可能有免费额度
- 第三方服务（如 DeepSeek、Kimi）通常按使用量计费
- 请查看具体服务的定价页面

### Q3: 可以使用多个 API Key 吗？

当前代码只支持单个 API Key。如需使用多个 API Key，需要：
1. 修改 Config 初始化逻辑
2. 实现轮询或负载均衡策略

### Q4: API Key 会过期吗？

这取决于您的服务提供商：
- 部分 API Key 永久有效
- 部分 API Key 有有效期
- 建议定期查看 API Key 状态

---

## 安全建议

1. ✅ **永远不要**将 `.env` 文件提交到版本控制系统
2. ✅ 使用 `.env.local` 存储敏感信息（已在 `.gitignore` 中）
3. ✅ 定期轮换 API Key
4. ✅ 使用最小权限原则配置 API Key
5. ❌ 不要在前端代码中暴露 API Key
6. ❌ 不要在公开场合分享 API Key

---

## 修改启动脚本

如果使用本地部署的启动脚本，可以添加环境变量设置：

### start.sh (Linux/macOS)

```bash
#!/bin/bash

# 添加环境变量
export COZE_WORKLOAD_IDENTITY_API_KEY="your-api-key-here"

echo "=========================================="
echo "  病种识别系统 - 本地启动"
echo "=========================================="

# ... 其余代码 ...
```

### start.bat (Windows)

```batch
@echo off
chcp 65001 >nul

REM 添加环境变量
set COZE_WORKLOAD_IDENTITY_API_KEY=your-api-key-here

echo ==========================================
echo   病种识别系统 - 本地启动
echo ==========================================

REM ... 其余代码 ...
```

---

## 相关文件

- `src/app/api/analyze/route.ts` - 主要分析接口
- `src/app/api/retry/route.ts` - 重试接口
- `node_modules/coze-coding-dev-sdk/dist/core/config.js` - SDK 配置逻辑
- `.env.local` - 本地环境变量配置
- `.gitignore` - Git 忽略文件配置
