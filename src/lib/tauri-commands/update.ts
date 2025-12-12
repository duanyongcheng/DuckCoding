// 更新管理命令模块
// 负责应用程序的自动更新检查、下载、安装和回滚

import { invoke } from '@tauri-apps/api/core';
import type { UpdateInfo } from './types';

/**
 * 检查应用更新
 */
export async function checkForAppUpdates(): Promise<UpdateInfo> {
  return await invoke<UpdateInfo>('check_for_app_updates');
}

/**
 * 下载应用更新
 * @param url - 更新包下载链接
 * @returns 下载后的本地文件路径
 */
export async function downloadAppUpdate(url: string): Promise<string> {
  return await invoke<string>('download_app_update', { url });
}

/**
 * 安装应用更新
 * @param updatePath - 更新包本地路径
 */
export async function installAppUpdate(updatePath: string): Promise<void> {
  return await invoke<void>('install_app_update', { updatePath });
}

/**
 * 获取应用更新状态
 */
export async function getAppUpdateStatus(): Promise<string> {
  return await invoke<string>('get_app_update_status');
}

/**
 * 回滚应用更新
 */
export async function rollbackAppUpdate(): Promise<void> {
  return await invoke<void>('rollback_app_update');
}

/**
 * 获取当前应用版本
 */
export async function getCurrentAppVersion(): Promise<string> {
  return await invoke<string>('get_current_app_version');
}

/**
 * 重启应用以应用更新
 */
export async function restartAppForUpdate(): Promise<void> {
  return await invoke<void>('restart_app_for_update');
}
