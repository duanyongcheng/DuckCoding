// 价格模板编辑器对话框
// 创建或编辑价格模板（可视化表单）

import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Loader2, AlertCircle } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { savePricingTemplate, listPricingTemplates } from '@/lib/tauri-commands/pricing';
import type { PricingTemplate, InheritedModel, ModelPrice } from '@/types/pricing';
import { InheritedModelsTable } from './InheritedModelsTable';
import { CustomModelsEditor } from './CustomModelsEditor';

interface TemplateEditorDialogProps {
  /** 对话框打开状态 */
  open: boolean;
  /** 对话框状态变更回调 */
  onOpenChange: (open: boolean) => void;
  /** 编辑的模板（null 表示新建） */
  template: PricingTemplate | null;
  /** 保存成功回调 */
  onSave: () => void;
}

export function TemplateEditorDialog({
  open,
  onOpenChange,
  template,
  onSave,
}: TemplateEditorDialogProps) {
  const { toast } = useToast();
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [inheritedModels, setInheritedModels] = useState<InheritedModel[]>([]);
  const [customModels, setCustomModels] = useState<Record<string, ModelPrice>>({});
  const [availableTemplates, setAvailableTemplates] = useState<PricingTemplate[]>([]);
  const [loadingTemplates, setLoadingTemplates] = useState(false);

  // 判断是否为只读模式（内置模板）
  const isReadOnly = template?.is_default_preset || false;

  // 加载可用模板列表（用于继承配置）
  useEffect(() => {
    if (open) {
      setLoadingTemplates(true);
      listPricingTemplates()
        .then(setAvailableTemplates)
        .catch((error) => {
          console.error('Failed to load templates:', error);
        })
        .finally(() => setLoadingTemplates(false));
    }
  }, [open]);

  // 初始化表单数据
  useEffect(() => {
    if (!open) return;

    if (template) {
      // 编辑模式
      setName(template.name);
      setDescription(template.description);
      setInheritedModels(template.inherited_models);
      setCustomModels(template.custom_models);
    } else {
      // 新建模式
      setName('');
      setDescription('');
      setInheritedModels([]);
      setCustomModels({});
    }
  }, [open, template]);

  // 保存模板
  const handleSave = async () => {
    // 验证基础字段
    if (!name.trim()) {
      toast({
        title: '验证失败',
        description: '请输入模板名称',
        variant: 'destructive',
      });
      return;
    }

    // 验证至少有一种配置
    if (inheritedModels.length === 0 && Object.keys(customModels).length === 0) {
      toast({
        title: '验证失败',
        description: '请至少配置继承模型或自定义模型',
        variant: 'destructive',
      });
      return;
    }

    // 验证继承配置的完整性
    for (const inherited of inheritedModels) {
      if (!inherited.model_name.trim()) {
        toast({
          title: '验证失败',
          description: '继承配置中存在空的模型名称',
          variant: 'destructive',
        });
        return;
      }
      if (!inherited.source_template_id) {
        toast({
          title: '验证失败',
          description: `模型 ${inherited.model_name} 未选择源模板`,
          variant: 'destructive',
        });
        return;
      }
      if (inherited.multiplier <= 0) {
        toast({
          title: '验证失败',
          description: `模型 ${inherited.model_name} 的倍率必须大于 0`,
          variant: 'destructive',
        });
        return;
      }
    }

    try {
      setSaving(true);

      const now = Date.now();
      const newTemplate: PricingTemplate = {
        id: template?.id || generateTemplateId(name),
        name: name.trim(),
        description: description.trim(),
        version: template?.version || '1.0.0',
        created_at: template?.created_at || now,
        updated_at: now,
        inherited_models: inheritedModels,
        custom_models: customModels,
        tags: template?.tags || [],
        is_default_preset: template?.is_default_preset || false,
      };

      await savePricingTemplate(newTemplate);

      toast({
        title: '保存成功',
        description: template ? '模板已更新' : '模板已创建',
      });

      onSave();
    } catch (error) {
      console.error('Failed to save template:', error);
      toast({
        title: '保存失败',
        description: String(error),
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  // 生成模板 ID
  const generateTemplateId = (templateName: string): string => {
    const sanitizedName = templateName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_|_$/g, '');
    const timestamp = Date.now().toString(36);
    return `${sanitizedName}_${timestamp}`;
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {isReadOnly ? '查看模板（只读）' : template ? '编辑模板' : '新建模板'}
          </DialogTitle>
          <DialogDescription>
            {isReadOnly
              ? '此为内置预设模板，仅供查看，无法编辑'
              : '配置模型价格模板，支持完全自定义、继承模式和混合模式'}
          </DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="basic" className="mt-4">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="basic">基础信息</TabsTrigger>
            <TabsTrigger value="inherited">
              继承配置 {inheritedModels.length > 0 && `(${inheritedModels.length})`}
            </TabsTrigger>
            <TabsTrigger value="custom">
              自定义模型{' '}
              {Object.keys(customModels).length > 0 && `(${Object.keys(customModels).length})`}
            </TabsTrigger>
          </TabsList>

          {/* Tab 1: 基础信息 */}
          <TabsContent value="basic" className="space-y-4 mt-4">
            {isReadOnly && (
              <Alert>
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>
                  此模板为内置预设模板，仅供查看。如需修改，请创建新模板或从此模板继承。
                </AlertDescription>
              </Alert>
            )}
            <div className="space-y-2">
              <Label htmlFor="name">模板名称 *</Label>
              <Input
                id="name"
                placeholder="例如：自定义折扣模板"
                value={name}
                onChange={(e) => setName(e.target.value)}
                disabled={isReadOnly}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="description">描述</Label>
              <Textarea
                id="description"
                placeholder="描述此模板的用途和特点"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
                disabled={isReadOnly}
              />
            </div>
            {!isReadOnly && (
              <Alert>
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>
                  <p className="font-medium mb-2">三种模式说明：</p>
                  <ul className="list-disc list-inside space-y-1 text-sm">
                    <li>
                      <strong>完全自定义</strong>：继承配置为空，自定义模型包含所有价格
                    </li>
                    <li>
                      <strong>继承模式</strong>：仅使用继承配置，自定义模型为空
                    </li>
                    <li>
                      <strong>混合模式</strong>：同时包含继承配置和自定义模型
                    </li>
                  </ul>
                </AlertDescription>
              </Alert>
            )}
          </TabsContent>

          {/* Tab 2: 继承配置（表格） */}
          <TabsContent value="inherited" className="space-y-4 mt-4">
            {loadingTemplates ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-6 w-6 animate-spin text-primary mr-2" />
                <span className="text-muted-foreground">加载模板列表...</span>
              </div>
            ) : (
              <InheritedModelsTable
                data={inheritedModels}
                onChange={setInheritedModels}
                availableTemplates={availableTemplates}
                readOnly={isReadOnly}
              />
            )}
          </TabsContent>

          {/* Tab 3: 自定义模型（展开式列表） */}
          <TabsContent value="custom" className="space-y-4 mt-4">
            <CustomModelsEditor
              data={customModels}
              onChange={setCustomModels}
              readOnly={isReadOnly}
            />
          </TabsContent>
        </Tabs>

        <DialogFooter className="mt-6">
          {isReadOnly ? (
            <Button onClick={() => onOpenChange(false)}>关闭</Button>
          ) : (
            <>
              <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
                取消
              </Button>
              <Button onClick={handleSave} disabled={saving}>
                {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {saving ? '保存中...' : '保存'}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
