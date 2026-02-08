'use client';

import { useState, useEffect } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Clock, FileText, CheckCircle, XCircle, Loader2 } from 'lucide-react';
import { useRouter } from 'next/navigation';

interface HistoryRecord {
  id: string;
  fileName: string;
  timestamp: number;
  totalRows: number;
  processedRows: number;
  status: 'completed' | 'interrupted' | 'error';
  results: any[];
  logs: any[];
  elapsed?: number;
  elapsedFormatted?: string;
  fileId?: string;
}

export default function HistoryPage() {
  const router = useRouter();
  const [history, setHistory] = useState<HistoryRecord[]>([]);
  const [selectedRecord, setSelectedRecord] = useState<HistoryRecord | null>(null);
  const [viewMode, setViewMode] = useState<'list' | 'detail'>('list');

  useEffect(() => {
    loadHistory();
  }, []);

  const loadHistory = () => {
    const saved = localStorage.getItem('disease-extraction-history');
    if (saved) {
      try {
        const records: HistoryRecord[] = JSON.parse(saved);
        // 按时间倒序排列
        records.sort((a, b) => b.timestamp - a.timestamp);
        setHistory(records);
      } catch (error) {
        console.error('加载历史记录失败:', error);
      }
    }
  };

  const deleteRecord = (id: string) => {
    const updated = history.filter(r => r.id !== id);
    setHistory(updated);
    localStorage.setItem('disease-extraction-history', JSON.stringify(updated));
    if (selectedRecord?.id === id) {
      setSelectedRecord(null);
    }
  };

  const formatTimestamp = (timestamp: number) => {
    const date = new Date(timestamp);
    return date.toLocaleString('zh-CN');
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'completed':
        return <CheckCircle className="w-5 h-5 text-green-600 dark:text-green-400" />;
      case 'interrupted':
        return <XCircle className="w-5 h-5 text-orange-600 dark:text-orange-400" />;
      case 'error':
        return <XCircle className="w-5 h-5 text-red-600 dark:text-red-400" />;
      default:
        return null;
    }
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case 'completed':
        return '已完成';
      case 'interrupted':
        return '已中断';
      case 'error':
        return '出错';
      default:
        return status;
    }
  };

  const downloadResults = (record: HistoryRecord) => {
    const headers = ['序号', '原始文本', '识别到的病种', '状态'];
    const rows = record.results.map((r: any, index: number) => [
      index + 1,
      `"${r.originalText.replace(/"/g, '""')}"`,
      `"${(r.diseases || []).join('; ')}"`,
      r.error ? '失败' : '成功'
    ]);

    const csvContent = [headers.join(','), ...rows.map(row => row.join(','))].join('\n');
    const blob = new Blob(['\ufeff' + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `病种识别结果_${formatTimestamp(record.timestamp)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  if (viewMode === 'list') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-950 dark:to-slate-900 p-8">
        <div className="max-w-7xl mx-auto space-y-8">
          {/* 标题 */}
          <div className="flex items-center space-x-4">
            <Button
              onClick={() => router.push('/')}
              variant="ghost"
              size="sm"
            >
              <ArrowLeft className="w-4 h-4 mr-2" />
              返回
            </Button>
            <h1 className="text-4xl font-bold text-slate-900 dark:text-slate-50">
              历史记录
            </h1>
          </div>

          {/* 历史记录列表 */}
          {history.length === 0 ? (
            <Card className="p-12 text-center">
              <FileText className="w-16 h-16 mx-auto mb-4 text-slate-400" />
              <p className="text-slate-600 dark:text-slate-400 text-lg">暂无历史记录</p>
              <Button
                onClick={() => router.push('/')}
                className="mt-4"
              >
                开始新的分析
              </Button>
            </Card>
          ) : (
            <div className="space-y-4">
              {history.map((record) => (
                <Card key={record.id} className="p-6 hover:shadow-lg transition-shadow">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-4 flex-1">
                      {getStatusIcon(record.status)}
                      <div className="flex-1">
                        <h3 className="font-semibold text-slate-900 dark:text-slate-50">
                          {record.fileName}
                        </h3>
                        <div className="flex items-center space-x-4 mt-1 text-sm text-slate-600 dark:text-slate-400">
                          <span className="flex items-center">
                            <Clock className="w-4 h-4 mr-1" />
                            {formatTimestamp(record.timestamp)}
                          </span>
                          <span>
                            {record.processedRows} / {record.totalRows} 条
                          </span>
                          <span>
                            {getStatusText(record.status)}
                          </span>
                          {record.elapsedFormatted && (
                            <span>用时: {record.elapsedFormatted}</span>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center space-x-2">
                      <Button
                        onClick={() => {
                          setSelectedRecord(record);
                          setViewMode('detail');
                        }}
                        variant="outline"
                        size="sm"
                      >
                        查看详情
                      </Button>
                      {record.status === 'completed' && (
                        <Button
                          onClick={() => downloadResults(record)}
                          variant="outline"
                          size="sm"
                        >
                          导出结果
                        </Button>
                      )}
                      <Button
                        onClick={() => deleteRecord(record.id)}
                        variant="outline"
                        size="sm"
                        className="text-red-600 hover:text-red-700 dark:text-red-400"
                      >
                        删除
                      </Button>
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }

  // 详情视图
  if (selectedRecord) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-950 dark:to-slate-900 p-8">
        <div className="max-w-7xl mx-auto space-y-8">
          {/* 标题 */}
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <Button
                onClick={() => {
                  setSelectedRecord(null);
                  setViewMode('list');
                }}
                variant="ghost"
                size="sm"
              >
                <ArrowLeft className="w-4 h-4 mr-2" />
                返回列表
              </Button>
              <h1 className="text-4xl font-bold text-slate-900 dark:text-slate-50">
                {selectedRecord.fileName}
              </h1>
              {getStatusIcon(selectedRecord.status)}
            </div>
            <div className="flex items-center space-x-4 text-sm text-slate-600 dark:text-slate-400">
              <span className="flex items-center">
                <Clock className="w-4 h-4 mr-1" />
                {formatTimestamp(selectedRecord.timestamp)}
              </span>
              <span>
                {selectedRecord.processedRows} / {selectedRecord.totalRows} 条
              </span>
              {selectedRecord.elapsedFormatted && (
                <span>用时: {selectedRecord.elapsedFormatted}</span>
              )}
            </div>
          </div>

          {/* 日志显示 */}
          <Card className="p-6">
            <h2 className="text-xl font-bold text-slate-900 dark:text-slate-50 mb-4">
              执行日志
            </h2>
            <div className="bg-slate-950 dark:bg-slate-900 p-4 rounded-lg overflow-auto max-h-[600px]">
              <pre className="text-sm text-green-400 font-mono space-y-1">
                {selectedRecord.logs.map((log, index) => (
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
                      <div className="ml-8 text-slate-500 text-xs mt-1">
                        {JSON.stringify(log.details, null, 2)}
                      </div>
                    )}
                  </div>
                ))}
              </pre>
            </div>
          </Card>

          {/* 结果预览 */}
          <Card className="p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold text-slate-900 dark:text-slate-50">
                识别结果
              </h2>
              <span className="text-sm text-slate-600 dark:text-slate-400">
                共 {selectedRecord.results.length} 条
              </span>
            </div>
            <div className="overflow-auto max-h-[400px]">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-white dark:bg-slate-950">
                  <tr className="border-b">
                    <th className="text-left py-2 px-3">序号</th>
                    <th className="text-left py-2 px-3">原始文本</th>
                    <th className="text-left py-2 px-3">识别到的病种</th>
                    <th className="text-left py-2 px-3">状态</th>
                  </tr>
                </thead>
                <tbody>
                  {selectedRecord.results.map((result: any, index: number) => (
                    <tr key={index} className="border-b hover:bg-slate-50 dark:hover:bg-slate-900">
                      <td className="py-2 px-3">{index + 1}</td>
                      <td className="py-2 px-3 max-w-xs truncate" title={result.originalText}>
                        {result.originalText}
                      </td>
                      <td className="py-2 px-3">
                        {(result.diseases || []).join(', ') || '无'}
                      </td>
                      <td className="py-2 px-3">
                        {result.error ? (
                          <span className="text-red-600">{result.errorType || 'ERROR'}</span>
                        ) : (
                          <span className="text-green-600">成功</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      </div>
    );
  }

  return null;
}
