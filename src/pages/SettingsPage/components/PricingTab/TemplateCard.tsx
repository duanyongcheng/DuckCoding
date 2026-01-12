// 价格模板卡片组件
// 展示单个模板的信息和操作按钮

import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
  CardDescription,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Edit, Trash2 } from 'lucide-react';
import type { PricingTemplate } from '@/types/pricing';
import {
  getTemplateMode,
  getTemplateModeName,
  getTotalModelCount,
  formatTemplateTimestamp,
} from '@/types/pricing';
import { cn } from '@/lib/utils';

interface TemplateCardProps {
  /** 模板数据 */
  template: PricingTemplate;
  /** 编辑回调 */
  onEdit: () => void;
  /** 删除回调 */
  onDelete: () => void;
}

export function TemplateCard({ template, onEdit, onDelete }: TemplateCardProps) {
  const mode = getTemplateMode(template);
  const isDefaultPreset = template.is_default_preset;

  return (
    <Card className={cn('relative', isDefaultPreset && 'border-primary')}>
      {/* 官方模板标记 */}
      {isDefaultPreset && (
        <Badge className="absolute top-2 right-2" variant="default">
          官方模板
        </Badge>
      )}

      <CardHeader>
        <CardTitle className="text-base">{template.name}</CardTitle>
        <CardDescription className="text-xs line-clamp-2">{template.description}</CardDescription>
      </CardHeader>

      <CardContent className="space-y-2">
        {/* 模板信息 */}
        <div className="text-sm space-y-1">
          <div className="flex justify-between">
            <span className="text-muted-foreground">模式:</span>
            <span className="font-medium">{getTemplateModeName(mode)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">模型数:</span>
            <span className="font-medium">{getTotalModelCount(template)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">创建时间:</span>
            <span className="font-medium text-xs">
              {formatTemplateTimestamp(template.created_at)}
            </span>
          </div>
        </div>
      </CardContent>

      <CardFooter className="flex gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={onEdit}
          className="flex-1"
          title={isDefaultPreset ? '查看内置模板（只读）' : '编辑模板'}
        >
          <Edit className="mr-1 h-3 w-3" />
          {isDefaultPreset ? '查看' : '编辑'}
        </Button>
        {!isDefaultPreset && (
          <Button variant="destructive" size="sm" onClick={onDelete} className="flex-1">
            <Trash2 className="mr-1 h-3 w-3" />
            删除
          </Button>
        )}
      </CardFooter>
    </Card>
  );
}
