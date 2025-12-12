// 代理管理命令模块
// 负责透明代理的启动、停止、状态查询和配置管理

import { invoke } from '@tauri-apps/api/core';
import type { TransparentProxyStatus, AllProxyStatus, ToolProxyConfig, ToolId } from './types';

// ==================== 旧版单工具代理 API（兼容性保留）====================

/**
 * 启动透明代理（旧版，使用 claude-code 工具）
 * @deprecated 请使用 startToolProxy
 */
export async function startTransparentProxy(): Promise<string> {
  return await invoke<string>('start_transparent_proxy');
}

/**
 * 停止透明代理（旧版，使用 claude-code 工具）
 * @deprecated 请使用 stopToolProxy
 */
export async function stopTransparentProxy(): Promise<string> {
  return await invoke<string>('stop_transparent_proxy');
}

/**
 * 获取透明代理状态（旧版，使用 claude-code 工具）
 * @deprecated 请使用 getAllProxyStatus
 */
export async function getTransparentProxyStatus(): Promise<TransparentProxyStatus> {
  return await invoke<TransparentProxyStatus>('get_transparent_proxy_status');
}

/**
 * 更新透明代理配置（旧版，使用 claude-code 工具）
 * @deprecated 请使用 updateProxyConfig
 */
export async function updateTransparentProxyConfig(
  newApiKey: string,
  newBaseUrl: string,
): Promise<string> {
  return await invoke<string>('update_transparent_proxy_config', {
    newApiKey,
    newBaseUrl,
  });
}

// ==================== 多工具透明代理 API（新架构）====================

/**
 * 启动指定工具的透明代理
 * @param toolId - 工具 ID ("claude-code", "codex", "gemini-cli")
 */
export async function startToolProxy(toolId: string): Promise<string> {
  return await invoke<string>('start_tool_proxy', { toolId });
}

/**
 * 停止指定工具的透明代理
 * @param toolId - 工具 ID ("claude-code", "codex", "gemini-cli")
 */
export async function stopToolProxy(toolId: string): Promise<string> {
  return await invoke<string>('stop_tool_proxy', { toolId });
}

/**
 * 获取所有工具的透明代理状态
 * @returns 工具 ID 到状态的映射
 */
export async function getAllProxyStatus(): Promise<AllProxyStatus> {
  return await invoke<AllProxyStatus>('get_all_proxy_status');
}

/**
 * 获取指定工具的代理配置
 */
export async function getProxyConfig(toolId: ToolId): Promise<ToolProxyConfig | null> {
  return await invoke<ToolProxyConfig | null>('get_proxy_config', { toolId });
}

/**
 * 更新指定工具的代理配置
 */
export async function updateProxyConfig(toolId: ToolId, config: ToolProxyConfig): Promise<void> {
  return await invoke<void>('update_proxy_config', { toolId, config });
}

/**
 * 获取所有工具的代理配置
 */
export async function getAllProxyConfigs(): Promise<Record<string, ToolProxyConfig>> {
  return await invoke<Record<string, ToolProxyConfig>>('get_all_proxy_configs');
}
