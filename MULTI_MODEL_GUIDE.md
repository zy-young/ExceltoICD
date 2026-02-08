# 多模型提供商使用指南

## 支持的模型提供商

系统现在支持以下 5 个模型提供商：

### 1. Coze
- **API Key 格式**: JWT 格式（包含三个部分，用点号分隔）
- **获取地址**: https://www.coze.cn/
- **支持的模型**:
  - DeepSeek V3 (`deepseek-v3-2-251201`)
  - 豆包 Seed 1.8 (`doubao-seed-1-8-251228`)
- **特点**: Coze 平台集成的模型，通过 Coze SDK 调用

### 2. DeepSeek
- **API Key 格式**: `sk-` 开头
- **获取地址**: https://platform.deepseek.com/
- **支持的模型**:
  - DeepSeek Chat (`deepseek-chat`) - 通用对话模型
  - DeepSeek Reasoner (`deepseek-reasoner`) - 推理模型
- **价格**: ¥0.001-0.002/1K tokens
- **特点**: 性价比高，适合中文任务

### 3. 通义千问
- **API Key 格式**: `sk-` 开头
- **获取地址**: https://dashscope.aliyun.com/
- **支持的模型**:
  - Qwen Turbo (`qwen-turbo`) - 高速响应
  - Qwen Plus (`qwen-plus`) - 均衡性能
  - Qwen Max (`qwen-max`) - 旗舰模型
- **价格**: ¥0.0008-0.04/1K tokens
- **特点**: 阿里云大模型，中文理解能力强

### 4. Gemini
- **API Key 格式**: `AIza` 开头
- **获取地址**: https://aistudio.google.com/
- **支持的模型**:
  - Gemini 1.5 Pro (`gemini-1.5-pro`) - 高性能
  - Gemini 1.5 Flash (`gemini-1.5-flash`) - 高速
- **特点**: Google 最新模型，超长上下文

### 5. OpenAI
- **API Key 格式**: `sk-` 开头
- **获取地址**: https://platform.openai.com/
- **支持的模型**:
  - GPT-4o (`gpt-4o`) - 最新旗舰
  - GPT-4 Turbo (`gpt-4-turbo`) - 高性能
  - GPT-3.5 Turbo (`gpt-3.5-turbo`) - 高性价比
- **特点**: 行业领先，英文能力强

## 使用步骤

### 1. 获取 API Key

#### DeepSeek
1. 访问 https://platform.deepseek.com/
2. 注册/登录账号
3. 进入 API Keys 页面
4. 创建新的 API Key
5. 复制 API Key（格式：`sk-xxxxxxxxxxxxx`）

#### 通义千问
1. 访问 https://dashscope.aliyun.com/
2. 开通 DashScope 服务
3. 创建 API Key
4. 复制 API Key（格式：`sk-xxxxxxxxxxxxx`）

#### Gemini
1. 访问 https://aistudio.google.com/
2. 创建项目
3. 生成 API Key
4. 复制 API Key（格式：`AIzaxxxxxxxxxx`）

#### OpenAI
1. 访问 https://platform.openai.com/
2. 进入 API Keys 页面
3. 创建新的 API Key
4. 复制 API Key（格式：`sk-xxxxxxxxxxxxx`）

### 2. 配置系统

1. 访问系统设置页面 (`/settings`)
2. 在"API 配置"标签页：
   - 输入 API Key
   - 选择模型提供商
   - 选择具体模型
3. 点击"验证 API Key"测试有效性
4. 点击"保存配置"

### 3. 开始使用

1. 返回首页
2. 上传 Excel 文件
3. 选择要分析的列
4. 点击"开始分析"
5. 系统使用配置的模型进行分析

## DeepSeek API Key 使用示例

### 获取 API Key

1. 访问 https://platform.deepseek.com/
2. 登录/注册账号
3. 点击左侧菜单"API Keys"
4. 点击"创建 API Key"
5. 复制生成的 API Key（例如：`sk-1234567890abcdef`）

### 配置到系统

1. 进入系统设置页面
2. 选择模型提供商：**DeepSeek**
3. 输入 API Key：`sk-1234567890abcdef`
4. 选择模型：**DeepSeek Chat** 或 **DeepSeek Reasoner**
5. 点击"验证 API Key"
6. 验证成功后，点击"保存配置"

### 开始分析

1. 返回首页
2. 上传包含文本的 Excel 文件
3. 选择要分析的列
4. 点击"开始分析"
5. 系统会使用 DeepSeek 模型进行病种识别

## 模型选择建议

### 性价比优先
- **DeepSeek Chat**: ¥0.001/1K tokens，中文理解好
- **Qwen Turbo**: ¥0.0008/1K tokens，速度快

### 性能优先
- **DeepSeek Reasoner**: ¥0.002/1K tokens，推理能力强
- **Qwen Max**: ¥0.04/1K tokens，旗舰性能

### 国际化任务
- **GPT-4o**: 英文理解最强
- **Gemini 1.5 Pro**: 多语言支持好

### 长上下文
- **Gemini 1.5 Pro**: 280万 tokens
- **Qwen Max**: 3.2万 tokens

## 注意事项

### API Key 安全
- ✅ 妥善保管 API Key
- ✅ 不要分享 API Key
- ✅ 定期更换 API Key
- ❌ 不要提交到代码仓库
- ❌ 不要在公开场合展示

### 配额限制
- 不同提供商有不同的配额限制
- 请关注账户余额和使用量
- 避免超出配额导致服务中断

### 网络要求
- 确保服务器能访问对应的 API 端点
- 某些提供商可能需要特定的网络环境
- DeepSeek、通义千问在国内访问较快

### 模型切换
- 切换模型提供商时，需要输入对应的 API Key
- 不同提供商的 API Key 不能通用
- 建议先在小数据量上测试新模型

## 故障排查

### API Key 验证失败

**错误**: API Key 无效或无权限
- 检查 API Key 是否正确复制
- 确认 API Key 是否已激活
- 检查账户是否有配额

**错误**: API Key 长度太短
- 确保完整复制了 API Key
- DeepSeek API Key 通常以 `sk-` 开头，长度 50+ 字符

**错误**: 网络连接失败
- 检查服务器网络连接
- 确认能访问对应的 API 端点
- 某些提供商可能需要特殊网络配置

### 分析失败

**错误**: API 请求超时
- 增加超时时间（设置页面调整）
- 检查网络稳定性
- 考虑使用响应更快的模型

**错误**: 配额已用完
- 检查账户余额
- 充值或更换模型
- 使用性价比更高的模型

## 成本估算

### DeepSeek
- 1000 条数据，每条约 100 字
- 约 150K tokens
- 成本：约 ¥0.15-0.3

### 通义千问
- Qwen Turbo: 约 ¥0.12
- Qwen Plus: 约 ¥0.6
- Qwen Max: 约 ¥6

### OpenAI
- GPT-3.5 Turbo: 约 $0.07-0.2
- GPT-4 Turbo: 约 $1.5-4.5

## API Key 格式对照表

| 提供商 | 前缀 | 示例 | 长度 |
|--------|------|------|------|
| Coze | 无 | `eyJhbGciOi...` | 200+ |
| DeepSeek | `sk-` | `sk-123456...` | 50+ |
| 通义千问 | `sk-` | `sk-abcdef...` | 30+ |
| Gemini | `AIza` | `AIzaSy...` | 35+ |
| OpenAI | `sk-` | `sk-proj-...` | 50+ |

## 技术实现

系统通过统一的 LLM 服务接口支持多提供商：

```typescript
// 创建 LLM 服务
const llmService = createLLMService(modelId, apiKey);

// 调用模型
const response = await llmService.invoke(messages, options);
```

模型 ID 格式：`providerId/modelId`

示例：
- `coze/deepseek-v3-2-251201`
- `deepseek/deepseek-chat`
- `qwen/qwen-plus`
- `gemini/gemini-1.5-pro`
- `openai/gpt-4o`

## 更新日志

- 2026-02-08: 支持多模型提供商
  - 新增 DeepSeek 支持
  - 新增通义千问支持
  - 新增 Gemini 支持
  - 新增 OpenAI 支持
  - 优化 API Key 验证逻辑
