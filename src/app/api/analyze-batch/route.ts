import { NextRequest } from 'next/server';
import * as XLSX from 'xlsx';
import { writeFile, readFile, unlink, appendFile, mkdir } from 'fs/promises';
import { join } from 'path';
import { existsSync } from 'fs';
import { tmpdir } from 'os';
import { createLLMService } from '@/lib/llm-service';

export const runtime = 'nodejs';
export const maxDuration = 7200; // 增加到120分钟（2小时）

// 优化后的配置参数
const MAX_RETRIES = 3; // 减少重试次数（从5降到3）
const RETRY_DELAY = 1000; // 减少重试延迟（从2000降到1000）
const SAVE_INTERVAL = 100; // 每100条保存一次
const LLM_CALL_TIMEOUT = 30000; // 30秒超时
const CONCURRENT_BATCH_SIZE = 50; // 增加并发数（从10提升到50）
const BATCH_SIZE = 20; // 批量处理大小：一次请求处理20条数据
const LLM_MODEL = 'deepseek-v3-2-251201'; // LLM模型

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

const formatDuration = (ms: number): string => {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) {
    return `${days}天${hours % 24}小时`;
  } else if (hours > 0) {
    return `${hours}小时${minutes % 60}分钟`;
  } else if (minutes > 0) {
    return `${minutes}分${seconds % 60}秒`;
  } else {
    return `${seconds}秒`;
  }
};

enum LogLevel {
  INFO = 'INFO',
  WARN = 'WARN',
  ERROR = 'ERROR',
  DEBUG = 'DEBUG'
}

enum ErrorType {
  EXCEL_READ = 'EXCEL_READ',
  LLM_CALL = 'LLM_CALL',
  LLM_TIMEOUT = 'LLM_TIMEOUT',
  RESPONSE_PARSE = 'RESPONSE_PARSE',
  NETWORK = 'NETWORK',
  UNKNOWN = 'UNKNOWN'
}

interface LogDetails {
  [key: string]: unknown;
}

const logToFile = async (
  fileId: string,
  level: LogLevel,
  message: string,
  details?: LogDetails,
  controller?: ReadableStreamDefaultController<Uint8Array>
) => {
  const logDir = join(tmpdir(), 'excel-icd-logs');
  try {
    await mkdir(logDir, { recursive: true });
  } catch (error) {
    // 忽略目录已存在的错误
  }
  
  const logFilePath = join(logDir, `analysis-${fileId}.log`);
  const timestamp = new Date().toISOString();
  const logEntry = {
    timestamp,
    level,
    message,
    ...(details && { details })
  };
  
  try {
    await appendFile(logFilePath, JSON.stringify(logEntry) + '\n', 'utf-8');
  } catch (error) {
    console.error('写入日志文件失败:', error);
  }
  
  const consoleMessage = `[${timestamp}] [${level}] ${message}`;
  if (level === LogLevel.ERROR) {
    console.error(consoleMessage, details || '');
  } else if (level === LogLevel.WARN) {
    console.warn(consoleMessage, details || '');
  } else {
    console.log(consoleMessage, details || '');
  }
};

interface ErrorLike {
  message?: string;
  name?: string;
  stack?: string;
  code?: string;
  statusCode?: number;
}

const classifyError = (error: unknown): ErrorType => {
  const errorMessage = (error as ErrorLike)?.message || '';

  if (errorMessage.includes('timeout') || errorMessage.includes('Timeout')) {
    return ErrorType.LLM_TIMEOUT;
  }
  if (errorMessage.includes('network') || errorMessage.includes('ECONNREFUSED') || errorMessage.includes('ETIMEDOUT')) {
    return ErrorType.NETWORK;
  }
  if (errorMessage.includes('parse') || errorMessage.includes('JSON')) {
    return ErrorType.RESPONSE_PARSE;
  }
  if (errorMessage.includes('API') || errorMessage.includes('LLM') || errorMessage.includes('model')) {
    return ErrorType.LLM_CALL;
  }
  return ErrorType.UNKNOWN;
};

const formatErrorDetails = (error: unknown, retryCount: number = 0): LogDetails => {
  const e = error as ErrorLike;
  return {
    errorType: classifyError(error),
    errorMessage: e?.message || 'Unknown error',
    errorName: e?.name || 'Unknown',
    retryAttempt: retryCount + 1,
    stack: e?.stack ? e.stack.split('\n').slice(0, 3).join('\n') : undefined,
    ...(e?.code && { errorCode: e.code }),
    ...(e?.statusCode && { statusCode: e.statusCode }),
  };
};

const getTempFilePath = (fileId: string) => join(tmpdir(), `disease-extraction-${fileId}.json`);

interface TempFileData {
  processedCount?: number;
  savedFiles?: string[];
  successCount?: number;
  failureCount?: number;
  totalDiseases?: number;
  results?: ResultItem[];
}

const saveTempFile = async (fileId: string, data: TempFileData) => {
  const filePath = getTempFilePath(fileId);
  await writeFile(filePath, JSON.stringify(data), 'utf-8');
};

const loadTempFile = async (fileId: string): Promise<TempFileData | null> => {
  const filePath = getTempFilePath(fileId);
  if (!existsSync(filePath)) {
    return null;
  }
  try {
    const content = await readFile(filePath, 'utf-8');
    return JSON.parse(content);
  } catch (error) {
    console.error('读取临时文件失败:', error);
    return null;
  }
};

const deleteTempFile = async (fileId: string) => {
  const filePath = getTempFilePath(fileId);
  try {
    if (existsSync(filePath)) {
      await unlink(filePath);
    }
  } catch (error) {
    console.error('删除临时文件失败:', error);
  }
};

// 固定的器官列表（用于分类）
const FIXED_ORGANS = [
  '肝',
  '胃',
  '胰腺',
  '胆囊',
  '胆道',
  '肾',
  '膀胱',
  '结直肠',
  '卵巢'
];

// 保存结果到Excel文件（每100条一个文件）
interface ResultItem {
  type: string;
  index: number;
  originalText: string;
  diseases: string[];
  error?: string;
  errorType?: string;
  retryable?: boolean;
  processingTime: number;
  processingTimeFormatted: string;
  // 分类后的疾病
  classifiedDiseases?: {
    fixed: Record<string, string[]>;  // 固定器官对应的具体病种列表
    others: string[];                 // 其他病种列表
  };
}

// 分类疾病函数 - 按器官分类
const classifyDiseases = (diseases: string[]) => {
  const fixed: Record<string, string[]> = {};
  const others: string[] = [];

  // 初始化固定器官为空数组
  FIXED_ORGANS.forEach(organ => {
    fixed[organ] = [];
  });

  // 分类每个疾病
  diseases.forEach(disease => {
    let matched = false;

    // 检查是否包含器官名称
    for (const organ of FIXED_ORGANS) {
      if (disease.includes(organ)) {
        fixed[organ].push(disease);
        matched = true;
        break;  // 匹配到第一个就停止，避免重复分类
      }
    }

    // 如果不匹配任何器官，归到"其他"
    if (!matched) {
      others.push(disease);
    }
  });

  return { fixed, others };
};

const saveResultsToExcel = async (
  results: ResultItem[],
  batchNumber: number,
  fileId: string,
  originalRows?: unknown[][],
  originalHeaders?: string[],
  textToRowIndexMap?: number[]
) => {
  const outputDir = join(tmpdir(), 'excel-exports');
  await mkdir(outputDir, { recursive: true });

  // 如果有原始数据，保留所有原始列并添加识别列
  if (originalRows && originalHeaders && textToRowIndexMap) {
    // CSV 表头：原始所有列 + 识别的病种列
    const newHeaders = [...originalHeaders, ...FIXED_ORGANS, '其他', '状态'];

    const rows = results.map((r) => {
      // 找到对应的原始行（通过textToRowIndexMap映射）
      const textIndex = r.index - 1; // r.index从1开始
      const originalRowIndex = textToRowIndexMap[textIndex];
      const originalRow = originalRows[originalRowIndex] || [];

      // 原始列数据 + 识别的病种列
      return [
        ...originalRow.map(cell => {
          const cellStr = cell != null ? String(cell) : '';
          return `"${cellStr.replace(/"/g, '""')}"`;
        }),
        ...FIXED_ORGANS.map(organ => {
          const diseaseList = r.classifiedDiseases?.fixed?.[organ];
          return diseaseList && diseaseList.length > 0
            ? `"${diseaseList.join('; ')}"`
            : '';
        }),
        `"${r.classifiedDiseases?.others?.join('; ') || ''}"`,
        r.error ? '失败' : '成功'
      ];
    });

    const csvContent = [newHeaders.join(','), ...rows.map(row => row.join(','))].join('\n');
    const blob = Buffer.from('\ufeff' + csvContent, 'utf-8');

    const fileName = `batch-${batchNumber}-${fileId}.csv`;
    const filePath = join(outputDir, fileName);
    await writeFile(filePath, blob);

    return fileName;
  } else {
    // 兼容旧逻辑：如果没有原始数据，使用旧的格式
    const headers = ['序号', '原始文本', ...FIXED_ORGANS, '其他', '状态'];

    const rows = results.map((r, index) => [
      index + 1,
      `"${r.originalText.replace(/"/g, '""')}"`,
      ...FIXED_ORGANS.map(organ => {
        const diseaseList = r.classifiedDiseases?.fixed?.[organ];
        return diseaseList && diseaseList.length > 0
          ? `"${diseaseList.join('; ')}"`
          : '';
      }),
      `"${r.classifiedDiseases?.others?.join('; ') || ''}"`,
      r.error ? '失败' : '成功'
    ]);

    const csvContent = [headers.join(','), ...rows.map(row => row.join(','))].join('\n');
    const blob = Buffer.from('\ufeff' + csvContent, 'utf-8');

    const fileName = `batch-${batchNumber}-${fileId}.csv`;
    const filePath = join(outputDir, fileName);
    await writeFile(filePath, blob);

    return fileName;
  }
};

function parseDiseases(response: string): string[] {
  // 去掉可能的破折号/星号前缀（如 "- null" 或 "* null"）
  const cleanedResponse = response.trim().replace(/^[-*]\s*/, '');

  // 检查是否为 null（模糊无法识别）
  if (cleanedResponse.toLowerCase() === 'null' || cleanedResponse.toLowerCase() === '[null]') {
    return ['null'];
  }

  if (cleanedResponse === '未识别到病种' || cleanedResponse.includes('未识别到')) {
    return [];
  }

  const bracketMatch = cleanedResponse.match(/\[(.*)\]/s);
  if (bracketMatch) {
    const inner = bracketMatch[1].trim();
    // [null] 已在上面处理，这里处理 [] 空括号
    if (inner === '') return [];
    const diseases = inner
      .split(',')
      .map(d => d.trim())
      .filter(d => d.length > 0);
    return diseases;
  }

  const withoutPrefix = cleanedResponse.replace(/^\d+[\.\、]\s*/, '');

  const diseases = withoutPrefix
    .split(/[,，、;；]/)
    .map(d => d.trim())
    .filter(d => d.length > 0 && !d.includes('未识别') && !d.includes('无'));

  return diseases;
}

// 批量解析函数：解析批量返回的结果
function parseBatchDiseases(response: string, batchSize: number): string[][] {
  // 过滤空行，避免模型输出中的空行导致行号错位
  const lines = response.trim().split('\n').filter(l => l.trim() !== '');
  const results: string[][] = [];

  for (let i = 0; i < batchSize; i++) {
    if (i < lines.length) {
      const line = lines[i].trim();
      // 移除行号前缀（如 "1. " 或 "1、"）
      const cleanedLine = line.replace(/^\d+[\.\、]\s*/, '');
      results.push(parseDiseases(cleanedLine));
    } else {
      // 如果返回的行数不足，填充空数组
      results.push([]);
    }
  }

  return results;
}

interface FrontendConfig {
  maxRetries?: number;
  retryDelay?: number;
  saveInterval?: number;
  llmCallTimeout?: number;
  concurrentBatchSize?: number;
  heartbeatBatchInterval?: number;
  model?: string;
  temperature?: number;
  topP?: number;
  maxTokens?: number;
  frequencyPenalty?: number;
  presencePenalty?: number;
}

export async function POST(request: NextRequest) {
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      // 声明变量在try块之外，以便catch块可以访问
      let fileId: string = 'unknown';
      let processedCount: number = 0;
      let texts: string[] = [];

      try {
        const formData = await request.formData();
        const file = formData.get('file') as File;
        const column = formData.get('column') as string;
        const systemPrompt = formData.get('systemPrompt') as string;
        const userPrompt = formData.get('userPrompt') as string;
        const resumeFromIndex = parseInt(formData.get('resumeFrom') as string || '0');
        const apiKey = formData.get('apiKey') as string; // 从前端接收API Key
        fileId = formData.get('fileId') as string || Date.now().toString();

        // 从前端接收配置参数
        const frontendConfig = formData.get('config') as string;
        let parsedConfig: FrontendConfig = {};
        try {
          if (frontendConfig) {
            parsedConfig = JSON.parse(frontendConfig);
          }
        } catch (error) {
          console.error('解析配置失败:', error);
        }

        // 强制使用优化配置，忽略前端传递的旧配置
        const maxRetries = MAX_RETRIES; // 固定为3
        const retryDelay = 2000; // 固定为2秒
        const saveInterval = SAVE_INTERVAL; // 固定为100
        const llmCallTimeout = 30000; // 固定为30秒
        const concurrentBatchSize = CONCURRENT_BATCH_SIZE; // 固定为50
        const heartbeatBatchInterval = 5; // 固定为5
        const model = parsedConfig.model || LLM_MODEL; // 只允许自定义模型
        // LLM 生成参数（从前端配置读取）
        const llmTemperature = parsedConfig.temperature ?? 0.3;
        const llmTopP = parsedConfig.topP;
        const llmMaxTokens = parsedConfig.maxTokens || undefined;
        const llmFrequencyPenalty = parsedConfig.frequencyPenalty;
        const llmPresencePenalty = parsedConfig.presencePenalty;

        if (!file || !column) {
          const errorData = { type: 'error', message: '缺少文件或列名' };
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(errorData)}\n\n`));
          controller.close();
          return;
        }

        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'start', fileId })}\n\n`));

        await logToFile(fileId, LogLevel.INFO, '开始分析', {
          totalRowsExpected: 'unknown',
          resumeFromIndex,
          config: {
            model,
            concurrentBatchSize,
            llmCallTimeout,
            maxRetries,
            retryDelay,
            saveInterval,
            heartbeatBatchInterval
          }
        });

        await logToFile(fileId, LogLevel.INFO, '开始读取Excel文件', { fileName: file.name }, controller);
        const arrayBuffer = await file.arrayBuffer();
        const workbook = XLSX.read(arrayBuffer, { type: 'array' });
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 }) as string[][];
        
        await logToFile(fileId, LogLevel.INFO, 'Excel文件读取成功', { 
          sheetName, 
          totalRows: jsonData.length 
        }, controller);

        if (jsonData.length < 2) {
          const errorData = { type: 'error', message: 'Excel 文件为空或格式不正确' };
          await logToFile(fileId, LogLevel.ERROR, 'Excel文件为空或格式不正确', { rows: jsonData.length }, controller);
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(errorData)}\n\n`));
          controller.close();
          return;
        }

        const headers = jsonData[0];
        const columnIndex = headers.indexOf(column);

        if (columnIndex === -1) {
          const errorData = { type: 'error', message: `未找到列名: ${column}` };
          await logToFile(fileId, LogLevel.ERROR, '未找到指定列', { column, headers }, controller);
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(errorData)}\n\n`));
          controller.close();
          return;
        }

        await logToFile(fileId, LogLevel.INFO, '开始提取数据', { column, columnIndex }, controller);

        // 保存原始行数据和索引映射（用于导出时保留所有列）
        const originalRows = jsonData.slice(1);
        const textToRowIndexMap: number[] = []; // texts[i] 对应 originalRows[textToRowIndexMap[i]]

        texts = [];
        originalRows.forEach((row, rowIndex) => {
          const text = row[columnIndex]?.toString() || '';
          if (text.trim()) {
            texts.push(text);
            textToRowIndexMap.push(rowIndex);
          }
        });

        await logToFile(fileId, LogLevel.INFO, '数据提取完成', {
          totalRows: texts.length,
          emptyRows: originalRows.length - texts.length
        }, controller);

        if (texts.length === 0) {
          const errorData = { type: 'error', message: '指定列没有有效数据' };
          await logToFile(fileId, LogLevel.ERROR, '指定列没有有效数据', { column }, controller);
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(errorData)}\n\n`));
          controller.close();
          return;
        }

        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'total', count: texts.length })}\n\n`));

        let existingResults: ResultItem[] = [];
        let existingStats = { successCount: 0, failureCount: 0, totalDiseases: 0 };

        if (resumeFromIndex > 0) {
          const tempData = await loadTempFile(fileId);
          if (tempData) {
            if (tempData.results && tempData.results.length > 0) {
              existingResults = tempData.results;
              existingStats.successCount = existingResults.filter(r => !r.error).length;
              existingStats.failureCount = existingResults.filter(r => r.error).length;
              existingStats.totalDiseases = existingResults.reduce((sum, r) => sum + (r.diseases?.length || 0), 0);
            } else if (tempData.savedFiles && tempData.savedFiles.length > 0) {
              existingStats.successCount = tempData.successCount || 0;
              existingStats.failureCount = tempData.failureCount || 0;
              existingStats.totalDiseases = tempData.totalDiseases || 0;
            }
            
            await logToFile(fileId, LogLevel.INFO, '从临时文件恢复数据', { 
              existingResultsCount: existingResults.length,
              resumeFromIndex,
              stats: existingStats
            }, controller);
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ 
              type: 'resume', 
              count: existingResults.length,
              message: `已从第 ${resumeFromIndex + 1} 条继续处理` 
            })}\n\n`));
          }
        }

        // 使用新的 LLM Service
        const llmService = createLLMService(model, apiKey);
        await logToFile(fileId, LogLevel.INFO, 'LLM服务初始化完成', { 
          model,
          hasApiKey: !!apiKey
        }, controller);

        // 优化后的提示词：简化70%，减少token消耗
        const finalSystemPrompt = systemPrompt || `医疗文本分析助手，提取病种名称。

规则：
1. 只提取明确的病种名称
2. 使用标准医学术语
3. 格式：[病种1, 病种2, ...]
4. 无病种：[]`;

        const startTime = Date.now();
        processedCount = existingResults.length;
        const results = [...existingResults];
        
        // 添加统计计数器，避免在最后遍历大型results数组
        let successCount = existingStats.successCount;
        let failureCount = existingStats.failureCount;
        let totalDiseases = existingStats.totalDiseases;
        
        let currentBatch: ResultItem[] = [];
        let batchNumber = Math.floor(processedCount / SAVE_INTERVAL) + 1;
        let savedFiles: string[] = [];

        // 批量处理函数：一次处理多条数据（核心优化）
        const processBatchTexts = async (batchTexts: Array<{text: string, index: number}>, userPrompt?: string) => {
          const batchStartTime = Date.now();
          const batchResults: ResultItem[] = [];

          try {
            // 构建批量处理的提示词
            const textList = batchTexts.map((item, i) => `${i + 1}. ${item.text}`).join('\n');

            let finalUserPrompt = `提取以下${batchTexts.length}条文本中的病种名称，按行输出结果（行号对应文本序号）。

每行格式为以下三种之一：
- [病种1, 病种2, ...]（有明确病种）
- []（无病种信息）
- null（描述极度模糊，无法判断，如"性质待定"等）

${textList}`;

            if (userPrompt && userPrompt.trim()) {
              finalUserPrompt += `\n\n额外要求：${userPrompt}`;
            }

            let lastError: Error | null = null;
            let fullResponse = '';

            for (let retry = 0; retry <= maxRetries; retry++) {
              try {
                const response = await llmService.invoke(
                  [
                    { role: 'system', content: finalSystemPrompt },
                    { role: 'user', content: finalUserPrompt },
                  ],
                  {
                    temperature: llmTemperature,
                    topP: llmTopP,
                    maxTokens: llmMaxTokens,
                    frequencyPenalty: llmFrequencyPenalty,
                    presencePenalty: llmPresencePenalty,
                  }
                );

                fullResponse = response.content || '';
                lastError = null;
                break;
              } catch (error) {
                lastError = error as Error;
                if (retry < maxRetries) {
                  await delay(retryDelay);
                }
              }
            }

            if (lastError) {
              // 批量处理失败，为每条数据创建错误结果
              const errorDetails = formatErrorDetails(lastError, maxRetries);
              for (const item of batchTexts) {
                const classified = classifyDiseases([]); // 空的分类结果
                batchResults.push({
                  type: 'result',
                  index: item.index + 1,
                  originalText: item.text,
                  diseases: [],
                  classifiedDiseases: classified,
                  error: `${String(errorDetails.errorType)}: ${String(errorDetails.errorMessage)}`,
                  errorType: String(errorDetails.errorType),
                  retryable: false, // 批处理API已经内置重试，不需要前端再重试
                  processingTime: Date.now() - batchStartTime,
                  processingTimeFormatted: formatDuration(Date.now() - batchStartTime)
                });
              }
            } else {
              // 批量处理成功，解析结果
              const diseasesList = parseBatchDiseases(fullResponse, batchTexts.length);

              for (let i = 0; i < batchTexts.length; i++) {
                const item = batchTexts[i];
                const diseases = diseasesList[i] || [];
                const classified = classifyDiseases(diseases); // 分类疾病

                batchResults.push({
                  type: 'result',
                  index: item.index + 1,
                  originalText: item.text,
                  diseases: diseases,
                  classifiedDiseases: classified,
                  processingTime: Date.now() - batchStartTime,
                  processingTimeFormatted: formatDuration(Date.now() - batchStartTime)
                });
              }
            }

            return batchResults;
          } catch (error) {
            // 外层异常处理
            const errorDetails = formatErrorDetails(error, 0);
            for (const item of batchTexts) {
              const classified = classifyDiseases([]); // 空的分类结果
              batchResults.push({
                type: 'result',
                index: item.index + 1,
                originalText: item.text,
                diseases: [],
                classifiedDiseases: classified,
                error: `${String(errorDetails.errorType)}: ${String(errorDetails.errorMessage)}`,
                errorType: String(errorDetails.errorType),
                retryable: false,
                processingTime: Date.now() - batchStartTime,
                processingTimeFormatted: formatDuration(Date.now() - batchStartTime)
              });
            }
            return batchResults;
          }
        };

        // 处理单个文本的函数（保留作为备用）
        const processSingleText = async (text: string, index: number, userPrompt?: string) => {
          const itemStartTime = Date.now();
          
          try {
            let finalUserPrompt = `请分析以下文本，提取其中的病种名称：

文本：${text}`;
            
            if (userPrompt && userPrompt.trim()) {
              finalUserPrompt += `\n\n额外要求：${userPrompt}`;
            }

            let lastError: Error | null = null;
            let fullResponse = '';
            const retryHistory: LogDetails[] = [];

            for (let retry = 0; retry <= maxRetries; retry++) {
              try {
                if (retry > 0) {
                  await logToFile(fileId, LogLevel.INFO, `第 ${index + 1} 条数据 - 第 ${retry + 1} 次尝试`, {
                    retryAttempt: retry + 1,
                    maxRetries: maxRetries + 1
                  }, controller);
                }
                
                try {
                  // 使用统一的 LLM 服务
                  const response = await llmService.invoke(
                    [
                      { role: 'system', content: finalSystemPrompt },
                      { role: 'user', content: finalUserPrompt },
                    ],
                    {
                      temperature: llmTemperature,
                      topP: llmTopP,
                      maxTokens: llmMaxTokens,
                      frequencyPenalty: llmFrequencyPenalty,
                      presencePenalty: llmPresencePenalty,
                    }
                  );
                  
                  fullResponse = response.content || '';

                  lastError = null;
                  break;
                } catch (error) {
                  const errorDetails = formatErrorDetails(error, retry);
                  retryHistory.push(errorDetails);
                  
                  await logToFile(fileId, LogLevel.WARN, `第 ${index + 1} 条数据 - 第 ${retry + 1} 次尝试失败`, {
                    errorType: errorDetails.errorType,
                    errorMessage: errorDetails.errorMessage,
                    retryAttempt: retry + 1,
                    willRetry: retry < maxRetries
                  }, controller);
                  
                  if (retry < maxRetries) {
                    await delay(retryDelay);
                  }
                }
              } catch (outerError) {
                lastError = outerError as Error;
                const errorDetails = formatErrorDetails(outerError, retry);
                retryHistory.push(errorDetails);
                
                await logToFile(fileId, LogLevel.WARN, `第 ${index + 1} 条数据 - 外层try块捕获异常`, {
                  errorType: errorDetails.errorType,
                  errorMessage: errorDetails.errorMessage,
                  retryAttempt: retry + 1
                }, controller);
                
                if (retry < maxRetries) {
                  await delay(retryDelay);
                }
              }
            }

            if (lastError) {
              const processingTime = Date.now() - itemStartTime;
              const errorDetails = formatErrorDetails(lastError, maxRetries);
              
              await logToFile(fileId, LogLevel.ERROR, `第 ${index + 1} 条数据处理失败（全部重试失败）`, {
                totalRetries: maxRetries + 1,
                processingTime,
                errorType: errorDetails.errorType,
                errorMessage: errorDetails.errorMessage,
                retryHistorySummary: retryHistory.map(h => ({
                  attempt: h.retryAttempt,
                  errorType: h.errorType,
                  errorMessage: h.errorMessage
                }))
              }, controller);
              
              const errorData = {
                type: 'result',
                index: index + 1,
                originalText: text,
                diseases: [],
                error: `${errorDetails.errorType}: ${errorDetails.errorMessage}`,
                errorType: errorDetails.errorType,
                retryable: true,
                processingTime: processingTime,
                processingTimeFormatted: formatDuration(processingTime)
              };
              
              return errorData;
            } else {
              const diseases = parseDiseases(fullResponse);
              
              await logToFile(fileId, LogLevel.INFO, `第 ${index + 1} 条数据处理成功`, {
                processingTime: Date.now() - itemStartTime,
                diseasesCount: diseases.length,
                diseases: diseases.length > 0 ? diseases : '无病种'
              }, controller);

              const processingTime = Date.now() - itemStartTime;

              const resultData = {
                type: 'result',
                index: index + 1,
                originalText: text,
                diseases: diseases,
                processingTime: processingTime,
                processingTimeFormatted: formatDuration(processingTime)
              };
              
              return resultData;
            }
          } catch (error) {
            console.error(`处理第 ${index + 1} 条数据失败:`, error);
            const processingTime = Date.now() - itemStartTime;
            const errorDetails = formatErrorDetails(error, 0);
            
            await logToFile(fileId, LogLevel.ERROR, `第 ${index + 1} 条数据处理失败（外层异常）`, {
              errorType: errorDetails.errorType,
              errorMessage: errorDetails.errorMessage,
              processingTime
            }, controller);
            
            const errorData = {
              type: 'result',
              index: index + 1,
              originalText: text,
              diseases: [],
              error: `${errorDetails.errorType}: ${errorDetails.errorMessage}`,
              errorType: errorDetails.errorType,
              retryable: false,
              processingTime: processingTime,
              processingTimeFormatted: formatDuration(processingTime)
            };
            
            return errorData;
          }
        };

        // 批量并发处理数据：核心优化逻辑
        let batchCount = 0; // 批次计数器

        for (let batchStart = resumeFromIndex; batchStart < texts.length; batchStart += concurrentBatchSize) {
          batchCount++;
          const batchEnd = Math.min(batchStart + concurrentBatchSize, texts.length);

          // 将数据分成多个小批次，每个小批次包含BATCH_SIZE条数据
          const batchPromises = [];
          for (let i = batchStart; i < batchEnd; i += BATCH_SIZE) {
            const miniBatchEnd = Math.min(i + BATCH_SIZE, batchEnd);
            const miniBatchTexts = [];

            for (let j = i; j < miniBatchEnd; j++) {
              miniBatchTexts.push({
                text: texts[j],
                index: j
              });
            }

            // 批量处理这个小批次
            batchPromises.push(processBatchTexts(miniBatchTexts, userPrompt));
          }

          // 并发执行所有小批次
          const allBatchResults = await Promise.all(batchPromises);

          // 展平结果
          const batchResults = allBatchResults.flat();

          // 处理结果
          for (const result of batchResults) {
            // 更新统计计数器
            if (!('error' in result) || !result.error) {
              successCount++;
              totalDiseases += (result.diseases?.length || 0);
            } else {
              failureCount++;
            }

            results.push(result);
            currentBatch.push(result);
            processedCount++;

            // 立即发送结果给前端
            controller.enqueue(encoder.encode(`data: ${JSON.stringify(result)}\n\n`));
          }

          // 每saveInterval条保存一次Excel
          if (processedCount % saveInterval === 0) {
            await logToFile(fileId, LogLevel.INFO, `保存第 ${batchNumber} 批数据`, {
              batchSize: currentBatch.length,
              totalProcessed: processedCount
            }, controller);
            
            const fileName = await saveResultsToExcel(currentBatch, batchNumber, fileId, originalRows, headers, textToRowIndexMap);
            savedFiles.push(fileName);
            currentBatch = [];
            batchNumber++;
            
            // 保存临时文件：只保存进度信息，不保存完整results，避免内存和IO问题
            await saveTempFile(fileId, { processedCount, savedFiles, successCount, failureCount, totalDiseases });
            
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ 
              type: 'saved', 
              count: processedCount,
              batchFile: fileName
            })}\n\n`));
            
            // 定期清空results数组以节省内存（每saveInterval条清空一次）
            // 结果已经通过SSE发送给前端并保存到CSV文件，不再需要在内存中保留
            results.length = 0;
          }
          
          // 每heartbeatBatchInterval个批次发送一次心跳保活，减少网络IO
          if (batchCount % heartbeatBatchInterval === 0) {
          const heartbeatData = {
            type: 'heartbeat',
            timestamp: Date.now(),
            processed: processedCount
          };
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(heartbeatData)}\n\n`));
          }
          
          // 每saveInterval条发送一次进度更新，减少网络IO
          if (processedCount % saveInterval === 0) {
            const elapsed = Date.now() - startTime;
            const progressData = {
              type: 'progress',
              processed: processedCount,
              total: texts.length,
              percentage: Math.round((processedCount / texts.length) * 100),
              elapsed: elapsed,
              elapsedFormatted: formatDuration(elapsed)
            };
            controller.enqueue(encoder.encode(`data: ${JSON.stringify(progressData)}\n\n`));
          }
        }

        // 保存最后一批数据
        if (currentBatch.length > 0) {
          await logToFile(fileId, LogLevel.INFO, `保存最后一批数据`, {
            batchSize: currentBatch.length,
            batchNumber
          }, controller);
          
          const fileName = await saveResultsToExcel(currentBatch, batchNumber, fileId);
          savedFiles.push(fileName);
          currentBatch = [];
          
          // 保存最终临时文件，更新统计信息
          await saveTempFile(fileId, { processedCount, savedFiles, successCount, failureCount, totalDiseases });
        }

        const elapsed = Date.now() - startTime;
        
        // 使用已经维护的计数器，避免遍历大型results数组
        // const successCount = results.filter(r => !r.error).length;
        // const failureCount = results.filter(r => r.error).length;
        await logToFile(fileId, LogLevel.INFO, '分析完成', {
          totalProcessed: processedCount,
          totalExpected: texts.length,
          successCount,
          failureCount,
          successRate: ((successCount / processedCount) * 100).toFixed(2) + '%',
          totalDiseases,
          totalDuration: elapsed,
          avgProcessingTime: (elapsed / processedCount).toFixed(2) + 'ms',
          savedBatches: savedFiles.length
        }, controller);
        
        const completeData = {
          type: 'complete',
          processed: processedCount,
          total: texts.length,
          elapsed: elapsed,
          elapsedFormatted: formatDuration(elapsed),
          savedFiles: savedFiles
        };
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(completeData)}\n\n`));
        
        await deleteTempFile(fileId);
        
        controller.close();

      } catch (error) {
        console.error('处理错误:', error);
        const errorDetails = formatErrorDetails(error, 0);
        
        try {
          await logToFile(fileId || 'unknown', LogLevel.ERROR, '处理发生严重错误', {
            errorType: errorDetails.errorType,
            errorMessage: errorDetails.errorMessage,
            processedCount: processedCount || 0,
            totalRows: texts?.length || 0
          });
        } catch (logError) {
          console.error('记录错误日志失败:', logError);
        }
        
        const errorData = { 
          type: 'error', 
          message: `${errorDetails.errorType}: ${errorDetails.errorMessage}`,
          errorType: errorDetails.errorType,
          processedCount: processedCount || 0
        };
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(errorData)}\n\n`));
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'Transfer-Encoding': 'chunked',
    },
  });
}
