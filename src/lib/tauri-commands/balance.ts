// 余额监控命令模块
// 负责余额配置的 CRUD 和数据迁移

import { invoke } from '@tauri-apps/api/core';
import type { BalanceStore, BalanceConfigBackend } from './types';
import type { BalanceConfig } from '@/pages/BalancePage/types';

/**
 * 转换后端格式到前端格式
 */
function toFrontendConfig(backend: BalanceConfigBackend): BalanceConfig {
  return {
    id: backend.id,
    name: backend.name,
    endpoint: backend.endpoint,
    method: backend.method,
    staticHeaders: backend.static_headers,
    extractorScript: backend.extractor_script,
    intervalSec: backend.interval_sec,
    timeoutMs: backend.timeout_ms,
    saveApiKey: backend.save_api_key,
    apiKey: backend.api_key,
    createdAt: backend.created_at,
    updatedAt: backend.updated_at,
  };
}

/**
 * 转换前端格式到后端格式
 */
function toBackendConfig(frontend: BalanceConfig): BalanceConfigBackend {
  return {
    id: frontend.id,
    name: frontend.name,
    endpoint: frontend.endpoint,
    method: frontend.method,
    static_headers: frontend.staticHeaders,
    extractor_script: frontend.extractorScript,
    interval_sec: frontend.intervalSec,
    timeout_ms: frontend.timeoutMs,
    save_api_key: frontend.saveApiKey ?? false,
    api_key: frontend.apiKey,
    created_at: frontend.createdAt,
    updated_at: frontend.updatedAt,
  };
}

/**
 * 加载所有余额监控配置
 */
export async function loadBalanceConfigs() {
  const store = await invoke<BalanceStore>('load_balance_configs');
  return {
    version: store.version,
    configs: store.configs.map(toFrontendConfig),
  };
}

/**
 * 保存新的余额监控配置
 */
export async function saveBalanceConfig(config: BalanceConfig): Promise<void> {
  return invoke<void>('save_balance_config', { config: toBackendConfig(config) });
}

/**
 * 更新现有的余额监控配置
 */
export async function updateBalanceConfig(config: BalanceConfig): Promise<void> {
  return invoke<void>('update_balance_config', { config: toBackendConfig(config) });
}

/**
 * 删除余额监控配置
 */
export async function deleteBalanceConfig(id: string): Promise<void> {
  return invoke<void>('delete_balance_config', { id });
}

/**
 * 从 localStorage 迁移配置到 balance.json
 * 这个命令由前端在首次加载时自动调用
 */
export async function migrateBalanceFromLocalstorage(configs: BalanceConfig[]): Promise<number> {
  return invoke<number>('migrate_balance_from_localstorage', {
    configs: configs.map(toBackendConfig),
  });
}
