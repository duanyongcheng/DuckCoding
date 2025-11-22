// Claude Code 请求处理器

use super::{ProcessedRequest, RequestProcessor};
use anyhow::Result;
use async_trait::async_trait;
use bytes::Bytes;
use hyper::HeaderMap as HyperHeaderMap;
use reqwest::header::HeaderMap as ReqwestHeaderMap;

/// Claude Code 专用请求处理器
///
/// 处理 Anthropic Claude API 的请求转换：
/// - URL 构建：使用标准拼接（无特殊逻辑）
/// - 认证方式：Bearer Token
/// - Authorization header 格式：`Bearer sk-ant-xxx`
pub struct ClaudeHeadersProcessor;

#[async_trait]
impl RequestProcessor for ClaudeHeadersProcessor {
    fn tool_id(&self) -> &str {
        "claude-code"
    }

    async fn process_outgoing_request(
        &self,
        base_url: &str,
        api_key: &str,
        path: &str,
        query: Option<&str>,
        original_headers: &HyperHeaderMap,
        body: &[u8],
    ) -> Result<ProcessedRequest> {
        // 1. 构建目标 URL（标准拼接）
        let base = base_url.trim_end_matches('/');
        let query_str = query.map(|q| format!("?{}", q)).unwrap_or_default();
        let target_url = format!("{}{}{}", base, path, query_str);

        // 2. 处理 headers（复制非认证 headers）
        let mut headers = ReqwestHeaderMap::new();
        for (name, value) in original_headers.iter() {
            let name_str = name.as_str();
            // 跳过认证相关和 Host headers
            if name_str.eq_ignore_ascii_case("host")
                || name_str.eq_ignore_ascii_case("authorization")
                || name_str.eq_ignore_ascii_case("x-api-key")
            {
                continue;
            }
            headers.insert(name.clone(), value.clone());
        }

        // 3. 添加真实的 API Key
        headers.insert(
            "authorization",
            format!("Bearer {}", api_key)
                .parse()
                .map_err(|e| anyhow::anyhow!("Invalid authorization header: {}", e))?,
        );

        // 4. 返回处理后的请求
        Ok(ProcessedRequest {
            target_url,
            headers,
            body: Bytes::copy_from_slice(body),
        })
    }

    // Claude Code 不需要特殊的响应处理
    // 使用默认实现即可
}
