// 平台信息命令模块
// 负责获取平台信息、窗口操作和包格式推荐

import { invoke } from '@tauri-apps/api/core';
import type { PlatformInfo, PackageFormatInfo, CloseAction } from './types';

/**
 * 获取平台信息
 */
export async function getPlatformInfo(): Promise<PlatformInfo> {
  return await invoke<PlatformInfo>('get_platform_info');
}

/**
 * 获取推荐的安装包格式
 */
export async function getRecommendedPackageFormat(): Promise<PackageFormatInfo> {
  return await invoke<PackageFormatInfo>('get_recommended_package_format');
}

/**
 * 应用窗口关闭动作
 * @param action - 关闭动作（minimize: 最小化到托盘, quit: 退出应用）
 */
export async function applyCloseAction(action: CloseAction): Promise<void> {
  return await invoke<void>('handle_close_action', { action });
}
