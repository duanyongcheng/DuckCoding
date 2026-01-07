/**
 * Profile 管理相关类型定义（v2.1 - 简化版）
 */

// ==================== Profile Payload（前端构建用）====================

/**
 * Claude Profile Payload（前端构建 Profile 时使用）
 */
export interface ClaudeProfilePayload {
  api_key: string;
  base_url: string;
}

/**
 * Codex Profile Payload（前端构建 Profile 时使用）
 */
export interface CodexProfilePayload {
  api_key: string;
  base_url: string;
  wire_api: string; // "responses" 或 "chat"
}

/**
 * Gemini Profile Payload（前端构建 Profile 时使用）
 */
export interface GeminiProfilePayload {
  api_key: string;
  base_url: string;
  model?: string; // 可选,不填则不修改原生配置
}

/**
 * Profile Payload 联合类型（前端传递给后端）
 *
 * 使用 tagged union 确保类型正确匹配
 * 注意：AMP 不创建 profile，使用 AmpProfileSelection 选择其他工具的 profile
 */
export type ProfilePayload =
  | ({ type: 'claude-code' } & ClaudeProfilePayload)
  | ({ type: 'codex' } & CodexProfilePayload)
  | ({ type: 'gemini-cli' } & GeminiProfilePayload);

/**
 * Profile 完整数据（包含时间戳）
 */
export interface ProfileData {
  api_key: string;
  base_url: string;
  created_at: string; // ISO 8601 时间字符串
  updated_at: string; // ISO 8601 时间字符串
  // 工具特定字段
  provider?: string; // Codex
  model?: string; // Gemini
  raw_settings?: Record<string, unknown>;
  raw_config_json?: Record<string, unknown>;
  raw_config_toml?: string;
  raw_auth_json?: Record<string, unknown>;
  raw_env?: string;
}

/**
 * Profile 来源类型
 */
export type ProfileSource =
  | { type: 'Custom' }
  | {
      type: 'ImportedFromProvider';
      provider_id: string;
      provider_name: string;
      remote_token_id: number;
      remote_token_name: string;
      group: string;
      imported_at: number; // Unix 时间戳
    };

/**
 * Profile 描述符（前端展示用）
 */
export interface ProfileDescriptor {
  tool_id: string;
  name: string;
  api_key_preview: string; // 脱敏显示（如 "sk-ant-***xxx"）
  base_url: string;
  source: ProfileSource; // Profile 来源信息
  created_at: string; // ISO 8601 时间字符串
  updated_at: string; // ISO 8601 时间字符串
  is_active: boolean;
  switched_at?: string; // 激活时间（ISO 8601 时间字符串）
  // Codex 特定字段（注意：后端是 wire_api,前端展示用 provider 兼容）
  wire_api?: string;
  provider?: string; // 向后兼容
  // Gemini 特定字段
  model?: string;
}

/**
 * 可创建 Profile 的工具 ID（不含 AMP）
 */
export type ProfileToolId = 'claude-code' | 'codex' | 'gemini-cli';

/**
 * 所有工具 ID（包含 AMP）
 */
export type ToolId = ProfileToolId | 'amp-code';

/**
 * Profile 引用（指向某工具的某个 profile）
 */
export interface ProfileRef {
  tool_id: ProfileToolId;
  profile_name: string;
}

/**
 * AMP Profile 选择（引用其他工具的 profile）
 * AMP 不创建独立 profile，而是从 3 个工具中选择
 */
export interface AmpProfileSelection {
  claude: ProfileRef | null;
  codex: ProfileRef | null;
  gemini: ProfileRef | null;
  updated_at: string; // ISO 8601 时间字符串
}

/**
 * 工具显示名称映射
 */
export const TOOL_NAMES: Record<ToolId, string> = {
  'claude-code': 'Claude Code',
  codex: 'CodeX',
  'gemini-cli': 'Gemini CLI',
  'amp-code': 'AMP Code',
};

/**
 * 工具颜色映射（用于 UI 区分）
 */
export const TOOL_COLORS: Record<ToolId, string> = {
  'claude-code': 'bg-orange-500',
  codex: 'bg-green-500',
  'gemini-cli': 'bg-blue-500',
  'amp-code': 'bg-purple-500',
};

/**
 * Profile 表单数据
 */
export interface ProfileFormData {
  name: string;
  api_key: string;
  base_url: string;
  // Codex 特定
  wire_api?: string;
  // Gemini 特定
  model?: string;
}

/**
 * Profile 操作类型
 */
export type ProfileOperation = 'create' | 'edit' | 'delete' | 'activate';

/**
 * Profile 分组（按工具，仅可创建 profile 的工具）
 */
export interface ProfileGroup {
  tool_id: ProfileToolId;
  tool_name: string;
  profiles: ProfileDescriptor[];
  active_profile?: ProfileDescriptor;
}
