// 会话管理 Tauri 命令

use crate::commands::error::AppResult;
use duckcoding::services::session::{SessionListResponse, SESSION_MANAGER};

/// 获取会话列表
#[tauri::command]
pub async fn get_session_list(
    tool_id: String,
    page: usize,
    page_size: usize,
) -> AppResult<SessionListResponse> {
    Ok(SESSION_MANAGER.get_session_list(&tool_id, page, page_size)?)
}

/// 删除单个会话
#[tauri::command]
pub async fn delete_session(session_id: String) -> AppResult<()> {
    Ok(SESSION_MANAGER.delete_session(&session_id)?)
}

/// 清空指定工具的所有会话
#[tauri::command]
pub async fn clear_all_sessions(tool_id: String) -> AppResult<()> {
    Ok(SESSION_MANAGER.clear_sessions(&tool_id)?)
}

/// 更新会话配置
#[tauri::command]
pub async fn update_session_config(
    session_id: String,
    config_name: String,
    custom_profile_name: Option<String>,
    url: String,
    api_key: String,
    pricing_template_id: Option<String>, // Phase 6: 价格模板
) -> AppResult<()> {
    Ok(SESSION_MANAGER.update_session_config(
        &session_id,
        &config_name,
        custom_profile_name.as_deref(),
        &url,
        &api_key,
        pricing_template_id.as_deref(),
    )?)
}

/// 更新会话备注
#[tauri::command]
pub async fn update_session_note(session_id: String, note: Option<String>) -> AppResult<()> {
    Ok(SESSION_MANAGER.update_session_note(&session_id, note.as_deref())?)
}
