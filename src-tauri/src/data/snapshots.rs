// 配置快照管理模块

use crate::data::DataManager;
use crate::models::config::ConfigSnapshot;
use anyhow::Result;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::PathBuf;

/// 快照存储结构
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct SnapshotStore {
    /// 按工具 ID 存储的快照
    pub snapshots: HashMap<String, ConfigSnapshot>,
}

/// 获取快照文件路径
fn snapshots_file() -> Result<PathBuf> {
    let config_dir = crate::utils::config::config_dir()
        .map_err(|e| anyhow::anyhow!("无法获取配置目录: {}", e))?;
    Ok(config_dir.join("config_snapshots.json"))
}

/// 读取所有快照
pub fn read_snapshots() -> Result<SnapshotStore> {
    let path = snapshots_file()?;
    if !path.exists() {
        return Ok(SnapshotStore::default());
    }

    let manager = DataManager::new();
    let value = manager.json().read(&path)?;
    let store: SnapshotStore = serde_json::from_value(value)?;
    Ok(store)
}

/// 保存所有快照
pub fn write_snapshots(store: &SnapshotStore) -> Result<()> {
    let path = snapshots_file()?;
    let manager = DataManager::new();
    let value = serde_json::to_value(store)?;
    manager.json().write(&path, &value)?;
    Ok(())
}

/// 获取单个工具的快照
pub fn get_snapshot(tool_id: &str) -> Result<Option<ConfigSnapshot>> {
    let store = read_snapshots()?;
    Ok(store.snapshots.get(tool_id).cloned())
}

/// 保存单个工具的快照（多文件版本）
pub fn save_snapshot_files(
    tool_id: &str,
    files: std::collections::HashMap<String, serde_json::Value>,
) -> Result<()> {
    let mut store = read_snapshots()?;
    let snapshot = ConfigSnapshot {
        tool_id: tool_id.to_string(),
        files,
        last_updated: chrono::Utc::now(),
    };
    store.snapshots.insert(tool_id.to_string(), snapshot);
    write_snapshots(&store)?;
    Ok(())
}

/// 保存单个工具的快照（单文件版本，用于向后兼容）
pub fn save_snapshot(tool_id: &str, content: serde_json::Value) -> Result<()> {
    let mut files = std::collections::HashMap::new();
    // 默认使用主配置文件名
    let filename = match tool_id {
        "claude-code" => "settings.json",
        "codex" => "config.toml",
        "gemini-cli" => "settings.json",
        _ => "config.json",
    };
    files.insert(filename.to_string(), content);
    save_snapshot_files(tool_id, files)
}

/// 删除单个工具的快照
pub fn delete_snapshot(tool_id: &str) -> Result<()> {
    let mut store = read_snapshots()?;
    store.snapshots.remove(tool_id);
    write_snapshots(&store)?;
    Ok(())
}

/// 清空所有快照
pub fn clear_snapshots() -> Result<()> {
    let store = SnapshotStore::default();
    write_snapshots(&store)?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn test_snapshot_crud() -> Result<()> {
        // 清空快照
        clear_snapshots()?;

        // 保存快照
        let content = json!({
            "env": {
                "API_KEY": "test_key"
            }
        });
        save_snapshot("claude-code", content.clone())?;

        // 读取快照
        let snapshot = get_snapshot("claude-code")?;
        assert!(snapshot.is_some());
        let snapshot = snapshot.unwrap();
        assert_eq!(snapshot.tool_id, "claude-code");

        // 检查快照内容（单文件模式，存储在 settings.json 键下）
        assert!(snapshot.files.contains_key("settings.json"));
        assert_eq!(snapshot.files.get("settings.json").unwrap(), &content);

        // 删除快照
        delete_snapshot("claude-code")?;
        let snapshot = get_snapshot("claude-code")?;
        assert!(snapshot.is_none());

        Ok(())
    }
}
