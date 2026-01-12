// 继承配置表格组件
// 支持多源继承：每个模型可从不同模板继承，并设置倍率

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Plus, Trash2 } from 'lucide-react';
import type { InheritedModel, PricingTemplate } from '@/types/pricing';

interface InheritedModelsTableProps {
  /** 继承配置数据 */
  data: InheritedModel[];
  /** 数据变更回调 */
  onChange: (data: InheritedModel[]) => void;
  /** 可用的模板列表（用于选择源模板） */
  availableTemplates: PricingTemplate[];
  /** 只读模式（用于内置模板查看） */
  readOnly?: boolean;
}

/**
 * 从所有可用模板中提取唯一的模型名称列表
 */
function extractAvailableModels(templates: PricingTemplate[]): string[] {
  const modelSet = new Set<string>();

  templates.forEach((template) => {
    // 从继承模型中提取
    template.inherited_models.forEach((m) => {
      if (m.model_name) modelSet.add(m.model_name);
    });
    // 从自定义模型中提取
    Object.keys(template.custom_models).forEach((modelName) => {
      modelSet.add(modelName);
    });
  });

  return Array.from(modelSet).sort();
}

export function InheritedModelsTable({
  data,
  onChange,
  availableTemplates,
  readOnly = false,
}: InheritedModelsTableProps) {
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [editingRow, setEditingRow] = useState<InheritedModel | null>(null);

  // 提取所有可用的模型名称
  const availableModels = extractAvailableModels(availableTemplates);

  // 添加新行
  const handleAdd = () => {
    const newRow: InheritedModel = {
      model_name: '',
      source_template_id: availableTemplates[0]?.id || '',
      multiplier: 1.0,
    };
    onChange([...data, newRow]);
    setEditingIndex(data.length);
    setEditingRow(newRow);
  };

  // 删除行
  const handleDelete = (index: number) => {
    const newData = data.filter((_, i) => i !== index);
    onChange(newData);
    if (editingIndex === index) {
      setEditingIndex(null);
      setEditingRow(null);
    }
  };

  // 开始编辑
  const handleEdit = (index: number) => {
    setEditingIndex(index);
    setEditingRow({ ...data[index] });
  };

  // 保存编辑
  const handleSave = () => {
    if (editingIndex !== null && editingRow) {
      const newData = [...data];
      newData[editingIndex] = editingRow;
      onChange(newData);
      setEditingIndex(null);
      setEditingRow(null);
    }
  };

  // 取消编辑
  const handleCancel = () => {
    if (
      editingIndex !== null &&
      editingIndex === data.length - 1 &&
      !data[editingIndex].model_name
    ) {
      // 如果是新添加的空行，取消时删除
      onChange(data.slice(0, -1));
    }
    setEditingIndex(null);
    setEditingRow(null);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h4 className="font-medium">继承配置</h4>
          <p className="text-xs text-muted-foreground">每个模型可从不同模板继承，并应用倍率</p>
        </div>
        {!readOnly && (
          <Button size="sm" onClick={handleAdd}>
            <Plus className="mr-1 h-3 w-3" />
            添加模型
          </Button>
        )}
      </div>

      {data.length === 0 ? (
        <div className="text-center py-8 text-sm text-muted-foreground border border-dashed rounded-lg">
          {readOnly ? '此模板无继承配置' : '暂无继承配置，点击"添加模型"开始配置'}
        </div>
      ) : (
        <div className="border rounded-lg overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[35%]">模型名称</TableHead>
                <TableHead className="w-[35%]">源模板</TableHead>
                <TableHead className="w-[15%]">倍率</TableHead>
                {!readOnly && <TableHead className="w-[15%] text-right">操作</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.map((row, index) =>
                editingIndex === index && editingRow && !readOnly ? (
                  <TableRow key={index}>
                    <TableCell>
                      <Select
                        value={editingRow.model_name}
                        onValueChange={(value) =>
                          setEditingRow({ ...editingRow, model_name: value })
                        }
                      >
                        <SelectTrigger className="h-8">
                          <SelectValue placeholder="选择模型" />
                        </SelectTrigger>
                        <SelectContent>
                          {availableModels.map((modelName) => (
                            <SelectItem key={modelName} value={modelName}>
                              {modelName}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell>
                      <Select
                        value={editingRow.source_template_id}
                        onValueChange={(value) =>
                          setEditingRow({ ...editingRow, source_template_id: value })
                        }
                      >
                        <SelectTrigger className="h-8">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {availableTemplates.map((t) => (
                            <SelectItem key={t.id} value={t.id}>
                              {t.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell>
                      <Input
                        type="number"
                        step="0.1"
                        min="0"
                        value={editingRow.multiplier}
                        onChange={(e) =>
                          setEditingRow({
                            ...editingRow,
                            multiplier: parseFloat(e.target.value) || 0,
                          })
                        }
                        className="h-8"
                      />
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex gap-1 justify-end">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={handleSave}
                          className="h-7 px-2"
                        >
                          保存
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={handleCancel}
                          className="h-7 px-2"
                        >
                          取消
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ) : (
                  <TableRow key={index}>
                    <TableCell className="font-mono text-sm">{row.model_name}</TableCell>
                    <TableCell className="text-sm">
                      {availableTemplates.find((t) => t.id === row.source_template_id)?.name ||
                        row.source_template_id}
                    </TableCell>
                    <TableCell className="font-mono text-sm">{row.multiplier.toFixed(2)}</TableCell>
                    {!readOnly && (
                      <TableCell className="text-right">
                        <div className="flex gap-1 justify-end">
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => handleEdit(index)}
                            className="h-7 px-2"
                          >
                            编辑
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => handleDelete(index)}
                            className="h-7 px-2 text-destructive hover:text-destructive"
                          >
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </div>
                      </TableCell>
                    )}
                  </TableRow>
                ),
              )}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
