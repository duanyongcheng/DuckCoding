/**
 * 配置变更通知对话框
 */
import { useState } from 'react';
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { AlertTriangle, Info } from 'lucide-react';
import { blockExternalChange, allowExternalChange } from '@/lib/tauri-commands';
import { useToast } from '@/hooks/use-toast';
import type { ExternalConfigChange } from '@/types/config-watch';
import { TOOL_DISPLAY_NAMES, CHANGE_TYPE_LABELS } from '@/types/config-watch';

interface ConfigChangeDialogProps {
  /** 是否打开 */
  open: boolean;
  /** 关闭回调 */
  onClose: () => void;
  /** 变更信息 */
  change: ExternalConfigChange | null;
  /** 队列中剩余的变更数量 */
  queueLength?: number;
}

export function ConfigChangeDialog({
  open,
  onClose,
  change,
  queueLength = 0,
}: ConfigChangeDialogProps) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);

  if (!change) return null;

  const toolName = TOOL_DISPLAY_NAMES[change.tool_id] || change.tool_id;

  /**
   * 格式化 JSON 值用于显示
   */
  const formatValue = (value: any): string => {
    if (value === undefined || value === null) {
      return 'null';
    }
    if (typeof value === 'string') {
      return value;
    }
    return JSON.stringify(value, null, 2);
  };

  /**
   * 获取变更类型的样式类
   */
  const getChangeTypeColor = (changeType: string): string => {
    switch (changeType) {
      case 'added':
        return 'text-green-600 border-green-300';
      case 'deleted':
        return 'text-red-600 border-red-300';
      default:
        return 'text-blue-600 border-blue-300';
    }
  };

  const handleBlock = async () => {
    setLoading(true);
    try {
      await blockExternalChange(change.tool_id);
      toast({
        title: '已阻止变更',
        description: `已恢复 ${toolName} 的配置到上次保存的状态`,
      });
      onClose();
    } catch (error) {
      toast({
        title: '阻止失败',
        description: String(error),
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleAllow = async () => {
    setLoading(true);
    try {
      await allowExternalChange(change.tool_id);
      toast({
        title: '已允许变更',
        description: `已更新 ${toolName} 的配置快照`,
      });
      onClose();
    } catch (error) {
      toast({
        title: '允许失败',
        description: String(error),
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <AlertDialog open={open} onOpenChange={onClose}>
      <AlertDialogContent className="max-w-4xl">
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            {change.is_sensitive ? (
              <AlertTriangle className="h-5 w-5 text-yellow-500" />
            ) : (
              <Info className="h-5 w-5 text-blue-500" />
            )}
            检测到配置文件变更
            {queueLength > 0 && (
              <Badge variant="secondary" className="text-xs">
                还有 {queueLength} 个待处理
              </Badge>
            )}
          </AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-4 overflow-y-auto pr-2">
              {/* 工具和文件信息 */}
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <span className="text-sm text-muted-foreground">工具：</span>
                  <Badge variant="outline">{toolName}</Badge>
                  {change.is_sensitive && (
                    <Badge variant="destructive" className="text-xs">
                      敏感变更
                    </Badge>
                  )}
                </div>
                <div className="space-y-1">
                  <span className="text-sm text-muted-foreground">文件路径：</span>
                  <div className="rounded-md bg-muted p-2 font-mono text-xs">{change.path}</div>
                </div>
              </div>

              {/* 变更详情 */}
              {change.changed_fields.length > 0 && (
                <div className="space-y-2">
                  <span className="text-sm font-medium">
                    变更详情 ({change.changed_fields.length} 个字段)：
                  </span>
                  <ScrollArea className="h-96 rounded-md border">
                    <div className="space-y-3 p-4">
                      {change.changed_fields.map((field, index) => (
                        <Card
                          key={index}
                          className={`border-l-4 ${getChangeTypeColor(field.change_type)}`}
                        >
                          <CardHeader className="pb-3">
                            <div className="flex items-center justify-between gap-2">
                              <code className="text-sm font-mono font-semibold">{field.path}</code>
                              <Badge
                                variant="outline"
                                className={getChangeTypeColor(field.change_type)}
                              >
                                {CHANGE_TYPE_LABELS[field.change_type]}
                              </Badge>
                            </div>
                          </CardHeader>
                          <CardContent className="space-y-3">
                            {/* 修改类型：显示 Before 和 After */}
                            {field.change_type === 'modified' && (
                              <div className="grid gap-3 md:grid-cols-2">
                                <div className="space-y-1">
                                  <Label className="text-xs text-muted-foreground">变更前：</Label>
                                  <pre className="max-h-48 overflow-auto rounded-md bg-muted p-2 text-xs">
                                    {formatValue(field.old_value)}
                                  </pre>
                                </div>
                                <div className="space-y-1">
                                  <Label className="text-xs text-muted-foreground">变更后：</Label>
                                  <pre className="max-h-48 overflow-auto rounded-md bg-muted p-2 text-xs">
                                    {formatValue(field.new_value)}
                                  </pre>
                                </div>
                              </div>
                            )}

                            {/* 新增类型：只显示 After */}
                            {field.change_type === 'added' && (
                              <div className="space-y-1">
                                <Label className="text-xs text-green-600">新增值：</Label>
                                <pre className="max-h-48 overflow-auto rounded-md bg-green-50 p-2 text-xs dark:bg-green-950">
                                  {formatValue(field.new_value)}
                                </pre>
                              </div>
                            )}

                            {/* 删除类型：只显示 Before */}
                            {field.change_type === 'deleted' && (
                              <div className="space-y-1">
                                <Label className="text-xs text-red-600">已删除值：</Label>
                                <pre className="max-h-48 overflow-auto rounded-md bg-red-50 p-2 text-xs dark:bg-red-950">
                                  {formatValue(field.old_value)}
                                </pre>
                              </div>
                            )}
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                  </ScrollArea>
                </div>
              )}

              {/* 操作说明 */}
              <div className="rounded-md border border-muted-foreground/20 bg-muted/50 p-3 text-sm">
                <div className="space-y-2">
                  <div className="flex items-start gap-2">
                    <span className="font-medium">阻止：</span>
                    <span className="text-muted-foreground">
                      将配置文件恢复到 DuckCoding 记录的上次状态
                    </span>
                  </div>
                  <div className="flex items-start gap-2">
                    <span className="font-medium">允许：</span>
                    <span className="text-muted-foreground">
                      接受外部修改，并更新 DuckCoding 的配置快照
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>

        <AlertDialogFooter>
          <Button variant="outline" onClick={handleBlock} disabled={loading} className="gap-2">
            {loading ? '处理中...' : '阻止变更'}
          </Button>
          <Button onClick={handleAllow} disabled={loading} className="gap-2">
            {loading ? '处理中...' : '允许变更'}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
