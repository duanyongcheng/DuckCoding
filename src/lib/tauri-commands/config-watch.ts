/**
 * 配置监听相关 Tauri 命令
 */
import { invoke } from '@tauri-apps/api/core';
import type { ConfigWatchConfig, ConfigChangeRecord } from '@/types/config-watch';

/**
 * 阻止外部变更（恢复快照）
 */
export async function blockExternalChange(toolId: string): Promise<void> {
  await invoke('block_external_change', { toolId });
}

/**
 * 允许外部变更（更新快照）
 */
export async function allowExternalChange(toolId: string): Promise<void> {
  await invoke('allow_external_change', { toolId });
}

/**
 * 获取监听配置
 */
export async function getWatchConfig(): Promise<ConfigWatchConfig> {
  return await invoke('get_watch_config');
}

/**
 * 更新监听配置
 */
export async function updateWatchConfig(config: ConfigWatchConfig): Promise<void> {
  await invoke('update_watch_config', { config });
}

// ==================== 配置守护管理 ====================

/**
 * 更新敏感字段配置
 */
export async function updateSensitiveFields(toolId: string, fields: string[]): Promise<void> {
  await invoke('update_sensitive_fields', { toolId, fields });
}

/**
 * 更新黑名单配置
 */
export async function updateBlacklist(toolId: string, fields: string[]): Promise<void> {
  await invoke('update_blacklist', { toolId, fields });
}

/**
 * 获取默认敏感字段配置
 */
export async function getDefaultSensitiveFields(): Promise<Record<string, string[]>> {
  return await invoke('get_default_sensitive_fields');
}

/**
 * 获取默认黑名单配置
 */
export async function getDefaultBlacklist(): Promise<Record<string, string[]>> {
  return await invoke('get_default_blacklist');
}

// ==================== 变更日志管理 ====================

/**
 * 获取配置变更日志
 */
export async function getChangeLogs(
  toolId?: string,
  limit?: number,
): Promise<ConfigChangeRecord[]> {
  return await invoke('get_change_logs', { toolId, limit });
}

/**
 * 分页获取配置变更日志
 */
export async function getChangeLogsPage(
  page: number,
  pageSize: number,
): Promise<[ConfigChangeRecord[], number]> {
  return await invoke('get_change_logs_page', { page, pageSize });
}

/**
 * 清除配置变更日志
 */
export async function clearChangeLogs(toolId?: string): Promise<void> {
  await invoke('clear_change_logs', { toolId });
}

/**
 * 更新变更日志的用户操作
 */
export async function updateChangeLogAction(
  toolId: string,
  timestamp: string,
  action: string,
): Promise<void> {
  await invoke('update_change_log_action', { toolId, timestamp, action });
}
