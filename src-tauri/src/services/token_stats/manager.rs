use crate::models::token_stats::{SessionStats, TokenLog, TokenLogsPage, TokenStatsQuery};
use crate::services::token_stats::db::TokenStatsDb;
use crate::services::token_stats::extractor::{
    create_extractor, MessageDeltaData, MessageStartData, ResponseTokenInfo,
};
use crate::utils::config_dir;
use anyhow::{Context, Result};
use once_cell::sync::OnceCell;
use serde_json::Value;
use std::path::PathBuf;

/// 全局 TokenStatsManager 单例
static TOKEN_STATS_MANAGER: OnceCell<TokenStatsManager> = OnceCell::new();

/// 响应数据类型
pub enum ResponseData {
    /// SSE流式响应（收集的所有data块）
    Sse(Vec<String>),
    /// JSON响应
    Json(Value),
}

/// Token统计管理器
pub struct TokenStatsManager {
    db: TokenStatsDb,
}

impl TokenStatsManager {
    /// 获取全局单例实例
    pub fn get() -> &'static TokenStatsManager {
        TOKEN_STATS_MANAGER.get_or_init(|| {
            let db_path = Self::default_db_path();
            let db = TokenStatsDb::new(db_path);

            // 初始化数据库表
            if let Err(e) = db.init_table() {
                eprintln!("Failed to initialize token stats database: {}", e);
            }

            TokenStatsManager { db }
        })
    }

    /// 获取默认数据库路径
    fn default_db_path() -> PathBuf {
        config_dir()
            .map(|dir| dir.join("token_stats.db"))
            .unwrap_or_else(|_| PathBuf::from("token_stats.db"))
    }

    /// 记录请求日志
    ///
    /// # 参数
    ///
    /// - `tool_type`: 工具类型（claude_code/codex/gemini_cli）
    /// - `session_id`: 会话ID
    /// - `config_name`: 使用的配置名称
    /// - `client_ip`: 客户端IP地址
    /// - `request_body`: 请求体（用于提取model）
    /// - `response_data`: 响应数据（SSE流或JSON）
    pub async fn log_request(
        &self,
        tool_type: &str,
        session_id: &str,
        config_name: &str,
        client_ip: &str,
        request_body: &[u8],
        response_data: ResponseData,
    ) -> Result<()> {
        // 创建提取器
        let extractor = create_extractor(tool_type).context("Failed to create token extractor")?;

        // 提取请求中的模型名称
        let model = extractor
            .extract_model_from_request(request_body)
            .context("Failed to extract model from request")?;

        // 提取响应中的Token信息
        let token_info = match response_data {
            ResponseData::Sse(chunks) => self.parse_sse_chunks(&*extractor, chunks)?,
            ResponseData::Json(json) => extractor.extract_from_json(&json)?,
        };

        // 创建日志记录
        let timestamp = chrono::Utc::now().timestamp_millis();
        let log = TokenLog::new(
            tool_type.to_string(),
            timestamp,
            client_ip.to_string(),
            session_id.to_string(),
            config_name.to_string(),
            model,
            Some(token_info.message_id),
            token_info.input_tokens,
            token_info.output_tokens,
            token_info.cache_creation_tokens,
            token_info.cache_read_tokens,
        );

        // 插入数据库（异步执行，不阻塞代理响应）
        let db = self.db.clone();
        tokio::task::spawn_blocking(move || {
            if let Err(e) = db.insert_log(&log) {
                eprintln!("Failed to insert token log: {}", e);
            }
        });

        Ok(())
    }

    /// 解析SSE流数据块
    fn parse_sse_chunks(
        &self,
        extractor: &dyn crate::services::token_stats::extractor::TokenExtractor,
        chunks: Vec<String>,
    ) -> Result<ResponseTokenInfo> {
        let mut message_start: Option<MessageStartData> = None;
        let mut message_delta: Option<MessageDeltaData> = None;

        for chunk in chunks {
            if let Some(data) = extractor
                .extract_from_sse_chunk(&chunk)
                .context("Failed to extract from SSE chunk")?
            {
                if let Some(start) = data.message_start {
                    message_start = Some(start);
                }
                if let Some(delta) = data.message_delta {
                    message_delta = Some(delta);
                }
            }
        }

        let start = message_start.context("Missing message_start in SSE stream")?;

        Ok(ResponseTokenInfo::from_sse_data(start, message_delta))
    }

    /// 查询会话实时统计
    pub fn get_session_stats(&self, tool_type: &str, session_id: &str) -> Result<SessionStats> {
        self.db.get_session_stats(tool_type, session_id)
    }

    /// 分页查询历史日志
    pub fn query_logs(&self, query: TokenStatsQuery) -> Result<TokenLogsPage> {
        self.db.query_logs(&query)
    }

    /// 根据配置清理旧数据
    pub fn cleanup_by_config(
        &self,
        retention_days: Option<u32>,
        max_count: Option<u32>,
    ) -> Result<usize> {
        self.db.cleanup_old_logs(retention_days, max_count)
    }

    /// 获取数据库统计摘要
    pub fn get_stats_summary(&self) -> Result<(i64, Option<i64>, Option<i64>)> {
        self.db.get_stats_summary()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[tokio::test]
    async fn test_log_request_with_json() {
        let manager = TokenStatsManager::get();

        let request_body = json!({
            "model": "claude-3-5-sonnet-20241022",
            "messages": []
        })
        .to_string();

        let response_json = json!({
            "id": "msg_test_123",
            "model": "claude-3-5-sonnet-20241022",
            "usage": {
                "input_tokens": 100,
                "output_tokens": 50,
                "cache_creation_input_tokens": 10,
                "cache_read_input_tokens": 20
            }
        });

        let result = manager
            .log_request(
                "claude_code",
                "test_session",
                "default",
                "127.0.0.1",
                request_body.as_bytes(),
                ResponseData::Json(response_json),
            )
            .await;

        assert!(result.is_ok());

        // 等待异步插入完成
        tokio::time::sleep(tokio::time::Duration::from_millis(100)).await;

        // 验证统计数据
        let stats = manager
            .get_session_stats("claude_code", "test_session")
            .unwrap();
        assert_eq!(stats.total_input, 100);
        assert_eq!(stats.total_output, 50);
    }

    #[test]
    fn test_parse_sse_chunks() {
        let manager = TokenStatsManager::get();
        let extractor = create_extractor("claude_code").unwrap();

        let chunks = vec![
            r#"data: {"type":"message_start","message":{"model":"claude-3","id":"msg_123","usage":{"input_tokens":1000,"output_tokens":1}}}"#.to_string(),
            r#"data: {"type":"message_delta","delta":{"stop_reason":"end_turn"},"usage":{"cache_creation_input_tokens":50,"cache_read_input_tokens":100,"output_tokens":200}}"#.to_string(),
        ];

        let info = manager.parse_sse_chunks(&*extractor, chunks).unwrap();
        assert_eq!(info.model, "claude-3");
        assert_eq!(info.message_id, "msg_123");
        assert_eq!(info.input_tokens, 1000);
        assert_eq!(info.output_tokens, 200);
        assert_eq!(info.cache_creation_tokens, 50);
        assert_eq!(info.cache_read_tokens, 100);
    }

    #[test]
    fn test_query_logs() {
        let manager = TokenStatsManager::get();

        // 插入测试数据
        let log = TokenLog::new(
            "claude_code".to_string(),
            chrono::Utc::now().timestamp_millis(),
            "127.0.0.1".to_string(),
            "test_query_session".to_string(),
            "default".to_string(),
            "claude-3".to_string(),
            Some("msg_query_test".to_string()),
            100,
            50,
            10,
            20,
        );
        manager.db.insert_log(&log).unwrap();

        // 查询日志
        let query = TokenStatsQuery {
            session_id: Some("test_query_session".to_string()),
            ..Default::default()
        };
        let page = manager.query_logs(query).unwrap();
        assert!(page.total >= 1);
    }
}
