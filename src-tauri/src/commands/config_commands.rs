// 配置管理相关命令

use serde_json::Value;

use ::duckcoding::services::config::{
    claude, codex, gemini, ClaudeSettingsPayload, CodexSettingsPayload, GeminiEnvPayload,
    GeminiSettingsPayload,
};
use ::duckcoding::services::proxy::config::apply_global_proxy;
use ::duckcoding::utils::config::{read_global_config, write_global_config};
use ::duckcoding::GlobalConfig;

// ==================== 类型定义 ====================

// ==================== Token 生成类型 ====================

#[derive(serde::Deserialize, Debug)]
struct TokenData {
    id: i64,
    key: String,
    #[allow(dead_code)]
    name: String,
    #[allow(dead_code)]
    group: String,
}

#[derive(serde::Deserialize, Debug)]
struct ApiResponse {
    success: bool,
    message: String,
    data: Option<Vec<TokenData>>,
}

#[derive(serde::Serialize)]
pub struct GenerateApiKeyResult {
    success: bool,
    message: String,
    api_key: Option<String>,
}

// ==================== 辅助函数 ====================

fn build_reqwest_client() -> Result<reqwest::Client, String> {
    ::duckcoding::http_client::build_client()
}

// ==================== Tauri 命令 ====================

#[tauri::command]
pub async fn save_global_config(config: GlobalConfig) -> Result<(), String> {
    write_global_config(&config)
}

/// 更新 Token 统计配置（部分更新，避免竞态条件）
#[tauri::command]
pub async fn update_token_stats_config(
    config: ::duckcoding::models::config::TokenStatsConfig,
) -> Result<(), String> {
    use ::duckcoding::utils::config::{read_global_config, write_global_config};

    // 读取当前配置
    let mut global_config = read_global_config()?.ok_or_else(|| "全局配置不存在".to_string())?;

    // 仅更新 token_stats_config 字段
    global_config.token_stats_config = config;

    // 写回配置
    write_global_config(&global_config)
}

#[tauri::command]
pub async fn get_global_config() -> Result<Option<GlobalConfig>, String> {
    read_global_config()
}

#[tauri::command]
pub async fn generate_api_key_for_tool(tool: String) -> Result<GenerateApiKeyResult, String> {
    // 应用代理配置（如果已配置）
    apply_global_proxy().ok();

    // 读取全局配置
    let global_config = get_global_config()
        .await?
        .ok_or("请先配置用户ID和系统访问令牌")?;

    // 检查已废弃的用户凭证（现由 Provider 系统管理）
    let user_id = global_config
        .user_id
        .as_ref()
        .ok_or("请先配置用户ID（已废弃，建议使用供应商管理功能）")?;
    let system_token = global_config
        .system_token
        .as_ref()
        .ok_or("请先配置系统访问令牌（已废弃，建议使用供应商管理功能）")?;

    // 根据工具名称获取配置
    let (name, group) = match tool.as_str() {
        "claude-code" => ("Claude Code一键创建", "Claude Code专用"),
        "codex" => ("CodeX一键创建", "CodeX专用"),
        "gemini-cli" => ("Gemini CLI一键创建", "Gemini CLI专用"),
        _ => return Err(format!("Unknown tool: {tool}")),
    };

    // 创建token
    let client = build_reqwest_client().map_err(|e| format!("创建 HTTP 客户端失败: {e}"))?;
    let create_url = "https://duckcoding.com/api/token";

    let create_body = serde_json::json!({
        "remain_quota": 500000,
        "expired_time": -1,
        "unlimited_quota": true,
        "model_limits_enabled": false,
        "model_limits": "",
        "name": name,
        "group": group,
        "allow_ips": ""
    });

    let create_response = client
        .post(create_url)
        .header("Authorization", format!("Bearer {}", system_token))
        .header("New-Api-User", user_id)
        .header("Content-Type", "application/json")
        .json(&create_body)
        .send()
        .await
        .map_err(|e| format!("创建token失败: {e}"))?;

    if !create_response.status().is_success() {
        let status = create_response.status();
        let error_text = create_response.text().await.unwrap_or_default();
        return Ok(GenerateApiKeyResult {
            success: false,
            message: format!("创建token失败 ({status}): {error_text}"),
            api_key: None,
        });
    }

    // 等待一小段时间让服务器处理
    tokio::time::sleep(tokio::time::Duration::from_millis(500)).await;

    // 搜索刚创建的token
    let search_url = format!(
        "https://duckcoding.com/api/token/search?keyword={}",
        urlencoding::encode(name)
    );

    let search_response = client
        .get(&search_url)
        .header("Authorization", format!("Bearer {}", system_token))
        .header("New-Api-User", user_id)
        .header("Content-Type", "application/json")
        .send()
        .await
        .map_err(|e| format!("搜索token失败: {e}"))?;

    if !search_response.status().is_success() {
        return Ok(GenerateApiKeyResult {
            success: false,
            message: "创建成功但获取API Key失败，请稍后在DuckCoding控制台查看".to_string(),
            api_key: None,
        });
    }

    let api_response: ApiResponse = search_response
        .json()
        .await
        .map_err(|e| format!("解析响应失败: {e}"))?;

    if !api_response.success {
        return Ok(GenerateApiKeyResult {
            success: false,
            message: format!("API返回错误: {}", api_response.message),
            api_key: None,
        });
    }

    // 获取id最大的token（最新创建的）
    if let Some(mut data) = api_response.data {
        if !data.is_empty() {
            // 按id降序排序，取第一个（id最大的）
            data.sort_by(|a, b| b.id.cmp(&a.id));
            let token = &data[0];
            let api_key = format!("sk-{}", token.key);
            return Ok(GenerateApiKeyResult {
                success: true,
                message: "API Key生成成功".to_string(),
                api_key: Some(api_key),
            });
        }
    }

    Ok(GenerateApiKeyResult {
        success: false,
        message: "未找到生成的token".to_string(),
        api_key: None,
    })
}

#[tauri::command]
pub fn get_claude_settings() -> Result<ClaudeSettingsPayload, String> {
    claude::read_claude_settings()
        .map(|settings| {
            let extra = claude::read_claude_extra_config().ok();
            ClaudeSettingsPayload {
                settings,
                extra_config: extra,
            }
        })
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn save_claude_settings(settings: Value, extra_config: Option<Value>) -> Result<(), String> {
    claude::save_claude_settings(&settings, extra_config.as_ref()).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_claude_schema() -> Result<Value, String> {
    claude::get_claude_schema().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_codex_settings() -> Result<CodexSettingsPayload, String> {
    codex::read_codex_settings().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn save_codex_settings(settings: Value, auth_token: Option<String>) -> Result<(), String> {
    codex::save_codex_settings(&settings, auth_token).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_codex_schema() -> Result<Value, String> {
    codex::get_codex_schema().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_gemini_settings() -> Result<GeminiSettingsPayload, String> {
    gemini::read_gemini_settings().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn save_gemini_settings(settings: Value, env: GeminiEnvPayload) -> Result<(), String> {
    gemini::save_gemini_settings(&settings, &env).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_gemini_schema() -> Result<Value, String> {
    gemini::get_gemini_schema().map_err(|e| e.to_string())
}

// ==================== 单实例模式配置命令 ====================

/// 获取单实例模式配置状态
#[tauri::command]
pub async fn get_single_instance_config() -> Result<bool, String> {
    let config = read_global_config()
        .map_err(|e| format!("读取配置失败: {e}"))?
        .ok_or("配置文件不存在")?;
    Ok(config.single_instance_enabled)
}

/// 更新单实例模式配置（需要重启应用生效）
#[tauri::command]
pub async fn update_single_instance_config(enabled: bool) -> Result<(), String> {
    let mut config = read_global_config()
        .map_err(|e| format!("读取配置失败: {e}"))?
        .ok_or("配置文件不存在")?;

    config.single_instance_enabled = enabled;

    write_global_config(&config).map_err(|e| format!("保存配置失败: {e}"))?;

    tracing::info!(enabled = enabled, "单实例模式配置已更新（需重启生效）");

    Ok(())
}

// ==================== 配置监听命令 ====================

/// 阻止外部变更（恢复到快照）
///
/// # Arguments
///
/// * `tool_id` - 工具 ID
///
/// # Returns
///
/// 操作成功返回 Ok
#[tauri::command]
pub fn block_external_change(tool_id: String) -> Result<(), String> {
    use ::duckcoding::data::snapshots;
    use ::duckcoding::data::DataManager;
    use ::duckcoding::models::Tool;

    // 获取快照
    let snapshot = snapshots::get_snapshot(&tool_id)
        .map_err(|e| format!("读取快照失败: {}", e))?
        .ok_or_else(|| "没有可用的配置快照".to_string())?;

    // 获取工具定义
    let tool = Tool::by_id(&tool_id).ok_or_else(|| format!("未找到工具: {}", tool_id))?;
    let manager = DataManager::new();

    // 恢复所有配置文件
    for (filename, content) in &snapshot.files {
        let config_path = tool.config_dir.join(filename);

        if filename.ends_with(".json") {
            // JSON 文件：直接写入
            manager
                .json_uncached()
                .write(&config_path, content)
                .map_err(|e| format!("恢复 {} 失败: {}", filename, e))?;
        } else if filename.ends_with(".toml") {
            // TOML 文件：将 JSON 转换回 TOML
            let toml_value: toml::Value = serde_json::from_value(content.clone())
                .map_err(|e| format!("JSON 转 TOML 失败: {}", e))?;
            let toml_str =
                toml::to_string(&toml_value).map_err(|e| format!("TOML 序列化失败: {}", e))?;
            std::fs::write(&config_path, toml_str)
                .map_err(|e| format!("写入 {} 失败: {}", filename, e))?;
        } else if filename.ends_with(".env") || filename == ".env" {
            // ENV 文件：将 JSON 转换回键值对
            let env_map: std::collections::HashMap<String, String> =
                serde_json::from_value(content.clone())
                    .map_err(|e| format!("JSON 转 ENV 失败: {}", e))?;
            manager
                .env()
                .write(&config_path, &env_map)
                .map_err(|e| format!("恢复 {} 失败: {}", filename, e))?;
        } else {
            tracing::warn!("不支持的配置文件格式: {}", filename);
        }
    }

    // 更新日志记录
    use ::duckcoding::data::changelogs::ChangeLogStore;
    let mut store = ChangeLogStore::load().map_err(|e| format!("加载日志失败: {}", e))?;
    if let Err(e) = store.update_action(&tool_id, "block") {
        tracing::warn!("更新日志记录失败: {}", e);
    } else {
        store.save().map_err(|e| format!("保存日志失败: {}", e))?;
    }

    tracing::info!(tool_id = %tool_id, "已阻止外部变更并恢复所有配置文件");

    Ok(())
}

/// 允许外部变更（更新快照）
///
/// # Arguments
///
/// * `tool_id` - 工具 ID
///
/// # Returns
///
/// 操作成功返回 Ok
#[tauri::command]
pub fn allow_external_change(tool_id: String) -> Result<(), String> {
    use ::duckcoding::models::Tool;

    let tool = Tool::by_id(&tool_id).ok_or_else(|| format!("未找到工具: {}", tool_id))?;

    // 重新保存快照（读取所有配置文件）
    ::duckcoding::services::config::watcher::save_snapshot_for_tool(&tool)
        .map_err(|e| format!("保存快照失败: {}", e))?;

    // 更新日志记录
    use ::duckcoding::data::changelogs::ChangeLogStore;
    let mut store = ChangeLogStore::load().map_err(|e| format!("加载日志失败: {}", e))?;
    if let Err(e) = store.update_action(&tool_id, "allow") {
        tracing::warn!("更新日志记录失败: {}", e);
    } else {
        store.save().map_err(|e| format!("保存日志失败: {}", e))?;
    }

    tracing::info!(tool_id = %tool_id, "已允许外部变更并更新所有配置文件快照");

    Ok(())
}

/// 获取监听配置
#[tauri::command]
pub fn get_watch_config() -> Result<::duckcoding::models::config::ConfigWatchConfig, String> {
    let config = read_global_config()
        .map_err(|e| format!("读取配置失败: {e}"))?
        .ok_or("配置文件不存在")?;
    Ok(config.config_watch)
}

/// 更新监听配置
#[tauri::command]
pub fn update_watch_config(
    config: ::duckcoding::models::config::ConfigWatchConfig,
) -> Result<(), String> {
    let mut global_config = read_global_config()
        .map_err(|e| format!("读取配置失败: {e}"))?
        .ok_or("配置文件不存在")?;
    global_config.config_watch = config;
    write_global_config(&global_config).map_err(|e| format!("保存配置失败: {e}"))?;

    tracing::info!("配置监听配置已更新");

    Ok(())
}

// ==================== 配置守护管理命令 ====================

/// 更新敏感字段配置
///
/// # Arguments
///
/// * `tool_id` - 工具 ID
/// * `fields` - 敏感字段列表
#[tauri::command]
pub fn update_sensitive_fields(tool_id: String, fields: Vec<String>) -> Result<(), String> {
    let mut config = read_global_config()
        .map_err(|e| format!("读取配置失败: {e}"))?
        .ok_or("配置文件不存在")?;

    config
        .config_watch
        .sensitive_fields
        .insert(tool_id.clone(), fields);

    write_global_config(&config).map_err(|e| format!("保存配置失败: {e}"))?;

    tracing::info!(tool_id = %tool_id, "敏感字段配置已更新");

    Ok(())
}

/// 更新黑名单配置
///
/// # Arguments
///
/// * `tool_id` - 工具 ID
/// * `fields` - 黑名单字段列表
#[tauri::command]
pub fn update_blacklist(tool_id: String, fields: Vec<String>) -> Result<(), String> {
    let mut config = read_global_config()
        .map_err(|e| format!("读取配置失败: {e}"))?
        .ok_or("配置文件不存在")?;

    config
        .config_watch
        .blacklist
        .insert(tool_id.clone(), fields);

    write_global_config(&config).map_err(|e| format!("保存配置失败: {e}"))?;

    tracing::info!(tool_id = %tool_id, "黑名单配置已更新");

    Ok(())
}

/// 获取默认敏感字段配置
#[tauri::command]
pub fn get_default_sensitive_fields(
) -> Result<std::collections::HashMap<String, Vec<String>>, String> {
    use ::duckcoding::models::config::default_sensitive_fields;
    Ok(default_sensitive_fields())
}

/// 获取默认黑名单配置
#[tauri::command]
pub fn get_default_blacklist() -> Result<std::collections::HashMap<String, Vec<String>>, String> {
    use ::duckcoding::models::config::default_watch_blacklist;
    Ok(default_watch_blacklist())
}

// ==================== 变更日志管理命令 ====================

/// 获取配置变更日志
///
/// # Arguments
///
/// * `tool_id` - 工具 ID（可选，不传则返回所有工具的日志）
/// * `limit` - 返回条数限制（默认 50）
#[tauri::command]
pub fn get_change_logs(
    tool_id: Option<String>,
    limit: Option<usize>,
) -> Result<Vec<::duckcoding::data::changelogs::ConfigChangeRecord>, String> {
    use ::duckcoding::data::changelogs::ChangeLogStore;

    let store = ChangeLogStore::load().map_err(|e| format!("读取日志失败: {e}"))?;
    let limit = limit.unwrap_or(50);
    let tool_id_ref = tool_id.as_deref();

    let records: Vec<_> = store
        .get_recent(tool_id_ref, limit)
        .into_iter()
        .cloned()
        .collect();

    Ok(records)
}

/// 分页获取配置变更日志
///
/// # Arguments
///
/// * `page` - 页码（从 0 开始）
/// * `page_size` - 每页条数
///
/// # Returns
///
/// 返回 (records, total) 元组
#[tauri::command]
pub fn get_change_logs_page(
    page: usize,
    page_size: usize,
) -> Result<
    (
        Vec<::duckcoding::data::changelogs::ConfigChangeRecord>,
        usize,
    ),
    String,
> {
    use ::duckcoding::data::changelogs::ChangeLogStore;

    let store = ChangeLogStore::load().map_err(|e| format!("读取日志失败: {e}"))?;
    let (records, total) = store.get_page(page, page_size);

    Ok((records, total))
}

/// 清除配置变更日志
///
/// # Arguments
///
/// * `tool_id` - 工具 ID（可选，不传则清除所有日志）
#[tauri::command]
pub fn clear_change_logs(tool_id: Option<String>) -> Result<(), String> {
    use ::duckcoding::data::changelogs::ChangeLogStore;

    let mut store = ChangeLogStore::load().map_err(|e| format!("读取日志失败: {e}"))?;

    if let Some(id) = tool_id {
        store.clear_for_tool(&id);
        tracing::info!(tool_id = %id, "已清除工具变更日志");
    } else {
        store.clear_all();
        tracing::info!("已清除所有变更日志");
    }

    store.save().map_err(|e| format!("保存日志失败: {e}"))?;

    Ok(())
}

/// 更新变更日志的用户操作
///
/// # Arguments
///
/// * `tool_id` - 工具 ID
/// * `timestamp` - 变更时间戳（ISO 8601 格式）
/// * `action` - 用户操作（allow/block）
#[tauri::command]
pub fn update_change_log_action(
    tool_id: String,
    timestamp: String,
    action: String,
) -> Result<(), String> {
    use ::duckcoding::data::changelogs::ChangeLogStore;
    use chrono::{DateTime, Utc};

    let mut store = ChangeLogStore::load().map_err(|e| format!("读取日志失败: {e}"))?;
    let ts: DateTime<Utc> = timestamp
        .parse()
        .map_err(|e| format!("时间戳格式错误: {e}"))?;

    // 查找并更新记录
    if let Some(record) = store
        .records
        .iter_mut()
        .find(|r| r.tool_id == tool_id && r.timestamp == ts)
    {
        record.action = Some(action.clone());
        store.save().map_err(|e| format!("保存日志失败: {e}"))?;
        tracing::info!(
            tool_id = %tool_id,
            action = %action,
            "变更日志操作已更新"
        );
        Ok(())
    } else {
        Err("未找到匹配的变更记录".to_string())
    }
}
