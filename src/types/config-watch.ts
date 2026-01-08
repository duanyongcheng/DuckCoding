/**
 * 配置监听系统类型定义
 */

/**
 * 监听模式
 */
export type WatchMode = 'default' | 'full';

/**
 * 配置监听配置
 */
export interface ConfigWatchConfig {
  /** 是否启用配置守护 */
  enabled: boolean;
  /** 监听模式 */
  mode: WatchMode;
  /** 扫描间隔（秒） */
  scan_interval: number;
  /** 黑名单字段（按工具分组） */
  blacklist: Record<string, string[]>;
  /** 敏感字段（按工具分组） */
  sensitive_fields: Record<string, string[]>;
}

/**
 * 变更类型
 */
export type ChangeType = 'modified' | 'added' | 'deleted';

/**
 * 操作类型
 */
export type ActionType = 'allow' | 'block' | 'superseded' | 'expired';

/**
 * 字段变更
 */
export interface FieldChange {
  /** 字段路径 */
  path: string;
  /** 旧值（删除时为 Some，新增时为 None） */
  old_value?: any;
  /** 新值（新增时为 Some，删除时为 None） */
  new_value?: any;
  /** 变更类型 */
  change_type: ChangeType;
}

/**
 * 外部配置变更事件
 */
export interface ExternalConfigChange {
  /** 工具 ID */
  tool_id: string;
  /** 配置文件路径 */
  path: string;
  /** 变更字段列表 */
  changed_fields: FieldChange[];
  /** 是否包含敏感字段 */
  is_sensitive: boolean;
}

/**
 * 配置变更记录
 */
export interface ConfigChangeRecord {
  /** 工具 ID */
  tool_id: string;
  /** 变更时间 */
  timestamp: string;
  /** 变更字段路径列表 */
  changed_fields: string[];
  /** 是否包含敏感字段 */
  is_sensitive: boolean;
  /** 变更前的值（字段路径 -> 值） */
  before_values: Record<string, any>;
  /** 变更后的值（字段路径 -> 值） */
  after_values: Record<string, any>;
  /** 用户操作（allow/block/superseded/expired） */
  action?: ActionType;
}

/**
 * 工具显示名称映射
 */
export const TOOL_DISPLAY_NAMES: Record<string, string> = {
  'claude-code': 'Claude Code',
  codex: 'Codex',
  'gemini-cli': 'Gemini CLI',
};

/**
 * 监听模式显示名称
 */
export const WATCH_MODE_LABELS: Record<WatchMode, string> = {
  default: '默认模式',
  full: '全量模式',
};

/**
 * 监听模式描述
 */
export const WATCH_MODE_DESCRIPTIONS: Record<WatchMode, string> = {
  default: '仅通知 API Key 和 Base URL 变更，忽略其他配置修改',
  full: '通知所有非黑名单字段的配置变更',
};

/**
 * 变更类型显示文本
 */
export const CHANGE_TYPE_LABELS: Record<ChangeType, string> = {
  modified: '修改',
  added: '新增',
  deleted: '删除',
};

/**
 * 操作类型显示文本
 */
export const ACTION_TYPE_LABELS: Record<ActionType, string> = {
  allow: '已允许',
  block: '已阻止',
  superseded: '已累加',
  expired: '已过期',
};
