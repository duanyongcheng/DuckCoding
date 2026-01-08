/**
 * 字段管理对话框
 */
import { useState, useEffect, KeyboardEvent } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Label } from '@/components/ui/label';
import { X, Plus, RotateCcw } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import {
  updateWatchConfig,
  getDefaultSensitiveFields,
  getDefaultBlacklist,
} from '@/lib/tauri-commands';
import type { ConfigWatchConfig } from '@/types/config-watch';
import { TOOL_DISPLAY_NAMES } from '@/types/config-watch';

interface FieldManagementDialogProps {
  /** 是否打开 */
  open: boolean;
  /** 关闭回调 */
  onOpenChange: (open: boolean) => void;
  /** 当前配置 */
  config: ConfigWatchConfig;
  /** 配置更新回调 */
  onConfigUpdate: (config: ConfigWatchConfig) => void;
}

export function FieldManagementDialog({
  open,
  onOpenChange,
  config,
  onConfigUpdate,
}: FieldManagementDialogProps) {
  const { toast } = useToast();
  const [sensitiveFields, setSensitiveFields] = useState<Record<string, string[]>>({});
  const [blacklist, setBlacklist] = useState<Record<string, string[]>>({});
  const [newFieldInputs, setNewFieldInputs] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  // 初始化本地状态
  useEffect(() => {
    if (open && config) {
      setSensitiveFields({ ...config.sensitive_fields });
      setBlacklist({ ...config.blacklist });
      setNewFieldInputs({});
    }
  }, [open, config]);

  const handleAddField = (
    toolId: string,
    isSensitive: boolean,
    e?: KeyboardEvent<HTMLInputElement>,
  ) => {
    if (e && e.key !== 'Enter') return;

    const input = newFieldInputs[`${isSensitive ? 'sensitive' : 'blacklist'}-${toolId}`] || '';
    const trimmed = input.trim();

    if (!trimmed) return;

    if (isSensitive) {
      const current = sensitiveFields[toolId] || [];
      if (current.includes(trimmed)) {
        toast({
          title: '字段已存在',
          description: `敏感字段列表中已包含 "${trimmed}"`,
          variant: 'destructive',
        });
        return;
      }
      setSensitiveFields({
        ...sensitiveFields,
        [toolId]: [...current, trimmed],
      });
    } else {
      const current = blacklist[toolId] || [];
      if (current.includes(trimmed)) {
        toast({
          title: '字段已存在',
          description: `黑名单字段列表中已包含 "${trimmed}"`,
          variant: 'destructive',
        });
        return;
      }
      setBlacklist({
        ...blacklist,
        [toolId]: [...current, trimmed],
      });
    }

    // 清空输入框
    setNewFieldInputs({
      ...newFieldInputs,
      [`${isSensitive ? 'sensitive' : 'blacklist'}-${toolId}`]: '',
    });
  };

  const handleRemoveField = (toolId: string, field: string, isSensitive: boolean) => {
    if (isSensitive) {
      const current = sensitiveFields[toolId] || [];
      setSensitiveFields({
        ...sensitiveFields,
        [toolId]: current.filter((f) => f !== field),
      });
    } else {
      const current = blacklist[toolId] || [];
      setBlacklist({
        ...blacklist,
        [toolId]: current.filter((f) => f !== field),
      });
    }
  };

  const handleResetToDefault = async (toolId: string, isSensitive: boolean) => {
    try {
      if (isSensitive) {
        // 从后端获取默认敏感字段
        const defaults = await getDefaultSensitiveFields();
        setSensitiveFields({
          ...sensitiveFields,
          [toolId]: [...(defaults[toolId] || [])],
        });
        toast({
          title: '已重置',
          description: `已将 ${TOOL_DISPLAY_NAMES[toolId]} 的敏感字段重置为默认`,
        });
      } else {
        // 从后端获取默认黑名单
        const defaults = await getDefaultBlacklist();
        setBlacklist({
          ...blacklist,
          [toolId]: [...(defaults[toolId] || [])],
        });
        toast({
          title: '已重置',
          description: `已将 ${TOOL_DISPLAY_NAMES[toolId]} 的黑名单字段重置为默认`,
        });
      }
    } catch (error) {
      toast({
        title: '重置失败',
        description: String(error),
        variant: 'destructive',
      });
    }
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      const updatedConfig: ConfigWatchConfig = {
        ...config,
        sensitive_fields: sensitiveFields,
        blacklist: blacklist,
      };
      await updateWatchConfig(updatedConfig);
      onConfigUpdate(updatedConfig);
      toast({
        title: '保存成功',
        description: '字段配置已更新',
      });
      onOpenChange(false);
    } catch (error) {
      toast({
        title: '保存失败',
        description: String(error),
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  const renderFieldList = (toolId: string, isSensitive: boolean) => {
    const fields = isSensitive ? sensitiveFields[toolId] || [] : blacklist[toolId] || [];
    const inputKey = `${isSensitive ? 'sensitive' : 'blacklist'}-${toolId}`;

    return (
      <Card key={toolId}>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-base">{TOOL_DISPLAY_NAMES[toolId] || toolId}</CardTitle>
              <CardDescription>{fields.length} 个字段</CardDescription>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => handleResetToDefault(toolId, isSensitive)}
              className="gap-2"
            >
              <RotateCcw className="h-3 w-3" />
              重置为默认
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {/* 字段列表 */}
          <ScrollArea className="h-32">
            <div className="flex flex-wrap gap-2">
              {fields.map((field, index) => (
                <Badge key={index} variant="secondary" className="gap-1 px-2 py-1">
                  <span className="font-mono text-xs">{field}</span>
                  <button
                    onClick={() => handleRemoveField(toolId, field, isSensitive)}
                    className="ml-1 rounded-full hover:bg-destructive/20"
                    aria-label={`删除 ${field}`}
                  >
                    <X className="h-3 w-3" />
                  </button>
                </Badge>
              ))}
              {fields.length === 0 && (
                <p className="py-4 text-sm text-muted-foreground">暂无字段</p>
              )}
            </div>
          </ScrollArea>

          {/* 添加字段输入框 */}
          <div className="flex gap-2">
            <Input
              placeholder="输入字段名称后按 Enter..."
              value={newFieldInputs[inputKey] || ''}
              onChange={(e) =>
                setNewFieldInputs({
                  ...newFieldInputs,
                  [inputKey]: e.target.value,
                })
              }
              onKeyPress={(e) => handleAddField(toolId, isSensitive, e)}
              className="font-mono text-sm"
            />
            <Button
              size="sm"
              variant="outline"
              onClick={() => handleAddField(toolId, isSensitive)}
              className="gap-1"
            >
              <Plus className="h-3 w-3" />
              添加
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  };

  const toolIds = ['claude-code', 'codex', 'gemini-cli'];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>字段管理</DialogTitle>
          <DialogDescription>
            管理各工具的敏感字段和黑名单字段，支持通配符（如 ui.*）
          </DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="sensitive" className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="sensitive">敏感字段</TabsTrigger>
            <TabsTrigger value="blacklist">黑名单</TabsTrigger>
          </TabsList>

          <TabsContent value="sensitive" className="space-y-4 pt-4">
            <div className="rounded-md border border-yellow-500/20 bg-yellow-500/10 p-3 text-sm">
              <Label className="font-medium text-yellow-700 dark:text-yellow-400">
                敏感字段说明：
              </Label>
              <p className="mt-1 text-xs text-muted-foreground">
                在默认模式下，仅当这些字段发生变更时才会触发通知。包括 API Key、Base URL
                等关键配置。
              </p>
            </div>
            <ScrollArea className="h-[400px]">
              <div className="space-y-3 pr-4">{toolIds.map((id) => renderFieldList(id, true))}</div>
            </ScrollArea>
          </TabsContent>

          <TabsContent value="blacklist" className="space-y-4 pt-4">
            <div className="rounded-md border border-muted-foreground/20 bg-muted/50 p-3 text-sm">
              <Label className="font-medium">黑名单字段说明：</Label>
              <p className="mt-1 text-xs text-muted-foreground">
                这些字段的变更会被忽略，不会触发任何通知。通常包括主题、UI 设置等自动修改的配置。
              </p>
            </div>
            <ScrollArea className="h-[400px]">
              <div className="space-y-3 pr-4">
                {toolIds.map((id) => renderFieldList(id, false))}
              </div>
            </ScrollArea>
          </TabsContent>
        </Tabs>

        <div className="flex justify-end gap-2 pt-4">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            取消
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? '保存中...' : '保存'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
