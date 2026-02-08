'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { Upload, FileText, Loader2, Download, Lightbulb, RefreshCw, XCircle, RotateCcw, Clock, History, CheckCircle, Settings } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import * as XLSX from 'xlsx';
import { useRouter } from 'next/navigation';

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

interface ResultData {
  originalText: string;
  diseases: string[];
  error?: string;
  errorType?: string;  // 错误类型
  errorDetails?: any;  // 详细的错误信息
  retryable?: boolean;
  isRetrying?: boolean;
  processingTime?: number;  // 处理时间（毫秒）
  processingTimeFormatted?: string;  // 格式化的处理时间
  // 分类后的疾病
  classifiedDiseases?: {
    fixed: Record<string, string[]>;  // 固定疾病对应的具体名称列表
    others: string[];                 // 其他疾病列表
  };
}

const PROMPT_TEMPLATES = {
  default: {
    name: '标准病种识别',
    systemPrompt: `你是一个专业的医疗文本分析助手，专门从文本中识别和提取病种名称。

规则：
1. 仔细分析文本，识别其中提到的所有疾病、病症、病种名称
2. 只提取明确的病种名称，不要包含症状描述或治疗方式
3. 病种可以是通用疾病名称（如"高血压"、"糖尿病"）或特定病种（如"阿尔茨海默病"）
4. 如果文本中没有病种信息，返回"未识别到病种"
5. 使用标准医学术语

输出格式要求：
- 直接输出识别到的病种列表
- 格式：[病种1, 病种2, ...]
- 如果没有病种：未识别到病种
- 不要输出任何解释或其他文字`,
  },
  strict: {
    name: '严格模式',
    systemPrompt: `你是一个严格的医疗术语提取专家，从文本中精确提取病种名称。

严格规则：
1. 只提取官方ICD编码中定义的疾病名称
2. 排除所有症状、体征、检查结果等非疾病描述
3. 排除疾病修饰词（如"急性"、"慢性"、"轻度"等）
4. 每个病种必须是独立的医学名词

输出格式：
- 直接输出疾病名称列表
- 格式：[疾病名称1, 疾病名称2]
- 无疾病：未识别到病种
- 不要输出其他内容`,
  },
  comprehensive: {
    name: '全面提取',
    systemPrompt: `你是一个全面的医疗信息提取助手，从文本中提取所有医疗相关信息。

提取范围：
1. 病种名称（包括通用名和别名）
2. 疾病类型（如"传染病"、"慢性病"）
3. 疾病状态（如"早期"、"晚期"）
4. 并发症和合并症

输出格式：
- 直接输出医疗信息列表
- 格式：[主要病种, 相关病种1, 相关病种2, 并发症1, ...]
- 无疾病：未识别到病种
- 不要输出其他内容`,
  },
  icd: {
    name: 'ICD编码模式',
    systemPrompt: `你是一个ICD编码专家，从文本中识别疾病并尽可能提供ICD编码。

规则：
1. 识别文本中的所有疾病名称
2. 尽可能提供对应的ICD-10编码
3. 格式：疾病名称(ICD编码)
4. 如果无法确定编码，只提供疾病名称

输出格式：
- 直接输出疾病和编码列表
- 格式：[疾病1(ICD-10), 疾病2(ICD-10), ...]
- 无疾病：未识别到病种
- 不要输出其他内容`,
  },
};

export default function DiseaseExtractor() {
  const [file, setFile] = useState<File | null>(null);
  const [excelHeaders, setExcelHeaders] = useState<string[]>([]);
  const [selectedColumn, setSelectedColumn] = useState<string>('');
  const [results, setResults] = useState<ResultData[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string>('');
  const [progress, setProgress] = useState({ processed: 0, total: 0, percentage: 0 });
  const [elapsed, setElapsed] = useState<number>(0); // 运行时长（毫秒）
  const [elapsedFormatted, setElapsedFormatted] = useState<string>(''); // 格式化后的运行时长
  
  // 自动保存和断点续传相关状态
  const [fileId, setFileId] = useState<string>('');
  const [autoSaveCount, setAutoSaveCount] = useState<number>(0);
  const [hasInterruptedData, setHasInterruptedData] = useState<boolean>(false);
  const [savedMessage, setSavedMessage] = useState<string>('');
  const [showCompletionBanner, setShowCompletionBanner] = useState<boolean>(false); // 显示完成提示
  
  // 提示词相关状态
  const [selectedTemplate, setSelectedTemplate] = useState<string>('default');
  const [customSystemPrompt, setCustomSystemPrompt] = useState<string>(PROMPT_TEMPLATES.default.systemPrompt);
  const [customUserPrompt, setCustomUserPrompt] = useState<string>('');
  
  // 实时日志状态
  const [logs, setLogs] = useState<any[]>([]);
  const [showLogs, setShowLogs] = useState<boolean>(false);
  
  // 用于取消请求
  const abortControllerRef = useRef<AbortController | null>(null);
  const router = useRouter();

  // 超时检测
  const lastDataTimeRef = useRef<number>(Date.now());
  const timeoutWarningRef = useRef<NodeJS.Timeout | null>(null);

  // 保存历史记录到LocalStorage
  const saveHistory = (status: 'completed' | 'interrupted' | 'error') => {
    const historyRecord = {
      id: fileId || Date.now().toString(),
      fileName: file?.name || '未命名文件',
      timestamp: Date.now(),
      totalRows: progress.total || results.length,
      processedRows: results.length,
      status: status,
      results: results,
      logs: logs,
      elapsed: elapsed,
      elapsedFormatted: elapsedFormatted,
      fileId: fileId
    };

    try {
      const saved = localStorage.getItem('disease-extraction-history');
      const history = saved ? JSON.parse(saved) : [];
      history.push(historyRecord);
      localStorage.setItem('disease-extraction-history', JSON.stringify(history));
    } catch (error) {
      console.error('保存历史记录失败:', error);
    }
  };

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

  const handleFileChange = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      if (!selectedFile.name.endsWith('.xlsx') && !selectedFile.name.endsWith('.xls')) {
        setError('请选择 Excel 文件 (.xlsx 或 .xls)');
        return;
      }
      
      try {
        // 读取 Excel 文件获取列名
        const arrayBuffer = await selectedFile.arrayBuffer();
        const workbook = XLSX.read(arrayBuffer, { type: 'array' });
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 }) as string[][];
        
        if (jsonData.length > 0) {
          setExcelHeaders(jsonData[0]);
        }
        
        setFile(selectedFile);
        setError('');
        setResults([]);
        setSelectedColumn('');
        setProgress({ processed: 0, total: 0, percentage: 0 });
      } catch (err) {
        setError('文件读取失败，请检查文件格式');
        console.error(err);
      }
    }
  }, []);

  const handleTemplateChange = (templateKey: string) => {
    setSelectedTemplate(templateKey);
    const template = PROMPT_TEMPLATES[templateKey as keyof typeof PROMPT_TEMPLATES];
    if (template) {
      setCustomSystemPrompt(template.systemPrompt);
    }
  };

  const handleStopAnalysis = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
      setIsLoading(false);
    }
  };

  // 手动重试单条数据
  const handleRetrySingle = async (index: number) => {
    const result = results[index];
    if (!result) return;

    // 设置重试状态
    setResults(prev => prev.map((r, i) => 
      i === index ? { ...r, isRetrying: true, error: undefined } : r
    ));

    try {
      const response = await fetch('/api/retry', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          text: result.originalText,
          systemPrompt: customSystemPrompt,
          userPrompt: customUserPrompt,
        }),
      });

      const data = await response.json();

      if (data.success) {
        // 更新结果
        const classified = classifyDiseases(data.diseases || []);
        setResults(prev => prev.map((r, i) => 
          i === index ? { 
            ...r, 
            diseases: data.diseases, 
            error: undefined,
            isRetrying: false,
            retryable: false,
            classifiedDiseases: classified
          } : r
        ));
      } else {
        // 重试失败
        setResults(prev => prev.map((r, i) => 
          i === index ? { 
            ...r, 
            isRetrying: false, 
            error: `重试失败: ${data.error}`
          } : r
        ));
      }
    } catch (err) {
      setResults(prev => prev.map((r, i) => 
        i === index ? { 
          ...r, 
          isRetrying: false, 
          error: `重试失败: ${(err as Error).message}`
        } : r
      ));
    }
  };

  // 重试所有数据（包括成功和失败的）
  const handleRetryAll = async (onlyFailures: boolean = true) => {
    let indicesToRetry: number[];
    
    if (onlyFailures) {
      indicesToRetry = results
        .map((r, i) => ({ ...r, index: i }))
        .filter(r => r.retryable && !r.isRetrying)
        .map(r => r.index);
    } else {
      indicesToRetry = results
        .map((r, i) => i)
        .filter(i => !results[i].isRetrying);
    }

    if (indicesToRetry.length === 0) {
      return;
    }

    // 逐个重试
    for (const index of indicesToRetry) {
      await handleRetrySingle(index);
      // 短暂延迟，避免请求过快
      await new Promise(resolve => setTimeout(resolve, 500));
    }
  };

  const handleAnalyze = async (resumeFromIndex: number = 0) => {
    if (!file || !selectedColumn) {
      setError('请先上传文件并选择要分析的列');
      return;
    }

    setIsLoading(true);
    setError('');
    setShowCompletionBanner(false); // 隐藏完成提示
    
    if (resumeFromIndex === 0) {
      setResults([]);
      setFileId('');
      setAutoSaveCount(0);
      setElapsed(0);
      setElapsedFormatted('');
    }
    
    setProgress({ processed: resumeFromIndex, total: 0, percentage: 0 });
    
    // 创建新的 AbortController
    abortControllerRef.current = new AbortController();

    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('column', selectedColumn);
      formData.append('systemPrompt', customSystemPrompt);
      formData.append('fileId', fileId || Date.now().toString());
      
      // 从 localStorage 读取 API Key 和配置
      const apiKey = localStorage.getItem('coze_api_key') || '';
      formData.append('apiKey', apiKey);
      
      // 从 localStorage 读取完整配置
      let config: any = {};
      try {
        const savedConfig = localStorage.getItem('coze_settings');
        if (savedConfig) {
          config = JSON.parse(savedConfig);
        }
      } catch (error) {
        console.error('读取配置失败:', error);
      }
      
      // 如果 localStorage 中没有 API Key 但有配置中的 API Key，使用配置中的
      if (!apiKey && config.apiKey) {
        formData.append('apiKey', config.apiKey);
      }
      
      // 传递配置给后端
      formData.append('config', JSON.stringify(config));
      
      if (resumeFromIndex > 0) {
        formData.append('resumeFrom', resumeFromIndex.toString());
      }
      if (customUserPrompt.trim()) {
        formData.append('userPrompt', customUserPrompt);
      }

      const response = await fetch('/api/analyze', {
        method: 'POST',
        body: formData,
        signal: abortControllerRef.current.signal,
      });

      if (!response.ok) {
        throw new Error('分析请求失败');
      }

      const reader = response.body?.getReader();
      if (!reader) {
        throw new Error('无法读取响应流');
      }

      const decoder = new TextDecoder();
      let buffer = '';

      // 清除之前的超时警告
      if (timeoutWarningRef.current) {
        clearTimeout(timeoutWarningRef.current);
        timeoutWarningRef.current = null;
      }

      // 设置超时检测（60秒无数据则警告）
      timeoutWarningRef.current = setTimeout(() => {
        if (isLoading) {
          console.warn('60秒内未收到数据，可能连接已断开');
          setError('连接似乎已断开，请检查网络或重试');
        }
      }, 60000);

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        // 更新最后接收数据时间
        lastDataTimeRef.current = Date.now();

        // 重置超时检测
        if (timeoutWarningRef.current) {
          clearTimeout(timeoutWarningRef.current);
        }
        timeoutWarningRef.current = setTimeout(() => {
          if (isLoading) {
            console.warn('60秒内未收到数据，可能连接已断开');
            setError('连接似乎已断开，请检查网络或重试');
          }
        }, 60000);

        buffer += decoder.decode(value, { stream: true });
        
        // 处理 SSE 数据
        const lines = buffer.split('\n\n');
        buffer = lines.pop() || ''; // 保留不完整的部分

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.slice(6));
              
              switch (data.type) {
                case 'start':
                  setFileId(data.fileId || '');
                  setAutoSaveCount(0);
                  setHasInterruptedData(false);
                  setSavedMessage('');
                  setLogs([]);
                  setShowCompletionBanner(false); // 隐藏完成提示
                  console.log('开始分析');
                  break;
                case 'resume':
                  setHasInterruptedData(false);
                  setSavedMessage(`已恢复: ${data.count} 条`);
                  console.log('从断点恢复', data);
                  break;
                case 'total':
                  setProgress({ processed: 0, total: data.count, percentage: 0 });
                  break;
                case 'progress':
                  setProgress({
                    processed: data.processed,
                    total: data.total,
                    percentage: data.percentage
                  });
                  if (data.elapsed !== undefined) {
                    setElapsed(data.elapsed);
                  }
                  if (data.elapsedFormatted) {
                    setElapsedFormatted(data.elapsedFormatted);
                  }
                  break;
                case 'heartbeat':
                  // 心跳保活，更新最后接收时间
                  console.log('收到心跳，最后更新时间:', new Date(data.timestamp).toLocaleTimeString());
                  break;
                case 'log':
                  // 实时接收日志
                  setLogs(prev => [...prev, {
                    timestamp: data.timestamp || Date.now(),
                    level: data.level || 'INFO',
                    message: data.message,
                    details: data.details
                  }]);
                  break;
                case 'saved':
                  setAutoSaveCount(data.count);
                  setSavedMessage(`已自动保存: ${data.count} 条数据`);
                  // 3秒后清除消息
                  setTimeout(() => setSavedMessage(''), 3000);
                  break;
                case 'result':
                  setResults(prev => {
                    const classified = classifyDiseases(data.diseases || []);
                    return [...prev, {
                      originalText: data.originalText,
                      diseases: data.diseases,
                      error: data.error,
                      errorType: data.errorType,
                      errorDetails: data.errorDetails,
                      retryable: data.retryable,
                      processingTime: data.processingTime,
                      processingTimeFormatted: data.processingTimeFormatted,
                      classifiedDiseases: classified
                    }];
                  });
                  break;
                case 'complete':
                  setAutoSaveCount(data.processed);
                  setSavedMessage(`完成! 共处理 ${data.processed} 条数据`);
                  if (data.elapsed !== undefined) {
                    setElapsed(data.elapsed);
                  }
                  if (data.elapsedFormatted) {
                    setElapsedFormatted(data.elapsedFormatted);
                  }
                  setHasInterruptedData(false);
                  setShowCompletionBanner(true); // 显示完成提示
                  console.log('分析完成', data);
                  // 延迟保存历史记录，等待状态更新
                  setTimeout(() => saveHistory('completed'), 500);
                  break;
                case 'error':
                  setError(data.message);
                  break;
              }
            } catch (e) {
              console.error('解析SSE数据失败:', e);
            }
          }
        }
      }
    } catch (err) {
      if ((err as Error).name === 'AbortError') {
        console.log('用户取消了分析');
        if (results.length > 0) {
          setHasInterruptedData(true);
          setSavedMessage(`已保存: ${results.length} 条数据（用户中断）`);
          // 保存历史记录
          saveHistory('interrupted');
        }
      } else {
        setError('分析过程中发生错误: ' + (err as Error).message);
        console.error(err);
        if (results.length > 0) {
          setHasInterruptedData(true);
          setSavedMessage(`已保存: ${results.length} 条数据（网络错误）`);
          // 保存历史记录
          saveHistory('error');
        }
      }
    } finally {
      setIsLoading(false);
      abortControllerRef.current = null;
      
      // 清除超时警告
      if (timeoutWarningRef.current) {
        clearTimeout(timeoutWarningRef.current);
        timeoutWarningRef.current = null;
      }
    }
  };

  const handleDownloadCSV = () => {
    if (results.length === 0) return;

    // CSV 表头：序号、原始文本、每个器官、其他、状态
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
    const blob = new Blob(['\ufeff' + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `病种识别结果_${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  // 下载日志文件
  const handleDownloadLogs = async () => {
    if (!fileId) return;
    
    try {
      const response = await fetch(`/api/logs?fileId=${fileId}`);
      if (!response.ok) {
        throw new Error('获取日志文件失败');
      }
      
      const logContent = await response.text();
      const blob = new Blob([logContent], { type: 'text/plain;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `analysis-logs-${fileId}.txt`;
      link.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error('下载日志失败:', error);
      alert('下载日志失败，请稍后重试');
    }
  };

  // 计算失败数量
  const failedCount = results.filter(r => r.retryable).length;
  const hasFailures = failedCount > 0;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-950 dark:to-slate-900 p-8">
      <div className="max-w-7xl mx-auto space-y-8">
        {/* 标题 */}
        <div className="flex items-center justify-between">
          <div className="text-center space-y-2 flex-1">
            <h1 className="text-4xl font-bold text-slate-900 dark:text-slate-50">
              Excel 病种识别系统
            </h1>
            <p className="text-slate-600 dark:text-slate-400">
              上传 Excel 文件，使用自定义提示词实时流式提取文本中的病种名称
            </p>
          </div>
          <div className="flex gap-2">
            <Button
              onClick={() => router.push('/settings')}
              variant="outline"
            >
              <Settings className="w-4 h-4 mr-2" />
              系统设置
            </Button>
            <Button
              onClick={() => router.push('/history')}
              variant="outline"
            >
              <History className="w-4 h-4 mr-2" />
              历史记录
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* 左侧：文件上传和设置 */}
          <div className="lg:col-span-1 space-y-6">
            {/* 上传区域 */}
            <Card className="p-6">
              <h2 className="text-lg font-semibold mb-4 flex items-center">
                <Upload className="w-5 h-5 mr-2" />
                文件上传
              </h2>
              <div className="space-y-4">
                <div className="flex flex-col items-center justify-center border-2 border-dashed border-slate-300 dark:border-slate-700 rounded-lg p-8 hover:border-slate-400 dark:hover:border-slate-600 transition-colors cursor-pointer">
                  <input
                    type="file"
                    accept=".xlsx,.xls"
                    onChange={handleFileChange}
                    disabled={isLoading}
                    className="hidden"
                    id="file-upload"
                  />
                  <label htmlFor="file-upload" className="flex flex-col items-center cursor-pointer w-full">
                    <Upload className="w-8 h-8 text-slate-400 mb-2" />
                    <span className="text-sm text-slate-600 dark:text-slate-400">
                      点击上传 Excel 文件
                    </span>
                    {file && (
                      <div className="flex items-center space-x-2 mt-2 text-sm text-slate-700 dark:text-slate-300">
                        <FileText className="w-4 h-4" />
                        <span className="text-xs">{file.name}</span>
                      </div>
                    )}
                  </label>
                </div>

                {file && (
                  <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                      选择要分析的列
                    </label>
                    <Select value={selectedColumn} onValueChange={setSelectedColumn} disabled={isLoading}>
                      <SelectTrigger>
                        <SelectValue placeholder="请选择列" />
                      </SelectTrigger>
                      <SelectContent>
                        {excelHeaders.length > 0 ? (
                          excelHeaders.map((header, index) => (
                            <SelectItem key={index} value={header}>
                              {header || `列 ${index + 1}`}
                            </SelectItem>
                          ))
                        ) : (
                          <SelectItem value="loading">加载中...</SelectItem>
                        )}
                      </SelectContent>
                    </Select>
                  </div>
                )}
              </div>
            </Card>

            {/* 提示词设置 */}
            <Card className="p-6">
              <h2 className="text-lg font-semibold mb-4 flex items-center">
                <Lightbulb className="w-5 h-5 mr-2" />
                提示词设置
              </h2>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                    预设模板
                  </label>
                  <Select value={selectedTemplate} onValueChange={handleTemplateChange} disabled={isLoading}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(PROMPT_TEMPLATES).map(([key, template]) => (
                        <SelectItem key={key} value={key}>
                          {template.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <Tabs defaultValue="system" className="w-full">
                  <TabsList className="grid w-full grid-cols-2">
                    <TabsTrigger value="system" className="text-xs">系统提示词</TabsTrigger>
                    <TabsTrigger value="user" className="text-xs">用户提示词</TabsTrigger>
                  </TabsList>
                  <TabsContent value="system" className="mt-4">
                    <Textarea
                      value={customSystemPrompt}
                      onChange={(e) => setCustomSystemPrompt(e.target.value)}
                      placeholder="输入系统提示词..."
                      disabled={isLoading}
                      className="min-h-[200px] text-xs font-mono"
                    />
                  </TabsContent>
                  <TabsContent value="user" className="mt-4">
                    <Textarea
                      value={customUserPrompt}
                      onChange={(e) => setCustomUserPrompt(e.target.value)}
                      placeholder="输入自定义用户提示词（可选）...&#10;示例：请特别关注慢性疾病"
                      disabled={isLoading}
                      className="min-h-[100px] text-xs font-mono"
                    />
                    <p className="text-xs text-slate-500 mt-2">
                      这里的内容会追加到每条文本的分析请求中。留空则不影响识别。
                    </p>
                  </TabsContent>
                </Tabs>

                <div className="flex space-x-2">
                  {isLoading ? (
                    <Button onClick={handleStopAnalysis} variant="destructive" className="flex-1">
                      <XCircle className="w-4 h-4 mr-2" />
                      停止分析
                    </Button>
                  ) : (
                    <Button
                      onClick={() => handleAnalyze()}
                      disabled={!file || !selectedColumn}
                      className="flex-1"
                    >
                      <RefreshCw className="w-4 h-4 mr-2" />
                      开始分析
                    </Button>
                  )}
                </div>
              </div>
            </Card>
          </div>

          {/* 右侧：结果展示 */}
          <div className="lg:col-span-2 space-y-6">
            {/* 进度显示 */}
            {isLoading && progress.total > 0 && (
              <Card className="p-6">
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="font-semibold text-sm">分析进度</h3>
                    <span className="text-sm text-slate-600 dark:text-slate-400">
                      {progress.processed} / {progress.total} ({progress.percentage}%)
                    </span>
                  </div>
                  <div className="w-full bg-slate-200 dark:bg-slate-700 rounded-full h-2">
                    <div 
                      className="bg-blue-600 dark:bg-blue-500 h-2 rounded-full transition-all duration-300"
                      style={{ width: `${progress.percentage}%` }}
                    />
                  </div>
                  <div className="flex items-center justify-between text-xs text-slate-500">
                    <div className="flex items-center space-x-4">
                      <span>正在分析中，识别结果会实时显示在下方表格中...</span>
                      {elapsedFormatted && (
                        <span className="flex items-center text-blue-600 dark:text-blue-400 font-medium">
                          <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                          运行时长: {elapsedFormatted}
                        </span>
                      )}
                    </div>
                    {autoSaveCount > 0 && (
                      <span className="text-green-600 dark:text-green-400 flex items-center">
                        <FileText className="w-3 h-3 mr-1" />
                        已保存 {autoSaveCount} 条
                      </span>
                    )}
                  </div>
                  {savedMessage && (
                    <div className="p-2 bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-900 rounded text-xs text-green-800 dark:text-green-300 flex items-center">
                      <FileText className="w-3 h-3 mr-2" />
                      {savedMessage}
                    </div>
                  )}
                </div>
              </Card>
            )}

            {/* 实时日志显示 */}
            {logs.length > 0 && (
              <Card className="p-6">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-50 flex items-center">
                    <FileText className="w-5 h-5 mr-2" />
                    执行日志
                  </h2>
                  <Button
                    onClick={() => setShowLogs(!showLogs)}
                    variant="outline"
                    size="sm"
                  >
                    {showLogs ? '隐藏' : '显示'} ({logs.length})
                  </Button>
                </div>
                {showLogs && (
                  <div className="bg-slate-950 dark:bg-slate-900 p-4 rounded-lg overflow-auto max-h-[300px]">
                    <pre className="text-xs font-mono space-y-1">
                      {logs.map((log, index) => (
                        <div key={index}>
                          <span className="text-slate-400">
                            [{new Date(log.timestamp).toLocaleTimeString()}]
                          </span>
                          {' '}
                          <span className={`${
                            log.level === 'ERROR' ? 'text-red-400' :
                            log.level === 'WARN' ? 'text-yellow-400' :
                            log.level === 'DEBUG' ? 'text-blue-400' :
                            'text-green-400'
                          }`}>
                            [{log.level}]
                          </span>
                          {' '}
                          <span className="text-white">{log.message}</span>
                          {log.details && (
                            <div className="ml-4 text-slate-500 text-xs mt-1">
                              {typeof log.details === 'string' ? log.details : JSON.stringify(log.details, null, 2)}
                            </div>
                          )}
                        </div>
                      ))}
                    </pre>
                  </div>
                )}
              </Card>
            )}

            {/* 中断数据恢复提示 */}
            {hasInterruptedData && !isLoading && (
              <Card className="p-4 border-orange-200 dark:border-orange-900 bg-orange-50 dark:bg-orange-950/30">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <XCircle className="w-5 h-5 text-orange-600 dark:text-orange-400" />
                    <div>
                      <p className="text-sm font-medium text-orange-900 dark:text-orange-100">
                        检测到中断的数据
                      </p>
                      <p className="text-xs text-orange-700 dark:text-orange-300">
                        已处理 {results.length} 条数据，您可以继续从断点开始处理
                      </p>
                    </div>
                  </div>
                  <div className="flex space-x-2">
                    <Button
                      onClick={() => handleAnalyze(results.length)}
                      size="sm"
                      variant="outline"
                      className="border-orange-300 dark:border-orange-700 text-orange-700 dark:text-orange-300 hover:bg-orange-100 dark:hover:bg-orange-900"
                    >
                      <RefreshCw className="w-4 h-4 mr-2" />
                      继续处理
                    </Button>
                    <Button
                      onClick={() => {
                        setHasInterruptedData(false);
                        setResults([]);
                        setFileId('');
                        setSavedMessage('');
                      }}
                      size="sm"
                      variant="outline"
                      className="border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-900"
                    >
                      丢弃已处理数据
                    </Button>
                  </div>
                </div>
              </Card>
            )}

            {/* 分析完成提示 - 只在分析完成后显示，不会消失 */}
            {showCompletionBanner && (
              <Card className="p-6 border-green-200 dark:border-green-900 bg-green-50 dark:bg-green-950/30">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-4">
                    <div className="p-3 bg-green-100 dark:bg-green-900/50 rounded-full">
                      <CheckCircle className="w-6 h-6 text-green-600 dark:text-green-400" />
                    </div>
                    <div>
                      <p className="text-lg font-semibold text-green-900 dark:text-green-100">
                        分析完成！
                      </p>
                      <p className="text-sm text-green-700 dark:text-green-300">
                        成功处理 {results.filter(r => !r.error).length} 条数据，
                        识别到 {results.reduce((sum, r) => sum + (r.diseases?.length || 0), 0)} 个病种
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center space-x-3">
                    <Button
                      onClick={handleDownloadCSV}
                      size="lg"
                      className="bg-green-600 hover:bg-green-700 text-white"
                    >
                      <Download className="w-5 h-5 mr-2" />
                      下载分析结果 (CSV)
                    </Button>
                    <Button
                      onClick={() => setShowCompletionBanner(false)}
                      variant="ghost"
                      size="lg"
                      className="text-green-700 dark:text-green-300 hover:bg-green-100 dark:hover:bg-green-900"
                    >
                      关闭
                    </Button>
                  </div>
                </div>
              </Card>
            )}

            {/* 批量操作提示 */}
            {results.length > 0 && !isLoading && (
              <Card className="p-4 border-blue-200 dark:border-blue-900 bg-blue-50 dark:bg-blue-950/30">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <RefreshCw className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                    <div>
                      <p className="text-sm font-medium text-blue-900 dark:text-blue-100">
                        批量操作
                      </p>
                      <p className="text-xs text-blue-700 dark:text-blue-300">
                        已完成 {results.length} 条分析，您可以重新分析部分或全部数据
                      </p>
                    </div>
                  </div>
                  <div className="flex space-x-2">
                    {hasFailures && (
                      <Button
                        onClick={() => handleRetryAll(true)}
                        size="sm"
                        variant="outline"
                        className="border-orange-300 dark:border-orange-700 text-orange-700 dark:text-orange-300 hover:bg-orange-100 dark:hover:bg-orange-900"
                      >
                        <RotateCcw className="w-4 h-4 mr-2" />
                        重试失败项 ({failedCount})
                      </Button>
                    )}
                    <Button
                      onClick={() => handleRetryAll(false)}
                      size="sm"
                      variant="outline"
                      className="border-blue-300 dark:border-blue-700 text-blue-700 dark:text-blue-300 hover:bg-blue-100 dark:hover:bg-blue-900"
                    >
                      <RefreshCw className="w-4 h-4 mr-2" />
                      重新分析全部 ({results.length})
                    </Button>
                  </div>
                </div>
              </Card>
            )}

            {/* 统计分析模块 */}
            {results.length > 0 && (
              <Card className="p-6">
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-50 flex items-center">
                      <RefreshCw className="w-5 h-5 mr-2" />
                      统计分析
                    </h2>
                    <span className="text-sm text-slate-600 dark:text-slate-400">
                      共 {results.length} 条数据
                    </span>
                  </div>

                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    {/* 总用时 */}
                    <div className="bg-slate-50 dark:bg-slate-900 p-4 rounded-lg">
                      <div className="text-xs text-slate-600 dark:text-slate-400 mb-1">总用时</div>
                      <div className="text-2xl font-bold text-blue-600 dark:text-blue-400">
                        {elapsedFormatted || '-'}
                      </div>
                      <div className="text-xs text-slate-500 dark:text-slate-500 mt-1">
                        {elapsed > 0 && `${Math.round(elapsed / 1000)} 秒`}
                      </div>
                    </div>

                    {/* 成功数量 */}
                    <div className="bg-slate-50 dark:bg-slate-900 p-4 rounded-lg">
                      <div className="text-xs text-slate-600 dark:text-slate-400 mb-1">成功数量</div>
                      <div className="text-2xl font-bold text-green-600 dark:text-green-400">
                        {results.filter(r => !r.error).length}
                      </div>
                      <div className="text-xs text-slate-500 dark:text-slate-500 mt-1">
                        成功率 {((results.filter(r => !r.error).length / results.length) * 100).toFixed(1)}%
                      </div>
                    </div>

                    {/* 失败数量 */}
                    <div className="bg-slate-50 dark:bg-slate-900 p-4 rounded-lg">
                      <div className="text-xs text-slate-600 dark:text-slate-400 mb-1">失败数量</div>
                      <div className="text-2xl font-bold text-red-600 dark:text-red-400">
                        {results.filter(r => r.error).length}
                      </div>
                      <div className="text-xs text-slate-500 dark:text-slate-500 mt-1">
                        失败率 {((results.filter(r => r.error).length / results.length) * 100).toFixed(1)}%
                      </div>
                    </div>

                    {/* 平均用时 */}
                    <div className="bg-slate-50 dark:bg-slate-900 p-4 rounded-lg">
                      <div className="text-xs text-slate-600 dark:text-slate-400 mb-1">平均用时</div>
                      <div className="text-2xl font-bold text-purple-600 dark:text-purple-400">
                        {(() => {
                          const times = results.filter(r => r.processingTime).map(r => r.processingTime!);
                          if (times.length === 0) return '-';
                          const avg = times.reduce((a, b) => a + b, 0) / times.length;
                          return Math.round(avg / 1000);
                        })()}
                      </div>
                      <div className="text-xs text-slate-500 dark:text-slate-500 mt-1">
                        秒/条
                      </div>
                    </div>

                    {/* 最长时间 */}
                    <div className="bg-slate-50 dark:bg-slate-900 p-4 rounded-lg">
                      <div className="text-xs text-slate-600 dark:text-slate-400 mb-1">最长时间</div>
                      <div className="text-2xl font-bold text-orange-600 dark:text-orange-400">
                        {(() => {
                          const times = results.filter(r => r.processingTime).map(r => r.processingTime!);
                          if (times.length === 0) return '-';
                          const max = Math.max(...times);
                          return Math.round(max / 1000);
                        })()}
                      </div>
                      <div className="text-xs text-slate-500 dark:text-slate-500 mt-1">
                        秒
                      </div>
                    </div>

                    {/* 最短时间 */}
                    <div className="bg-slate-50 dark:bg-slate-900 p-4 rounded-lg">
                      <div className="text-xs text-slate-600 dark:text-slate-400 mb-1">最短时间</div>
                      <div className="text-2xl font-bold text-teal-600 dark:text-teal-400">
                        {(() => {
                          const times = results.filter(r => r.processingTime).map(r => r.processingTime!);
                          if (times.length === 0) return '-';
                          const min = Math.min(...times);
                          return Math.round(min / 1000);
                        })()}
                      </div>
                      <div className="text-xs text-slate-500 dark:text-slate-500 mt-1">
                        秒
                      </div>
                    </div>

                    {/* 识别到病种的数量 */}
                    <div className="bg-slate-50 dark:bg-slate-900 p-4 rounded-lg">
                      <div className="text-xs text-slate-600 dark:text-slate-400 mb-1">识别到病种</div>
                      <div className="text-2xl font-bold text-indigo-600 dark:text-indigo-400">
                        {results.filter(r => r.diseases && r.diseases.length > 0).length}
                      </div>
                      <div className="text-xs text-slate-500 dark:text-slate-500 mt-1">
                        条
                      </div>
                    </div>

                    {/* 总病种数 */}
                    <div className="bg-slate-50 dark:bg-slate-900 p-4 rounded-lg">
                      <div className="text-xs text-slate-600 dark:text-slate-400 mb-1">总病种数</div>
                      <div className="text-2xl font-bold text-pink-600 dark:text-pink-400">
                        {results.reduce((sum, r) => sum + (r.diseases?.length || 0), 0)}
                      </div>
                      <div className="text-xs text-slate-500 dark:text-slate-500 mt-1">
                        个
                      </div>
                    </div>
                  </div>
                  
                  {/* 日志下载按钮 */}
                  {fileId && (
                    <div className="mt-4 flex justify-end">
                      <Button
                        onClick={handleDownloadLogs}
                        variant="outline"
                        size="sm"
                        className="text-slate-600 dark:text-slate-400"
                      >
                        <FileText className="w-4 h-4 mr-2" />
                        下载详细日志
                      </Button>
                    </div>
                  )}
                </div>
              </Card>
            )}

            {error && (
              <div className="p-4 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900 rounded-lg text-red-800 dark:text-red-300 text-sm">
                {error}
              </div>
            )}

            {results.length > 0 && (
              <Card className="p-6">
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <h2 className="text-xl font-bold text-slate-900 dark:text-slate-50">
                      识别结果 ({results.length} 条)
                      {isLoading && <span className="text-sm font-normal text-slate-500 ml-2">（实时更新中...）</span>}
                    </h2>
                    <Button onClick={handleDownloadCSV} variant="outline" size="sm" disabled={isLoading}>
                      <Download className="w-4 h-4 mr-2" />
                      导出 CSV
                    </Button>
                  </div>

                  <div className="rounded-lg border border-slate-200 dark:border-slate-800 max-h-[600px] overflow-x-auto overflow-y-auto">
                    <Table>
                      <TableHeader className="sticky top-0 bg-white dark:bg-slate-950 z-10">
                        <TableRow>
                          <TableHead className="w-[60px] sticky left-0 bg-white dark:bg-slate-950">序号</TableHead>
                          <TableHead className="w-[200px] sticky left-[60px] bg-white dark:bg-slate-950">原始文本</TableHead>
                          {FIXED_ORGANS.map(organ => (
                            <TableHead key={organ} className="min-w-[80px] text-center">{organ}</TableHead>
                          ))}
                          <TableHead className="min-w-[150px]">其他</TableHead>
                          <TableHead className="min-w-[80px]">用时</TableHead>
                          <TableHead className="min-w-[100px] sticky right-0 bg-white dark:bg-slate-950">状态</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {results.map((result, index) => (
                          <TableRow key={index}>
                            <TableCell className="font-medium text-sm sticky left-0 bg-white dark:bg-slate-950">{index + 1}</TableCell>
                            <TableCell className="max-w-[200px] text-xs truncate sticky left-[60px] bg-white dark:bg-slate-950" title={result.originalText}>
                              {result.error && !result.isRetrying ? (
                                <span className="text-red-500">{result.originalText}</span>
                              ) : result.isRetrying ? (
                                <span className="text-orange-600">{result.originalText}</span>
                              ) : (
                                result.originalText
                              )}
                            </TableCell>
                            {FIXED_ORGANS.map(organ => {
                              const diseaseList = result.classifiedDiseases?.fixed?.[organ];
                              return (
                                <TableCell key={organ} className="text-center min-w-[100px]">
                                  {result.isRetrying ? (
                                    <Loader2 className="w-4 h-4 animate-spin text-orange-600 dark:text-orange-400 mx-auto" />
                                  ) : diseaseList && diseaseList.length > 0 ? (
                                    <div className="flex flex-col items-center gap-1">
                                      {diseaseList.map((d, i) => (
                                        <span
                                          key={i}
                                          className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-300"
                                        >
                                          {d}
                                        </span>
                                    ))}
                                  </div>
                                ) : (
                                  <span className="text-slate-300 dark:text-slate-700 text-xs">—</span>
                                )}
                              </TableCell>
                              );
                            })}
                            <TableCell>
                              {result.isRetrying ? (
                                <div className="flex items-center space-x-2 text-orange-600 dark:text-orange-400">
                                  <Loader2 className="w-4 h-4 animate-spin" />
                                  <span className="text-xs">分析中...</span>
                                </div>
                              ) : result.error ? (
                                <span className="text-red-500 text-xs">{result.error}</span>
                              ) : result.classifiedDiseases?.others && result.classifiedDiseases.others.length > 0 ? (
                                <div className="flex flex-wrap gap-1">
                                  {result.classifiedDiseases.others.map((disease, i) => (
                                    <span
                                      key={i}
                                      className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-300"
                                    >
                                      {disease}
                                    </span>
                                  ))}
                                </div>
                              ) : (
                                <span className="text-slate-400 dark:text-slate-600 text-xs">无</span>
                              )}
                            </TableCell>
                            <TableCell className="text-center min-w-[80px]">
                              {result.processingTimeFormatted ? (
                                <span className="text-xs text-slate-600 dark:text-slate-400 font-medium">
                                  {result.processingTimeFormatted}
                                </span>
                              ) : (
                                <span className="text-xs text-slate-400 dark:text-slate-600">-</span>
                              )}
                            </TableCell>
                            <TableCell className="sticky right-0 bg-white dark:bg-slate-950 text-center">
                              {result.error && result.errorDetails ? (
                                <div className="space-y-1">
                                  <div className="text-xs text-red-600 dark:text-red-400" title={result.error}>
                                    {result.errorType || 'ERROR'}
                                  </div>
                                  {result.errorDetails && (
                                    <div className="text-xs text-slate-500 dark:text-slate-500" title={result.errorDetails.errorMessage}>
                                      {result.errorDetails.errorMessage.length > 20 
                                        ? result.errorDetails.errorMessage.substring(0, 20) + '...' 
                                        : result.errorDetails.errorMessage}
                                    </div>
                                  )}
                                </div>
                              ) : (
                                <Button
                                  onClick={() => handleRetrySingle(index)}
                                  size="sm"
                                  variant="ghost"
                                  disabled={result.isRetrying}
                                  className="text-slate-600 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-300"
                                  title="重新分析"
                                >
                                  {result.isRetrying ? (
                                    <Loader2 className="w-4 h-4 animate-spin" />
                                  ) : (
                                    <RotateCcw className="w-4 h-4" />
                                  )}
                                </Button>
                              )}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </div>
              </Card>
            )}

            {/* 空状态提示 */}
            {!results.length && !isLoading && (
              <Card className="p-12">
                <div className="text-center space-y-4">
                  <div className="w-16 h-16 mx-auto bg-slate-100 dark:bg-slate-800 rounded-full flex items-center justify-center">
                    <FileText className="w-8 h-8 text-slate-400" />
                  </div>
                  <div>
                    <h3 className="text-lg font-medium text-slate-900 dark:text-slate-50">
                      等待分析
                    </h3>
                    <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
                      上传文件并选择列后，点击"开始分析"开始处理
                    </p>
                  </div>
                </div>
              </Card>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
