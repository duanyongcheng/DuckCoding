// 会话管理命令模块
// 负责透明代理会话的 CRUD 和配置管理

import { invoke } from '@tauri-apps/api/core';
import type { SessionListResponse } from './types';

/**
 * 获取会话列表
 * @param toolId - 工具 ID ("claude-code", "codex", "gemini-cli")
 * @param page - 页码（从 1 开始）
 * @param pageSize - 每页数量
 */
export async function getSessionList(
  toolId: string,
  page: number,
  pageSize: number,
): Promise<SessionListResponse> {
  return await invoke<SessionListResponse>('get_session_list', {
    toolId,
    page,
    pageSize,
  });
}

/**
 * 删除单个会话
 * @param sessionId - 完整的会话 ID
 */
export async function deleteSession(sessionId: string): Promise<void> {
  return await invoke<void>('delete_session', { sessionId });
}

/**
 * 清空指定工具的所有会话
 * @param toolId - 工具 ID
 */
export async function clearAllSessions(toolId: string): Promise<void> {
  return await invoke<void>('clear_all_sessions', { toolId });
}

/**
 * 更新会话配置
 * @param sessionId - 会话 ID
 * @param configName - 配置名称 ("global" 或 "custom")
 * @param customProfileName - 自定义配置名称 (global 时为 null)
 * @param url - API Base URL (global 时为空字符串)
 * @param apiKey - API Key (global 时为空字符串)
 * @param pricingTemplateId - 价格模板 ID (Phase 6)
 */
export async function updateSessionConfig(
  sessionId: string,
  configName: string,
  customProfileName: string | null,
  url: string,
  apiKey: string,
  pricingTemplateId?: string | null,
): Promise<void> {
  return await invoke<void>('update_session_config', {
    sessionId,
    configName,
    customProfileName,
    url,
    apiKey,
    pricingTemplateId: pricingTemplateId || null,
  });
}

/**
 * 更新会话备注
 * @param sessionId - 会话 ID
 * @param note - 备注内容 (null 表示清空)
 */
export async function updateSessionNote(sessionId: string, note: string | null): Promise<void> {
  return await invoke<void>('update_session_note', {
    sessionId,
    note,
  });
}
