use crate::commands::error::{AppError, AppResult};
use ::duckcoding::ui;
use tauri::{Manager, WebviewWindow};

/// 处理窗口关闭操作
///
/// # 参数
/// - `window`: WebviewWindow 实例
/// - `action`: 关闭操作类型 ("minimize" 或 "quit")
#[tauri::command]
pub fn handle_close_action(window: WebviewWindow, action: String) -> AppResult<()> {
    match action.as_str() {
        "minimize" => {
            // 隐藏到托盘
            ui::hide_window_to_tray(&window);
            Ok(())
        }
        "quit" => {
            window.app_handle().exit(0);
            Ok(())
        }
        other => Err(AppError::ValidationError {
            field: "action".to_string(),
            reason: format!("未知的关闭操作: {}", other),
        }),
    }
}
