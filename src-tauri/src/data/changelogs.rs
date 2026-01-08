//! 配置变更日志模块
//!
//! 记录所有配置变更的历史，包含变更前后的值

use anyhow::Result;
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use serde_json::Value as JsonValue;
use std::collections::HashMap;
use std::path::PathBuf;

/// 变更日志文件名
const CHANGE_LOG_FILE: &str = "config_watch_logs.json";

/// 单条变更记录
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ConfigChangeRecord {
    /// 工具 ID
    pub tool_id: String,
    /// 变更时间
    pub timestamp: DateTime<Utc>,
    /// 变更字段列表
    pub changed_fields: Vec<String>,
    /// 是否包含敏感字段
    pub is_sensitive: bool,
    /// 变更前的值（字段路径 -> 值）
    #[serde(default, skip_serializing_if = "HashMap::is_empty")]
    pub before_values: HashMap<String, JsonValue>,
    /// 变更后的值（字段路径 -> 值）
    #[serde(default, skip_serializing_if = "HashMap::is_empty")]
    pub after_values: HashMap<String, JsonValue>,
    /// 用户操作（allow/block/superseded/expired）
    pub action: Option<String>,
}

/// 变更日志存储
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct ChangeLogStore {
    /// 变更记录列表（按时间倒序）
    pub records: Vec<ConfigChangeRecord>,
}

impl ChangeLogStore {
    /// 最大日志条数
    const MAX_RECORDS: usize = 100;

    /// 获取日志文件路径
    pub fn file_path() -> Result<PathBuf> {
        let config_dir = crate::utils::config::config_dir()
            .map_err(|e| anyhow::anyhow!("无法获取配置目录: {}", e))?;
        Ok(config_dir.join(CHANGE_LOG_FILE))
    }

    /// 读取日志
    pub fn load() -> Result<Self> {
        use crate::data::DataManager;

        let path = Self::file_path()?;
        if !path.exists() {
            return Ok(Self::default());
        }

        let manager = DataManager::new();
        let value = manager.json().read(&path)?;
        let store: Self = serde_json::from_value(value)?;
        Ok(store)
    }

    /// 保存日志
    pub fn save(&self) -> Result<()> {
        use crate::data::DataManager;

        let path = Self::file_path()?;
        let manager = DataManager::new();
        let value = serde_json::to_value(self)?;
        manager.json().write(&path, &value)?;
        Ok(())
    }

    /// 添加变更记录
    pub fn add_record(&mut self, record: ConfigChangeRecord) {
        // 检查同一工具是否有待处理的记录，如果有则标记为已累加
        if let Some(last_pending) = self
            .records
            .iter_mut()
            .find(|r| r.tool_id == record.tool_id && r.action.is_none())
        {
            last_pending.action = Some("superseded".to_string());
        }

        // 插入到开头（最新的在前面）
        self.records.insert(0, record);

        // 限制日志条数
        if self.records.len() > Self::MAX_RECORDS {
            self.records.truncate(Self::MAX_RECORDS);
        }
    }

    /// 更新指定工具的最新待处理记录的操作状态
    pub fn update_action(&mut self, tool_id: &str, action: &str) -> Result<()> {
        if let Some(record) = self
            .records
            .iter_mut()
            .find(|r| r.tool_id == tool_id && r.action.is_none())
        {
            record.action = Some(action.to_string());
            Ok(())
        } else {
            Err(anyhow::anyhow!("未找到待处理的变更记录"))
        }
    }

    /// 标记所有待处理的记录为已过期
    pub fn mark_pending_as_expired(&mut self) {
        for record in self.records.iter_mut() {
            if record.action.is_none() {
                record.action = Some("expired".to_string());
            }
        }
    }

    /// 分页获取记录
    pub fn get_page(&self, page: usize, page_size: usize) -> (Vec<ConfigChangeRecord>, usize) {
        let total = self.records.len();
        let start = page * page_size;

        if start >= total {
            return (vec![], total);
        }

        let end = (start + page_size).min(total);
        let records = self.records[start..end].to_vec();
        (records, total)
    }

    /// 获取指定工具的最近 N 条记录
    pub fn get_recent(&self, tool_id: Option<&str>, limit: usize) -> Vec<&ConfigChangeRecord> {
        self.records
            .iter()
            .filter(|r| tool_id.is_none_or(|id| r.tool_id == id))
            .take(limit)
            .collect()
    }

    /// 清除指定工具的所有记录
    pub fn clear_for_tool(&mut self, tool_id: &str) {
        self.records.retain(|r| r.tool_id != tool_id);
    }

    /// 清除所有记录
    pub fn clear_all(&mut self) {
        self.records.clear();
    }
}
