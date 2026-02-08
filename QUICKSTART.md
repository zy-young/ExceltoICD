# 快速开始测试

## 方式一：使用 DeepSeek API（推荐）

### 1. 获取 API Key

访问 https://platform.deepseek.com/ 注册并获取 API Key

### 2. 配置系统

1. 打开浏览器访问：http://localhost:5000/settings
2. 在"API 配置"中：
   - 输入 DeepSeek API Key（格式：`sk-xxxxx`）
   - 选择模型提供商：**DeepSeek**
   - 选择模型：**DeepSeek Chat**
3. 点击"验证 API Key"
4. 点击"保存配置"

### 3. 测试

1. 返回首页：http://localhost:5000/
2. 上传测试用的 Excel 文件
3. 开始分析

---

## 方式二：使用通义千问 API

### 1. 获取 API Key

访问 https://dashscope.aliyun.com/ 开通服务并获取 API Key

### 2. 配置系统

1. 打开浏览器访问：http://localhost:5000/settings
2. 在"API 配置"中：
   - 输入通义千问 API Key（格式：`sk-xxxxx`）
   - 选择模型提供商：**通义千问**
   - 选择模型：**Qwen Turbo**（性价比高）
3. 点击"验证 API Key"
4. 点击"保存配置"

### 3. 测试

同 DeepSeek 步骤

---

## 方式三：使用 OpenAI API

### 1. 获取 API Key

访问 https://platform.openai.com/ 获取 API Key

### 2. 配置系统

1. 打开浏览器访问：http://localhost:5000/settings
2. 在"API 配置"中：
   - 输入 OpenAI API Key（格式：`sk-xxxxx`）
   - 选择模型提供商：**OpenAI**
   - 选择模型：**GPT-3.5 Turbo**（性价比高）或 **GPT-4o**（性能强）
3. 点击"验证 API Key"
4. 点击"保存配置"

### 3. 测试

同 DeepSeek 步骤

---

## 测试建议

### 小数据量测试
- 先使用 10-50 条数据测试
- 验证 API Key 有效性和模型响应
- 确认识别准确率

### 性能对比测试
- 使用相同数据测试不同模型
- 记录响应时间和准确率
- 选择最适合的模型

### 成本对比
- DeepSeek：¥0.001/1K tokens（性价比最高）
- 通义千问：¥0.0008-0.04/1K tokens
- OpenAI：$0.0005-0.03/1K tokens

---

## 常见问题

### Q: API Key 验证失败
**A**: 检查以下几点：
- API Key 是否完整复制
- API Key 是否已激活
- 账户是否有配额
- 网络是否能访问对应的 API 端点

### Q: 分析速度很慢
**A**: 可以尝试：
- 降低并发数（在设置页面调整）
- 增加超时时间
- 使用响应更快的模型（如 Qwen Turbo、DeepSeek Chat）

### Q: 识别准确率不高
**A**: 可以尝试：
- 优化提示词（在设置页面调整）
- 使用性能更强的模型（如 GPT-4o、Qwen Max）
- 提供更多上下文信息

---

## 支持的模型列表

| 提供商 | 模型 | 价格 | 特点 |
|--------|------|------|------|
| Coze | DeepSeek V3 | - | 通过 Coze 平台 |
| DeepSeek | DeepSeek Chat | ¥0.001/1K | 性价比高 |
| DeepSeek | DeepSeek Reasoner | ¥0.002/1K | 推理强 |
| 通义千问 | Qwen Turbo | ¥0.0008/1K | 高速响应 |
| 通义千问 | Qwen Plus | ¥0.004/1K | 均衡性能 |
| 通义千问 | Qwen Max | ¥0.04/1K | 旗舰性能 |
| Gemini | Gemini 1.5 Flash | - | 高速响应 |
| Gemini | Gemini 1.5 Pro | - | 高性能 |
| OpenAI | GPT-3.5 Turbo | $0.0015/1K | 高性价比 |
| OpenAI | GPT-4 Turbo | $0.01/1K | 高性能 |
| OpenAI | GPT-4o | $0.005/1K | 最新旗舰 |

详细使用指南请查看：[MULTI_MODEL_GUIDE.md](./MULTI_MODEL_GUIDE.md)
