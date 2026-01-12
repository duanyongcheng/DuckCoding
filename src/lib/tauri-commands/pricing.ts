/**
 * 价格配置管理命令包装器
 *
 * 提供价格模板 CRUD 操作和工具默认模板管理
 */

import { invoke } from '@tauri-apps/api/core';
import type { PricingTemplate, PricingToolId } from '@/types/pricing';

/**
 * 列出所有价格模板
 *
 * @returns 所有可用价格模板的列表
 */
export async function listPricingTemplates(): Promise<PricingTemplate[]> {
  return invoke('list_pricing_templates');
}

/**
 * 获取指定价格模板
 *
 * @param templateId - 模板 ID
 * @returns 价格模板详细信息
 */
export async function getPricingTemplate(templateId: string): Promise<PricingTemplate> {
  return invoke('get_pricing_template', { templateId });
}

/**
 * 保存价格模板（创建或更新）
 *
 * @param template - 价格模板数据
 *
 * @note
 * - 如果模板 ID 已存在，将覆盖现有模板
 * - 不允许覆盖内置预设模板（is_default_preset = true）
 */
export async function savePricingTemplate(template: PricingTemplate): Promise<void> {
  return invoke('save_pricing_template', { template });
}

/**
 * 删除价格模板
 *
 * @param templateId - 模板 ID
 *
 * @note
 * - 不允许删除内置预设模板
 */
export async function deletePricingTemplate(templateId: string): Promise<void> {
  return invoke('delete_pricing_template', { templateId });
}

/**
 * 设置工具的默认价格模板
 *
 * @param toolId - 工具 ID（claude-code / codex / gemini-cli）
 * @param templateId - 模板 ID
 *
 * @note
 * - 模板必须存在才能设置为默认模板
 */
export async function setDefaultTemplate(toolId: PricingToolId, templateId: string): Promise<void> {
  return invoke('set_default_template', { toolId, templateId });
}

/**
 * 获取工具的默认价格模板
 *
 * @param toolId - 工具 ID（claude-code / codex / gemini-cli）
 * @returns 该工具当前使用的默认价格模板
 */
export async function getDefaultTemplate(toolId: PricingToolId): Promise<PricingTemplate> {
  return invoke('get_default_template', { toolId });
}
