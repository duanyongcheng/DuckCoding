// API 调用命令模块
// 负责通用 API 请求和统计数据获取

import { invoke } from '@tauri-apps/api/core';
import type { GenerateApiKeyResult, UsageStatsResult, UserQuotaResult } from './types';

/**
 * 为指定工具生成 API Key
 */
export async function generateApiKeyForTool(tool: string): Promise<GenerateApiKeyResult> {
  return await invoke<GenerateApiKeyResult>('generate_api_key_for_tool', { tool });
}

/**
 * 获取使用统计
 */
export async function getUsageStats(): Promise<UsageStatsResult> {
  return await invoke<UsageStatsResult>('get_usage_stats');
}

/**
 * 获取用户配额
 */
export async function getUserQuota(): Promise<UserQuotaResult> {
  return await invoke<UserQuotaResult>('get_user_quota');
}

/**
 * 通用 API 请求（用于余额监控等功能）
 * @param endpoint - API 端点 URL
 * @param method - HTTP 方法（GET/POST）
 * @param headers - 自定义请求头
 * @param timeoutMs - 超时时间（毫秒）
 */
export async function fetchApi(
  endpoint: string,
  method: string,
  headers: Record<string, string>,
  timeoutMs?: number,
): Promise<unknown> {
  return await invoke('fetch_api', {
    endpoint,
    method,
    headers,
    timeout_ms: timeoutMs,
  });
}
