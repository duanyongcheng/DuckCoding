// 日志管理命令模块
// 负责日志配置的查询和更新

import { invoke } from '@tauri-apps/api/core';
import type { LogConfig } from './types';

/**
 * 检测当前是否为 Release 构建
 */
export async function isReleaseBuild(): Promise<boolean> {
  return await invoke<boolean>('is_release_build');
}

/**
 * 获取当前日志配置
 */
export async function getLogConfig(): Promise<LogConfig> {
  return await invoke<LogConfig>('get_log_config');
}

/**
 * 更新日志配置
 * @param newConfig - 新的日志配置
 * @returns 提示消息，包含是否需要重启的信息
 */
export async function updateLogConfig(newConfig: LogConfig): Promise<string> {
  return await invoke<string>('update_log_config', { newConfig });
}
