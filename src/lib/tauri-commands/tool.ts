// 工具管理命令模块
// 负责工具的安装、更新、检测、实例管理等功能

import { invoke } from '@tauri-apps/api/core';
import type {
  ToolStatus,
  InstallResult,
  UpdateResult,
  NodeEnvironment,
  ToolCandidate,
  InstallerCandidate,
  SSHConfig,
} from './types';
import type { ToolInstance } from '@/types/tool-management';

/**
 * 检查所有工具的安装状态
 * 优先从数据库读取（< 10ms），首次启动自动检测并持久化
 */
export async function checkInstallations(): Promise<ToolStatus[]> {
  return await invoke<ToolStatus[]>('check_installations');
}

/**
 * 刷新工具状态（清除缓存并重新检测）
 * 用于用户手动刷新或外部安装/卸载工具后更新状态
 */
export async function refreshToolStatus(): Promise<ToolStatus[]> {
  return await invoke<ToolStatus[]>('refresh_tool_status');
}

/**
 * 检查 Node.js 和 npm 环境
 */
export async function checkNodeEnvironment(): Promise<NodeEnvironment> {
  return await invoke<NodeEnvironment>('check_node_environment');
}

/**
 * 安装工具
 * @param tool - 工具 ID
 * @param method - 安装方法（npm/brew/official）
 * @param force - 是否强制安装
 */
export async function installTool(
  tool: string,
  method: string,
  force?: boolean,
): Promise<InstallResult> {
  return await invoke<InstallResult>('install_tool', { tool, method, force });
}

/**
 * 检查工具更新（旧版本）
 * @deprecated 请使用 checkUpdateForInstance
 */
export async function checkUpdate(tool: string): Promise<UpdateResult> {
  return await invoke<UpdateResult>('check_update', { tool });
}

/**
 * 检查工具更新（基于实例ID，使用配置的路径检测版本）
 * @param instanceId - 工具实例ID
 * @returns 更新信息
 */
export async function checkUpdateForInstance(instanceId: string): Promise<UpdateResult> {
  return await invoke<UpdateResult>('check_update_for_instance', { instanceId });
}

/**
 * 检查所有工具的更新
 */
export async function checkAllUpdates(): Promise<UpdateResult[]> {
  return await invoke<UpdateResult[]>('check_all_updates');
}

/**
 * 刷新数据库中所有工具的版本号（使用配置的路径检测）
 * @returns 更新后的工具状态列表
 */
export async function refreshAllToolVersions(): Promise<ToolStatus[]> {
  return await invoke<ToolStatus[]>('refresh_all_tool_versions');
}

/**
 * 更新工具实例（使用配置的安装器路径）
 * @param instanceId - 工具实例ID
 * @param force - 是否强制更新
 * @returns 更新结果
 */
export async function updateToolInstance(
  instanceId: string,
  force?: boolean,
): Promise<UpdateResult> {
  return await invoke<UpdateResult>('update_tool_instance', { instanceId, force });
}

/**
 * 获取所有工具实例（按工具ID分组）
 * @returns 按工具ID分组的实例集合
 */
export async function getToolInstances(): Promise<Record<string, ToolInstance[]>> {
  return await invoke<Record<string, ToolInstance[]>>('get_tool_instances');
}

/**
 * 刷新工具实例状态
 * @returns 刷新后的实例集合
 */
export async function refreshToolInstances(): Promise<Record<string, ToolInstance[]>> {
  return await invoke<Record<string, ToolInstance[]>>('refresh_tool_instances');
}

/**
 * 列出所有可用的WSL发行版
 * @returns WSL发行版名称列表
 */
export async function listWslDistributions(): Promise<string[]> {
  return await invoke<string[]>('list_wsl_distributions');
}

/**
 * 添加WSL工具实例
 * @param baseId - 工具ID（claude-code, codex, gemini-cli）
 * @param distroName - WSL发行版名称
 * @returns 创建的实例
 */
export async function addWslToolInstance(
  baseId: string,
  distroName: string,
): Promise<ToolInstance> {
  return await invoke<ToolInstance>('add_wsl_tool_instance', { baseId, distroName });
}

/**
 * 添加SSH工具实例
 * @param baseId - 工具ID
 * @param sshConfig - SSH连接配置
 * @returns 创建的实例
 */
export async function addSshToolInstance(
  baseId: string,
  sshConfig: SSHConfig,
): Promise<ToolInstance> {
  return await invoke<ToolInstance>('add_ssh_tool_instance', {
    baseId,
    sshConfig,
  });
}

/**
 * 删除工具实例（仅SSH类型）
 * @param instanceId - 实例ID
 */
export async function deleteToolInstance(instanceId: string): Promise<void> {
  return await invoke<void>('delete_tool_instance', { instanceId });
}

/**
 * 验证用户指定的工具路径是否有效
 * @param toolId - 工具ID
 * @param path - 工具可执行文件路径
 * @returns 版本号字符串
 */
export async function validateToolPath(toolId: string, path: string): Promise<string> {
  return await invoke<string>('validate_tool_path', { toolId, path });
}

/**
 * 扫描所有工具候选（用于自动扫描）
 * @param toolId - 工具ID
 * @returns 工具候选列表
 */
export async function scanAllToolCandidates(toolId: string): Promise<ToolCandidate[]> {
  return await invoke<ToolCandidate[]>('scan_all_tool_candidates', { toolId });
}

/**
 * 扫描工具路径的安装器
 * @param toolPath - 工具可执行文件路径
 * @returns 安装器候选列表
 */
export async function scanInstallerForToolPath(toolPath: string): Promise<InstallerCandidate[]> {
  return await invoke<InstallerCandidate[]>('scan_installer_for_tool_path', { toolPath });
}

/**
 * 手动添加工具实例（保存用户指定的路径）
 * @param toolId - 工具ID
 * @param path - 工具可执行文件路径
 * @param installMethod - 安装方法（"npm" | "brew" | "official" | "other"）
 * @param installerPath - 安装器路径（非 other 类型时必填）
 * @returns 工具状态信息
 */
export async function addManualToolInstance(
  toolId: string,
  path: string,
  installMethod: string,
  installerPath?: string,
): Promise<ToolStatus> {
  return await invoke<ToolStatus>('add_manual_tool_instance', {
    toolId,
    path,
    installMethod,
    installerPath,
  });
}

/**
 * 检测单个工具但不保存（仅用于预览）
 * @param toolId - 工具ID
 * @returns 工具状态信息
 */
export async function detectToolWithoutSave(toolId: string): Promise<ToolStatus> {
  return await invoke<ToolStatus>('detect_tool_without_save', { toolId });
}

/**
 * 检测单个工具并保存到数据库
 * @param toolId - 工具ID
 * @param forceRedetect - 是否强制重新检测（默认 false，会优先读取数据库）
 * @returns 工具状态信息
 */
export async function detectSingleTool(
  toolId: string,
  forceRedetect?: boolean,
): Promise<ToolStatus> {
  return await invoke<ToolStatus>('detect_single_tool', { toolId, forceRedetect });
}
