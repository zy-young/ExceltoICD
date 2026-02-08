# 压缩摘要

## 用户需求与目标
- 原始目标: 创建一个基于Excel的病种识别系统，支持自定义提示词调试。
- 当前目标: 支持多种模型提供商（DeepSeek、通义千问、Gemini、OpenAI等），修复API Key验证问题，提供完整的配置和使用指南。

## 项目概览
- 概述: 基于Next.js的Excel病种识别系统，采用非流式LLM调用配合SSE实时进度推送。支持自动重试、断点续传、自定义提示词、详细的错误日志追踪及分批文件保存。
- 技术栈:
  - Next.js 16 (App Router)
  - React 19
  - TypeScript 5
  - shadcn/ui (UI组件)
  - Tailwind CSS 4
  - xlsx (Excel处理)
  - coze-coding-dev-sdk (LLM集成)
- 编码规范: 使用TypeScript标准规范。

## 关键决策
- **架构调整**：放弃SSE流式输出，改用非流式`client.invoke`调用，解决LLM调用卡住导致任务中断的问题。
- **并发处理**：实现批量并发处理机制，每批次处理10条数据（本地环境优化），沙箱环境为20条。
- **分批保存策略**：每处理100条数据，自动保存为一个独立的CSV文件到`/tmp/excel-exports`目录，防止因中断导致大量数据丢失。
- **模型切换**：将模型从`doubao-seed-1-8-251228`切换为`deepseek-v3-2-251201`，以应对低成功率问题。
- **超时优化**：将单次LLM调用超时从15秒延长至30秒（针对本地网络环境优化），配合5次重试机制，快速失败并重试。
- **长时运行保障**：将服务器`maxDuration`从15分钟逐步延长至120分钟，以支持20000条数据的稳定运行。
- **心跳保活**：每5个批次（100条）发送一次SSE心跳事件，保持连接活跃，防止长时间运行导致连接断开。
- **性能优化**：
  - 减少日志IO操作（注释掉每条数据的DEBUG/INFO日志，只保留错误日志和重要进度日志）
  - 降低心跳发送频率（从每批次改为每5批次）
  - 减少进度更新频率（从每10条改为每100条）
- **内存优化**（关键修复）：
  - 临时文件不再保存完整results数组，只保存processedCount、savedFiles和统计计数器
  - 每100条清空results数组，避免内存无限增长
  - 使用独立计数器（successCount、failureCount、totalDiseases）替代results数组遍历统计
- **API Key 配置优化**：
  - 创建系统设置页面 (`/settings`)，支持UI配置API Key
  - API Key支持前端传入（通过FormData）或环境变量
  - 添加API Key验证功能，实时测试有效性
  - 支持配置并发数和超时时间
  - 配置保存在浏览器localStorage中
- **多模型支持**：
  - 创建统一的LLM服务层 (`src/lib/llm-service.ts`)，支持多种API提供商
  - 支持的提供商：Coze、DeepSeek、通义千问、Gemini、OpenAI
  - 模型ID格式：`providerId/modelId`（如 `deepseek/deepseek-chat`）
  - 移除严格的JWT格式验证，支持多种API Key格式
  - 创建模型提供商配置 (`src/lib/model-providers.ts`)，定义了5个提供商和对应的模型列表

## 核心文件修改
- 文件操作:
  - create: `src/lib/model-providers.ts` (模型提供商配置)
  - create: `src/lib/llm-service.ts` (统一的LLM服务)
  - edit: `src/app/api/validate-key/route.ts` (支持多提供商验证)
  - edit: `src/app/api/analyze/route.ts` (使用统一LLM服务)
  - edit: `src/app/api/retry/route.ts` (使用统一LLM服务)
  - edit: `src/app/settings/page.tsx` (支持提供商和模型选择)
  - create: `SERVER_REQUIREMENTS.md` (服务器配置要求文档)
  - create: `MULTI_MODEL_GUIDE.md` (多模型使用指南)
- 关键修改:
  - 创建 `MODEL_PROVIDERS` 配置，定义了5个提供商和对应的模型列表
  - 创建 `LLMService` 类，统一封装了不同提供商的API调用逻辑
  - 修改 `validate-key` API，支持传入 `modelId` 参数，使用对应的提供商验证
  - 修改 `analyze` API，使用 `createLLMService` 替代原有的 `LLMClient`
  - 修改 `retry` API，使用 `createLLMService` 替代原有的 `LLMClient`
  - 更新设置页面，添加提供商选择和模型选择功能
  - API Key 验证逻辑改进：移除JWT格式限制，改为长度验证（>=20字符）
  - 添加详细的API Key格式说明和示例

## 问题或错误及解决方案
- 问题: LLM流式调用（`client.stream`）经常卡住，导致任务中断且无错误日志，重试机制失效。
  - 解决方案: 放弃流式调用，改用非流式`client.invoke`。虽然牺牲了实时性，但极大提高了稳定性。
- 问题: 处理大量数据时成功率低，中断后大量已处理数据丢失。
  - 解决方案: 实现分批保存机制，每100条保存一个独立文件，确保即使中断也能保留大部分成果。
- 问题: 代码中使用了不存在的`client.chat`方法，导致分析失败。
  - 解决方案: 将所有API中的LLM调用统一改为`client.invoke`。
- 问题: 后端创建了result数据但未通过SSE发送，导致前端结果为空，下载失败。
  - 解决方案: 在成功、失败及异常处理逻辑中，立即通过`controller.enqueue`发送数据给前端。
- 问题: 分析完成提示卡片一闪而过，用户无法点击下载。
  - 解决方案: 新增独立的`showCompletionBanner`状态控制提示显示，添加手动关闭按钮。
- 问题: 执行到1300条左右时出现中断，可能与长时间运行有关。
  - 解决方案: 增加服务器超时时间至120分钟，添加SSE心跳保活机制，前端增加超时检测。
- 问题: 处理20000条数据时，每条数据的日志记录和频繁的心跳/进度更新导致IO和网络开销过大。
  - 解决方案: 注释掉每条数据的DEBUG和INFO日志，只保留错误日志和重要进度日志；心跳发送频率从每批次改为每5批次（每100条）；进度更新从每10条改为每100条。
- 问题: **处理2600条数据时突然中断，内存和IO压力过大导致系统崩溃**。
  - 根本原因:
    1. results数组一直累积所有结果，处理2600条时占用大量内存
    2. saveTempFile每次保存完整results数组，导致：
       - JSON.stringify处理大量数据，CPU密集
       - 写入大文件，IO密集
       - 内存峰值（results数组 + JSON字符串 + 写入缓冲区）
  - 解决方案:
    1. saveTempFile只保存processedCount、savedFiles和统计计数器，不保存完整results
    2. 每100条保存后立即清空results数组（`results.length = 0`）
    3. 使用独立计数器（successCount、failureCount、totalDiseases）替代results数组遍历统计
    4. 断点续传时兼容新旧两种临时文件格式
- 问题: **优化后仍然在2600条左右中断，日志显示请求在112秒后返回200**。
  - 根本原因: 沙箱平台对单个SSE连接有隐藏的超时限制或资源限制，导致连接在约2分钟后被强制关闭。
  - 证据:
    1. 日志显示请求在112秒后返回200，但处理2600条数据需要更长时间
    2. 没有OOM、SIGKILL等明显错误
    3. 总是在相同位置（2600条左右）中断
    4. 无论代码中如何设置`maxDuration = 7200`，都无法突破平台限制
  - 解决方案: **部署到本地环境运行**，可以完全控制服务器配置和资源限制。
  - 本地部署文件:
    - `LOCAL_DEPLOYMENT.md` - 完整的本地部署指南
    - `start.sh` - Linux/macOS快速启动脚本
    - `start.bat` - Windows快速启动脚本
    - `README_LOCAL.md` - 本地部署快速入门
- 问题: **本地部署后无法识别病种且运行速度极慢**。
  - 可能原因:
    1. API Key未正确配置或无效
    2. 本地网络环境导致LLM调用超时
    3. 并发数过高导致API限流
  - 解决方案:
    1. 降低并发数（CONCURRENT_BATCH_SIZE从20降至10）
    2. 增加超时时间（LLM_CALL_TIMEOUT从15秒增至30秒）
    3. 创建系统设置页面，支持UI配置API Key
    4. 支持前端直接传入API Key，避免环境变量配置困难
    5. 添加API Key验证功能，确保配置正确
- 问题: **API Key 验证失败，提示"格式不正确，应该是 JWT 格式"**。
  - 原因: 之前的验证逻辑要求API Key必须是JWT格式（3个部分用点号分隔），但DeepSeek等提供商使用的是 `sk-` 开头的格式。
  - 解决方案:
    1. 移除严格的JWT格式验证
    2. 改为长度验证（至少20个字符）
    3. 支持多种API Key格式：JWT格式、sk-开头格式、其他格式
    4. 提供更友好的错误提示

## 完成的功能
✅ 支持多种模型提供商（Coze、DeepSeek、通义千问、Gemini、OpenAI）
✅ 统一的LLM服务接口，支持不同提供商的API调用
✅ 设置页面支持提供商选择和模型选择
✅ API Key 验证支持多种格式
✅ 详细的API Key格式说明和错误提示
✅ 完整的多模型使用指南文档

## 文档清单
- `SERVER_REQUIREMENTS.md` - 服务器配置要求
- `LOCAL_DEPLOYMENT.md` - 本地部署指南
- `README_LOCAL.md` - 本地部署快速入门
- `MULTI_MODEL_GUIDE.md` - 多模型使用指南（新增）
- `SUMMARY.md` - 本压缩摘要

## TODO
- 用户可以选择不同的模型提供商进行测试
- 根据使用反馈优化模型切换体验
