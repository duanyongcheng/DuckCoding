//! 配置服务共享类型定义

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use serde_json::Value;

/// Codex 配置 Payload
#[derive(Serialize, Deserialize)]
pub struct CodexSettingsPayload {
    pub config: Value,
    #[serde(rename = "authToken")]
    pub auth_token: Option<String>,
}

/// Claude Code 配置 Payload
#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ClaudeSettingsPayload {
    pub settings: Value,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub extra_config: Option<Value>,
}

/// Gemini CLI 环境变量 Payload
#[derive(Serialize, Deserialize, Debug, Clone, Default)]
pub struct GeminiEnvPayload {
    pub api_key: String,
    pub base_url: String,
    pub model: String,
}

/// Gemini CLI 配置 Payload
#[derive(Serialize, Deserialize)]
pub struct GeminiSettingsPayload {
    pub settings: Value,
    pub env: GeminiEnvPayload,
}

/// 外部配置变更事件
#[derive(Debug, Clone, Serialize)]
pub struct ExternalConfigChange {
    pub tool_id: String,
    pub path: String,
    pub checksum: Option<String>,
    pub detected_at: DateTime<Utc>,
    pub dirty: bool,
}

/// 导入外部变更的结果
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportExternalChangeResult {
    pub profile_name: String,
    pub was_new: bool,
    pub replaced: bool,
    pub before_checksum: Option<String>,
    pub checksum: Option<String>,
}
