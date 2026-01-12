// 价格配置管理 Tab
// 管理价格模板和工具默认模板设置

import { useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { DollarSign, Loader2, Plus } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import {
  listPricingTemplates,
  getDefaultTemplate,
  setDefaultTemplate,
  deletePricingTemplate,
} from '@/lib/tauri-commands/pricing';
import type { PricingTemplate, PricingToolId } from '@/types/pricing';
import { TOOL_NAMES } from '@/types/pricing';
import { TemplateCard } from './PricingTab/TemplateCard';
import { TemplateEditorDialog } from '@/pages/SettingsPage/components/PricingTab/TemplateEditorDialog';
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

export function PricingTab() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [templates, setTemplates] = useState<PricingTemplate[]>([]);
  const [defaultTemplates, setDefaultTemplates] = useState<Record<PricingToolId, string>>({
    'claude-code': '',
    codex: '',
    'gemini-cli': '',
  });
  const [editorDialogOpen, setEditorDialogOpen] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<PricingTemplate | null>(null);
  const [deletingTemplateId, setDeletingTemplateId] = useState<string | null>(null);

  // 加载模板列表和默认模板配置
  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const templateList = await listPricingTemplates();
      setTemplates(templateList);

      // 加载三个工具的默认模板
      const tools: PricingToolId[] = ['claude-code', 'codex', 'gemini-cli'];
      const defaults: Record<PricingToolId, string> = {
        'claude-code': '',
        codex: '',
        'gemini-cli': '',
      };

      for (const toolId of tools) {
        try {
          const defaultTpl = await getDefaultTemplate(toolId);
          defaults[toolId] = defaultTpl.id;
        } catch (error) {
          console.warn(`No default template for ${toolId}:`, error);
        }
      }

      setDefaultTemplates(defaults);
    } catch (error) {
      console.error('Failed to load pricing data:', error);
      toast({
        title: '加载失败',
        description: String(error),
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // 设置工具默认模板
  const handleSetDefault = async (toolId: PricingToolId, templateId: string) => {
    try {
      await setDefaultTemplate(toolId, templateId);
      setDefaultTemplates((prev) => ({ ...prev, [toolId]: templateId }));
      toast({
        title: '设置成功',
        description: `已将 ${TOOL_NAMES[toolId]} 的默认模板设置为 ${templates.find((t) => t.id === templateId)?.name}`,
      });
    } catch (error) {
      console.error('Failed to set default template:', error);
      toast({
        title: '设置失败',
        description: String(error),
        variant: 'destructive',
      });
    }
  };

  // 打开创建模板对话框
  const handleCreate = () => {
    setEditingTemplate(null);
    setEditorDialogOpen(true);
  };

  // 打开编辑模板对话框
  const handleEdit = (template: PricingTemplate) => {
    setEditingTemplate(template);
    setEditorDialogOpen(true);
  };

  // 保存模板（创建或更新）
  const handleSave = async () => {
    // 重新加载数据
    await loadData();
    setEditorDialogOpen(false);
    setEditingTemplate(null);
  };

  // 删除模板
  const handleDelete = async (templateId: string) => {
    setDeletingTemplateId(templateId);
  };

  // 确认删除
  const confirmDelete = async () => {
    if (!deletingTemplateId) return;

    try {
      await deletePricingTemplate(deletingTemplateId);
      toast({
        title: '删除成功',
        description: '模板已删除',
      });
      await loadData();
    } catch (error) {
      console.error('Failed to delete template:', error);
      toast({
        title: '删除失败',
        description: String(error),
        variant: 'destructive',
      });
    } finally {
      setDeletingTemplateId(null);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <span className="ml-3 text-muted-foreground">加载配置中...</span>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* 页头 */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <DollarSign className="h-5 w-5" />
          <div>
            <h3 className="text-lg font-medium">价格配置管理</h3>
            <p className="text-sm text-muted-foreground">管理模型价格模板，用于 Token 成本计算</p>
          </div>
        </div>
        <Button onClick={handleCreate}>
          <Plus className="mr-2 h-4 w-4" />
          新建模板
        </Button>
      </div>

      <Separator />

      {/* 工具默认模板选择器 */}
      <Card>
        <CardHeader>
          <CardTitle>工具默认模板</CardTitle>
          <CardDescription>为每个工具指定默认价格模板（未在 Profile 中指定时使用）</CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {(['claude-code', 'codex', 'gemini-cli'] as const).map((toolId) => (
            <div key={toolId} className="space-y-2">
              <Label>{TOOL_NAMES[toolId]}</Label>
              <Select
                value={defaultTemplates[toolId]}
                onValueChange={(value) => handleSetDefault(toolId, value)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="选择默认模板" />
                </SelectTrigger>
                <SelectContent>
                  {templates.map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* 模板列表（卡片式布局） */}
      <div>
        <h4 className="text-sm font-medium mb-4">所有模板</h4>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {templates.map((template) => (
            <TemplateCard
              key={template.id}
              template={template}
              onEdit={() => handleEdit(template)}
              onDelete={() => handleDelete(template.id)}
            />
          ))}
        </div>
        {templates.length === 0 && (
          <div className="text-center py-12 text-muted-foreground">
            <p>暂无模板，点击"新建模板"创建第一个模板</p>
          </div>
        )}
      </div>

      {/* 编辑器对话框 */}
      <TemplateEditorDialog
        open={editorDialogOpen}
        onOpenChange={setEditorDialogOpen}
        template={editingTemplate}
        onSave={handleSave}
      />

      {/* 删除确认对话框 */}
      <AlertDialog open={!!deletingTemplateId} onOpenChange={() => setDeletingTemplateId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>确认删除模板</AlertDialogTitle>
            <AlertDialogDescription>
              此操作将永久删除该模板，且无法撤销。如果该模板正在被 Profile
              使用，将回退到工具默认模板。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete}>确认删除</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
