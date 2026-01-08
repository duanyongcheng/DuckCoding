/**
 * 配置变更历史对话框 - 支持分页
 */
import { useState, useEffect, useCallback } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import {
  Loader2,
  AlertCircle,
  Clock,
  Settings,
  Trash2,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { getChangeLogsPage, clearChangeLogs } from '@/lib/tauri-commands';
import type { ConfigChangeRecord } from '@/types/config-watch';
import { TOOL_DISPLAY_NAMES, ACTION_TYPE_LABELS } from '@/types/config-watch';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

interface ChangeLogDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const PAGE_SIZE = 10;

export function ChangeLogDialog({ open, onOpenChange }: ChangeLogDialogProps) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [logs, setLogs] = useState<ConfigChangeRecord[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [clearDialogOpen, setClearDialogOpen] = useState(false);

  const totalPages = Math.ceil(total / PAGE_SIZE);

  const loadLogs = useCallback(
    async (currentPage: number) => {
      try {
        setLoading(true);
        const [records, totalCount] = await getChangeLogsPage(currentPage, PAGE_SIZE);
        setLogs(records);
        setTotal(totalCount);
      } catch (error) {
        toast({
          title: '加载失败',
          description: String(error),
          variant: 'destructive',
        });
      } finally {
        setLoading(false);
      }
    },
    [toast],
  );

  useEffect(() => {
    if (open) {
      setPage(0);
      loadLogs(0);
    }
  }, [open, loadLogs]);

  const handleClearLogs = async () => {
    try {
      await clearChangeLogs();
      setLogs([]);
      setTotal(0);
      setPage(0);
      setClearDialogOpen(false);
      toast({
        title: '清除成功',
        description: '所有变更历史已清除',
      });
    } catch (error) {
      toast({
        title: '清除失败',
        description: String(error),
        variant: 'destructive',
      });
    }
  };

  const handlePageChange = (newPage: number) => {
    setPage(newPage);
    loadLogs(newPage);
  };

  const formatTimestamp = (timestamp: string) => {
    const date = new Date(timestamp);
    return date.toLocaleString('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  };

  const getActionBadge = (action?: string) => {
    if (!action) {
      return <Badge variant="outline">待处理</Badge>;
    }

    const label = ACTION_TYPE_LABELS[action as keyof typeof ACTION_TYPE_LABELS] || action;

    switch (action) {
      case 'allow':
        return <Badge className="bg-green-500">{label}</Badge>;
      case 'block':
        return <Badge className="bg-red-500">{label}</Badge>;
      case 'superseded':
        return <Badge variant="secondary">{label}</Badge>;
      case 'expired':
        return (
          <Badge variant="outline" className="text-muted-foreground">
            {label}
          </Badge>
        );
      default:
        return <Badge variant="outline">{label}</Badge>;
    }
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-4xl max-h-[80vh]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Clock className="h-5 w-5" />
              配置变更历史
            </DialogTitle>
            <DialogDescription>
              查看所有检测到的配置文件变更记录（最多保留 100 条）
            </DialogDescription>
          </DialogHeader>

          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : total === 0 ? (
            <div className="flex flex-col items-center justify-center space-y-4 py-12">
              <AlertCircle className="h-12 w-12 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">暂无变更记录</p>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <p className="text-sm text-muted-foreground">
                  共 {total} 条记录，第 {page + 1} / {totalPages} 页
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setClearDialogOpen(true)}
                  className="gap-2"
                >
                  <Trash2 className="h-4 w-4" />
                  清除历史
                </Button>
              </div>

              <ScrollArea className="h-[400px] pr-4">
                <div className="space-y-4">
                  {logs.map((log, index) => (
                    <Card key={index} className="border-l-4 border-l-blue-500">
                      <CardHeader className="pb-3">
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex items-center gap-2">
                            <Settings className="h-4 w-4 text-muted-foreground" />
                            <span className="font-semibold">
                              {TOOL_DISPLAY_NAMES[log.tool_id] || log.tool_id}
                            </span>
                            {log.is_sensitive && (
                              <Badge variant="destructive" className="text-xs">
                                敏感变更
                              </Badge>
                            )}
                            {getActionBadge(log.action)}
                          </div>
                          <div className="flex items-center gap-1 text-xs text-muted-foreground">
                            <Clock className="h-3 w-3" />
                            {formatTimestamp(log.timestamp)}
                          </div>
                        </div>
                      </CardHeader>
                      <CardContent className="space-y-2">
                        <div className="text-sm">
                          <span className="font-medium">变更字段：</span>
                          <div className="mt-1 flex flex-wrap gap-1">
                            {log.changed_fields.map((field, idx) => (
                              <Badge key={idx} variant="outline" className="font-mono text-xs">
                                {field}
                              </Badge>
                            ))}
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </ScrollArea>

              {/* 分页控件 */}
              <div className="flex items-center justify-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handlePageChange(page - 1)}
                  disabled={page === 0}
                >
                  <ChevronLeft className="h-4 w-4" />
                  上一页
                </Button>
                <span className="text-sm text-muted-foreground">
                  {page + 1} / {totalPages}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handlePageChange(page + 1)}
                  disabled={page >= totalPages - 1}
                >
                  下一页
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* 清除确认对话框 */}
      <AlertDialog open={clearDialogOpen} onOpenChange={setClearDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>确认清除</AlertDialogTitle>
            <AlertDialogDescription>
              此操作将清除所有配置变更历史记录，且无法恢复。您确定要继续吗？
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction onClick={handleClearLogs}>确认清除</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
