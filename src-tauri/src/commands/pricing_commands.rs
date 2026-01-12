/// 价格配置管理命令
///
/// 提供价格模板的 CRUD 操作和工具默认模板管理
use duckcoding::models::pricing::PricingTemplate;
use duckcoding::services::pricing::PRICING_MANAGER;

use super::error::AppResult;

/// 列出所有价格模板
///
/// # 返回
///
/// 所有可用价格模板的列表
#[tauri::command]
pub async fn list_pricing_templates() -> AppResult<Vec<PricingTemplate>> {
    let templates = PRICING_MANAGER.list_templates()?;
    Ok(templates)
}

/// 获取指定价格模板
///
/// # 参数
///
/// - `template_id`: 模板 ID
///
/// # 返回
///
/// 价格模板详细信息
#[tauri::command]
pub async fn get_pricing_template(template_id: String) -> AppResult<PricingTemplate> {
    let template = PRICING_MANAGER.get_template(&template_id)?;
    Ok(template)
}

/// 保存价格模板（创建或更新）
///
/// # 参数
///
/// - `template`: 价格模板数据
///
/// # 注意
///
/// - 如果模板 ID 已存在，将覆盖现有模板
/// - 不允许覆盖内置预设模板（is_default_preset = true）
#[tauri::command]
pub async fn save_pricing_template(template: PricingTemplate) -> AppResult<()> {
    // 检查是否尝试覆盖内置模板
    if let Ok(existing) = PRICING_MANAGER.get_template(&template.id) {
        if existing.is_default_preset && !template.is_default_preset {
            return Err(anyhow::anyhow!("Cannot overwrite built-in preset template").into());
        }
    }

    PRICING_MANAGER.save_template(&template)?;
    Ok(())
}

/// 删除价格模板
///
/// # 参数
///
/// - `template_id`: 模板 ID
///
/// # 注意
///
/// - 不允许删除内置预设模板
#[tauri::command]
pub async fn delete_pricing_template(template_id: String) -> AppResult<()> {
    PRICING_MANAGER.delete_template(&template_id)?;
    Ok(())
}

/// 设置工具的默认价格模板
///
/// # 参数
///
/// - `tool_id`: 工具 ID（claude-code / codex / gemini-cli）
/// - `template_id`: 模板 ID
///
/// # 注意
///
/// - 模板必须存在才能设置为默认模板
#[tauri::command]
pub async fn set_default_template(tool_id: String, template_id: String) -> AppResult<()> {
    PRICING_MANAGER.set_default_template(&tool_id, &template_id)?;
    Ok(())
}

/// 获取工具的默认价格模板
///
/// # 参数
///
/// - `tool_id`: 工具 ID（claude-code / codex / gemini-cli）
///
/// # 返回
///
/// 该工具当前使用的默认价格模板
#[tauri::command]
pub async fn get_default_template(tool_id: String) -> AppResult<PricingTemplate> {
    let template = PRICING_MANAGER.get_default_template(&tool_id)?;
    Ok(template)
}
