'use client';

import { useState, useEffect, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { AlertCircle, CheckCircle, Save, RotateCcw, Zap, Database, Cpu, Network, Info } from 'lucide-react';
import { useRouter } from 'next/navigation';

// 配置接口
interface SettingsConfig {
  apiKey: string;
  model: string; // 格式：providerId/modelId
  // 性能配置
  concurrentBatchSize: number;
  llmCallTimeout: number;
  maxRetries: number;
  retryDelay: number;
  // 数据处理配置
  saveInterval: number;
  heartbeatBatchInterval: number;
}

// 默认配置
const DEFAULT_CONFIG: SettingsConfig = {
  apiKey: '',
  model: 'coze/deepseek-v3-2-251201',
  concurrentBatchSize: 10,
  llmCallTimeout: 30,
  maxRetries: 5,
  retryDelay: 2,
  saveInterval: 100,
  heartbeatBatchInterval: 5,
};

// 模型提供商列表
const MODEL_PROVIDERS = [
  {
    id: 'coze',
    name: 'Coze',
    description: 'Coze 平台集成模型，使用 Coze API Key',
    models: [
      { id: 'deepseek-v3-2-251201', name: 'DeepSeek V3', description: '高性能大模型，适合复杂任务' },
      { id: 'doubao-seed-1-8-251228', name: '豆包 Seed 1.8', description: '轻量级模型，响应速度快' },
    ],
  },
  {
    id: 'deepseek',
    name: 'DeepSeek',
    description: 'DeepSeek 官方 API，使用 sk- 开头的 API Key',
    models: [
      { id: 'deepseek-chat', name: 'DeepSeek Chat', description: '通用对话模型' },
      { id: 'deepseek-reasoner', name: 'DeepSeek Reasoner', description: '推理模型，适合复杂逻辑' },
    ],
  },
  {
    id: 'qwen',
    name: '通义千问',
    description: '阿里云通义千问，使用 DashScope API Key',
    models: [
      { id: 'qwen-turbo', name: 'Qwen Turbo', description: '高速响应模型' },
      { id: 'qwen-plus', name: 'Qwen Plus', description: '均衡性能模型' },
      { id: 'qwen-max', name: 'Qwen Max', description: '旗舰模型' },
    ],
  },
  {
    id: 'gemini',
    name: 'Gemini',
    description: 'Google Gemini，使用 Google AI Studio API Key',
    models: [
      { id: 'gemini-1.5-pro', name: 'Gemini 1.5 Pro', description: '高性能模型' },
      { id: 'gemini-1.5-flash', name: 'Gemini 1.5 Flash', description: '高速模型' },
    ],
  },
  {
    id: 'openai',
    name: 'OpenAI',
    description: 'OpenAI 官方 API，使用 OpenAI API Key',
    models: [
      { id: 'gpt-4o', name: 'GPT-4o', description: '最新旗舰模型' },
      { id: 'gpt-4-turbo', name: 'GPT-4 Turbo', description: '高性能模型' },
      { id: 'gpt-3.5-turbo', name: 'GPT-3.5 Turbo', description: '高性价比模型' },
    ],
  },
];

export default function SettingsPage() {
  const router = useRouter();
  const [config, setConfig] = useState<SettingsConfig>(DEFAULT_CONFIG);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isValidating, setIsValidating] = useState(false);
  const [validationResult, setValidationResult] = useState<{ success: boolean; message: string } | null>(null);
  const [saveMessage, setSaveMessage] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [selectedProvider, setSelectedProvider] = useState<string>('coze');

  // 获取当前选择的提供商
  const currentProvider = useMemo(
    () => MODEL_PROVIDERS.find(p => p.id === selectedProvider),
    [selectedProvider]
  );

  // 从模型 ID 解析提供商
  useEffect(() => {
    const providerId = config.model.split('/')[0];
    if (providerId && MODEL_PROVIDERS.find(p => p.id === providerId)) {
      setSelectedProvider(providerId);
    }
  }, [config.model]);

  // 加载配置
  useEffect(() => {
    try {
      // 首先尝试从新配置中加载
      const savedConfig = localStorage.getItem('coze_settings');
      if (savedConfig) {
        setConfig({ ...DEFAULT_CONFIG, ...JSON.parse(savedConfig) });
      } else {
        // 如果没有新配置，尝试从旧的地方加载 API Key
        const oldApiKey = localStorage.getItem('coze_api_key');
        if (oldApiKey) {
          setConfig({ ...DEFAULT_CONFIG, apiKey: oldApiKey });
        }
      }
    } catch (error) {
      console.error('加载配置失败:', error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // 保存配置
  const handleSave = async () => {
    setIsSaving(true);
    try {
      // 保存完整配置到 coze_settings
      localStorage.setItem('coze_settings', JSON.stringify(config));
      
      // 为了兼容旧版本，也将 API Key 保存到 coze_api_key
      if (config.apiKey) {
        localStorage.setItem('coze_api_key', config.apiKey);
      } else {
        localStorage.removeItem('coze_api_key');
      }
      
      setSaveMessage({ type: 'success', message: '配置已保存' });
      setTimeout(() => setSaveMessage(null), 3000);
    } catch (error) {
      setSaveMessage({ type: 'error', message: '保存配置失败' });
      console.error('保存配置失败:', error);
    } finally {
      setIsSaving(false);
    }
  };

  // 重置配置
  const handleReset = () => {
    if (confirm('确定要重置所有配置为默认值吗？')) {
      setConfig(DEFAULT_CONFIG);
      localStorage.removeItem('coze_settings');
      localStorage.removeItem('coze_api_key');
      setSaveMessage({ type: 'success', message: '配置已重置' });
      setTimeout(() => setSaveMessage(null), 3000);
    }
  };

  // 验证 API Key
  const handleValidate = async () => {
    if (!config.apiKey.trim()) {
      setValidationResult({ success: false, message: '请输入 API Key' });
      return;
    }

    setIsValidating(true);
    setValidationResult(null);

    try {
      const response = await fetch('/api/validate-key', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ apiKey: config.apiKey, modelId: config.model })
      });
      const data = await response.json();

      setValidationResult({
        success: data.success,
        message: data.message || (data.success ? '验证成功' : '验证失败')
      });
    } catch (error) {
      setValidationResult({
        success: false,
        message: '验证请求失败，请检查网络连接'
      });
    } finally {
      setIsValidating(false);
    }
  };

  // 提供商变更处理
  const handleProviderChange = (providerId: string) => {
    setSelectedProvider(providerId);
    const provider = MODEL_PROVIDERS.find(p => p.id === providerId);
    if (provider && provider.models.length > 0) {
      // 切换提供商时，自动选择第一个模型
      setConfig(prev => ({ ...prev, model: `${providerId}/${provider.models[0].id}` }));
    }
  };

  // 配置变更处理
  const handleConfigChange = (key: keyof SettingsConfig, value: any) => {
    setConfig(prev => ({ ...prev, [key]: value }));
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-muted-foreground">加载配置中...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-950 dark:to-slate-900">
      <div className="container mx-auto py-8 px-4 max-w-5xl">
        {/* 头部 */}
        <div className="mb-8 flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold mb-2">系统设置</h1>
            <p className="text-muted-foreground">配置系统参数、API Key 和性能选项</p>
          </div>
          <div className="flex gap-2">
            <Button onClick={handleReset} variant="outline" disabled={isSaving}>
              <RotateCcw className="w-4 h-4 mr-2" />
              重置
            </Button>
            <Button onClick={handleSave} disabled={isSaving}>
              <Save className="w-4 h-4 mr-2" />
              {isSaving ? '保存中...' : '保存配置'}
            </Button>
            <Button onClick={() => router.push('/')} variant="outline">
              返回首页
            </Button>
          </div>
        </div>

        {/* 保存提示 */}
        {saveMessage && (
          <div className={`mb-6 p-4 rounded-lg flex items-center ${
            saveMessage.type === 'success'
              ? 'bg-green-50 text-green-800 dark:bg-green-900/20 dark:text-green-300'
              : 'bg-red-50 text-red-800 dark:bg-red-900/20 dark:text-red-300'
          }`}>
            {saveMessage.type === 'success' ? (
              <CheckCircle className="w-5 h-5 mr-2" />
            ) : (
              <AlertCircle className="w-5 h-5 mr-2" />
            )}
            {saveMessage.message}
          </div>
        )}

        {/* 设置选项卡 */}
        <Tabs defaultValue="api" className="space-y-6">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="api">
              <Network className="w-4 h-4 mr-2" />
              API 配置
            </TabsTrigger>
            <TabsTrigger value="performance">
              <Cpu className="w-4 h-4 mr-2" />
              性能配置
            </TabsTrigger>
            <TabsTrigger value="data">
              <Database className="w-4 h-4 mr-2" />
              数据处理
            </TabsTrigger>
            <TabsTrigger value="advanced">
              <Zap className="w-4 h-4 mr-2" />
              高级选项
            </TabsTrigger>
          </TabsList>

          {/* API 配置 */}
          <TabsContent value="api">
            <Card>
              <CardHeader>
                <CardTitle>API Key 配置</CardTitle>
                <CardDescription>
                  配置 LLM API Key 以启用病种识别功能
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="apiKey">API Key</Label>
                  <Input
                    id="apiKey"
                    type="password"
                    placeholder="输入您的 API Key"
                    value={config.apiKey}
                    onChange={(e) => handleConfigChange('apiKey', e.target.value)}
                    className="font-mono"
                  />
                  <p className="text-sm text-muted-foreground">
                    支持 JWT 格式（如 Coze）或 sk- 开头的格式（如 DeepSeek）
                  </p>
                </div>

                <div className="flex gap-2">
                  <Button
                    onClick={handleValidate}
                    disabled={isValidating || !config.apiKey.trim()}
                  >
                    {isValidating ? (
                      <>
                        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                        验证中...
                      </>
                    ) : (
                      '验证 API Key'
                    )}
                  </Button>
                </div>

                {validationResult && (
                  <div className={`p-4 rounded-lg ${
                    validationResult.success
                      ? 'bg-green-50 text-green-800 dark:bg-green-900/20 dark:text-green-300'
                      : 'bg-red-50 text-red-800 dark:bg-red-900/20 dark:text-red-300'
                  }`}>
                    <div className="flex items-start">
                      {validationResult.success ? (
                        <CheckCircle className="w-5 h-5 mr-2 flex-shrink-0" />
                      ) : (
                        <AlertCircle className="w-5 h-5 mr-2 flex-shrink-0" />
                      )}
                      <p className="text-sm">{validationResult.message}</p>
                    </div>
                  </div>
                )}

                <div className="space-y-4 pt-4 border-t">
                  <h3 className="text-lg font-semibold">模型配置</h3>
                  
                  <div className="space-y-2">
                    <Label htmlFor="provider">模型提供商</Label>
                    <Select
                      value={selectedProvider}
                      onValueChange={handleProviderChange}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {MODEL_PROVIDERS.map(provider => (
                          <SelectItem key={provider.id} value={provider.id}>
                            <div>
                              <div className="font-medium">{provider.name}</div>
                              <div className="text-xs text-muted-foreground">{provider.description}</div>
                            </div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {currentProvider && (
                    <div className="space-y-2">
                      <Label htmlFor="model">选择模型</Label>
                      <Select
                        value={config.model}
                        onValueChange={(value) => handleConfigChange('model', value)}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {currentProvider.models.map(model => (
                            <SelectItem key={`${currentProvider.id}/${model.id}`} value={`${currentProvider.id}/${model.id}`}>
                              <div>
                                <div className="font-medium">{model.name}</div>
                                <div className="text-xs text-muted-foreground">{model.description}</div>
                              </div>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}

                  {currentProvider && (
                    <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
                      <div className="flex items-start">
                        <Info className="w-5 h-5 mr-2 text-blue-600 dark:text-blue-400 flex-shrink-0 mt-0.5" />
                        <div className="text-sm text-blue-800 dark:text-blue-300">
                          <p className="font-semibold mb-1">{currentProvider.name} API Key 说明</p>
                          <p className="mb-2">{currentProvider.description}</p>
                          <p className="text-xs">当前选择模型: {currentProvider.models.find(m => `${currentProvider.id}/${m.id}` === config.model)?.name || '未选择'}</p>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* 性能配置 */}
          <TabsContent value="performance">
            <div className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle>并发控制</CardTitle>
                  <CardDescription>
                    调整并发处理数以提高性能或降低资源占用
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <Label htmlFor="concurrentBatchSize">
                        并发批处理大小
                      </Label>
                      <span className="text-sm font-mono bg-muted px-2 py-1 rounded">
                        {config.concurrentBatchSize}
                      </span>
                    </div>
                    <Slider
                      id="concurrentBatchSize"
                      min={1}
                      max={20}
                      step={1}
                      value={[config.concurrentBatchSize]}
                      onValueChange={([value]) => handleConfigChange('concurrentBatchSize', value)}
                      className="w-full"
                    />
                    <p className="text-sm text-muted-foreground">
                      同时处理的数据条数。值越大处理越快，但消耗更多资源。
                      本地环境建议使用 10，沙箱环境可使用 20。
                    </p>
                  </div>

                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <Label htmlFor="maxRetries">
                        最大重试次数
                      </Label>
                      <span className="text-sm font-mono bg-muted px-2 py-1 rounded">
                        {config.maxRetries}
                      </span>
                    </div>
                    <Slider
                      id="maxRetries"
                      min={0}
                      max={10}
                      step={1}
                      value={[config.maxRetries]}
                      onValueChange={([value]) => handleConfigChange('maxRetries', value)}
                      className="w-full"
                    />
                    <p className="text-sm text-muted-foreground">
                      失败时的重试次数。0 表示不重试。
                    </p>
                  </div>

                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <Label htmlFor="retryDelay">
                        重试延迟（秒）
                      </Label>
                      <span className="text-sm font-mono bg-muted px-2 py-1 rounded">
                        {config.retryDelay}s
                      </span>
                    </div>
                    <Slider
                      id="retryDelay"
                      min={1}
                      max={10}
                      step={0.5}
                      value={[config.retryDelay]}
                      onValueChange={([value]) => handleConfigChange('retryDelay', value)}
                      className="w-full"
                    />
                    <p className="text-sm text-muted-foreground">
                      重试前的等待时间。
                    </p>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>超时设置</CardTitle>
                  <CardDescription>
                    配置 API 调用的超时时间
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <Label htmlFor="llmCallTimeout">
                        LLM 调用超时（秒）
                      </Label>
                      <span className="text-sm font-mono bg-muted px-2 py-1 rounded">
                        {config.llmCallTimeout}s
                      </span>
                    </div>
                    <Slider
                      id="llmCallTimeout"
                      min={5}
                      max={60}
                      step={5}
                      value={[config.llmCallTimeout]}
                      onValueChange={([value]) => handleConfigChange('llmCallTimeout', value)}
                      className="w-full"
                    />
                    <p className="text-sm text-muted-foreground">
                      单次 LLM 调用的最大等待时间。
                      本地网络环境建议使用 30 秒。
                    </p>
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* 数据处理 */}
          <TabsContent value="data">
            <div className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle>保存策略</CardTitle>
                  <CardDescription>
                    配置数据保存和备份策略
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <Label htmlFor="saveInterval">
                        保存间隔（条数）
                      </Label>
                      <span className="text-sm font-mono bg-muted px-2 py-1 rounded">
                        {config.saveInterval}
                      </span>
                    </div>
                    <Slider
                      id="saveInterval"
                      min={10}
                      max={500}
                      step={10}
                      value={[config.saveInterval]}
                      onValueChange={([value]) => handleConfigChange('saveInterval', value)}
                      className="w-full"
                    />
                    <p className="text-sm text-muted-foreground">
                      每处理多少条数据保存一次。较小的值可以减少中断时的数据丢失，但会增加 IO 开销。
                      默认 100 条。
                    </p>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>连接保活</CardTitle>
                  <CardDescription>
                    配置长连接的保活策略
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <Label htmlFor="heartbeatBatchInterval">
                        心跳间隔（批次）
                      </Label>
                      <span className="text-sm font-mono bg-muted px-2 py-1 rounded">
                        {config.heartbeatBatchInterval}
                      </span>
                    </div>
                    <Slider
                      id="heartbeatBatchInterval"
                      min={1}
                      max={20}
                      step={1}
                      value={[config.heartbeatBatchInterval]}
                      onValueChange={([value]) => handleConfigChange('heartbeatBatchInterval', value)}
                      className="w-full"
                    />
                    <p className="text-sm text-muted-foreground">
                      每处理多少个批次发送一次心跳事件，保持连接活跃。
                      默认 5 个批次（约 100 条）。
                    </p>
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* 高级选项 */}
          <TabsContent value="advanced">
            <Card>
              <CardHeader>
                <CardTitle>高级配置</CardTitle>
                <CardDescription>
                  高级用户选项，请谨慎修改
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg p-4">
                  <div className="flex items-start">
                    <AlertCircle className="w-5 h-5 mr-2 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
                    <div className="text-sm text-amber-800 dark:text-amber-300">
                      <p className="font-semibold mb-1">注意事项</p>
                      <p className="mb-2">所有配置项保存在浏览器的 localStorage 中，仅对当前浏览器有效。</p>
                      <p className="mb-2">更改配置后，下次分析任务会使用新配置。</p>
                      <p>建议先在少量数据上测试新配置，确认效果后再处理大量数据。</p>
                    </div>
                  </div>
                </div>

                <div className="space-y-4">
                  <h3 className="text-lg font-semibold">配置导出/导入</h3>
                  <div className="flex gap-2">
                    <Button
                      onClick={() => {
                        const blob = new Blob([JSON.stringify(config, null, 2)], { type: 'application/json' });
                        const url = URL.createObjectURL(blob);
                        const link = document.createElement('a');
                        link.href = url;
                        link.download = 'coze-settings.json';
                        link.click();
                      }}
                      variant="outline"
                    >
                      导出配置
                    </Button>
                    <Button
                      onClick={() => {
                        const input = document.createElement('input');
                        input.type = 'file';
                        input.accept = 'application/json';
                        input.onchange = async (e) => {
                          const file = (e.target as HTMLInputElement).files?.[0];
                          if (file) {
                            const text = await file.text();
                            try {
                              const importedConfig = JSON.parse(text);
                              setConfig({ ...DEFAULT_CONFIG, ...importedConfig });
                              setSaveMessage({ type: 'success', message: '配置已导入' });
                              setTimeout(() => setSaveMessage(null), 3000);
                            } catch (error) {
                              setSaveMessage({ type: 'error', message: '导入配置失败：格式错误' });
                              setTimeout(() => setSaveMessage(null), 3000);
                            }
                          }
                        };
                        input.click();
                      }}
                      variant="outline"
                    >
                      导入配置
                    </Button>
                  </div>
                </div>

                <div className="pt-4 border-t">
                  <h3 className="text-lg font-semibold mb-4">当前配置预览</h3>
                  <pre className="bg-slate-100 dark:bg-slate-800 p-4 rounded-lg text-xs overflow-x-auto">
                    {JSON.stringify(config, null, 2)}
                  </pre>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
