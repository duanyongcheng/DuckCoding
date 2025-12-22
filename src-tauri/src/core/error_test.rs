//! AppError 序列化测试

#[cfg(test)]
mod tests {
    use crate::core::error::AppError;
    use serde_json;

    #[test]
    fn test_tool_not_found_serialization() {
        let error = AppError::ToolNotFound {
            tool: "claude-code".to_string(),
        };
        let json = serde_json::to_string(&error).unwrap();
        assert!(json.contains("ToolNotFound"));
        assert!(json.contains("claude-code"));
    }

    #[test]
    fn test_config_read_error_serialization() {
        let io_error = std::io::Error::new(std::io::ErrorKind::NotFound, "file not found");
        let error = AppError::ConfigReadError {
            path: "/test/path".to_string(),
            source: io_error,
        };
        let json = serde_json::to_string(&error).unwrap();
        assert!(json.contains("ConfigReadError"));
        assert!(json.contains("/test/path"));
        assert!(json.contains("error")); // source 字段被转换为 error
    }

    #[test]
    fn test_custom_error_serialization() {
        let error = AppError::Custom("测试错误信息".to_string());
        let json = serde_json::to_string(&error).unwrap();
        assert!(json.contains("Custom"));
        assert!(json.contains("测试错误信息"));
    }

    #[test]
    fn test_validation_error_serialization() {
        let error = AppError::ValidationError {
            field: "api_key".to_string(),
            reason: "不能为空".to_string(),
        };
        let json = serde_json::to_string(&error).unwrap();
        assert!(json.contains("ValidationError"));
        assert!(json.contains("api_key"));
        assert!(json.contains("不能为空"));
    }

    #[test]
    fn test_json_parse_error_serialization() {
        let json_error = serde_json::from_str::<serde_json::Value>("invalid json").unwrap_err();
        let error = AppError::JsonParseError {
            context: "测试上下文".to_string(),
            source: json_error,
        };
        let json = serde_json::to_string(&error).unwrap();
        assert!(json.contains("JsonParseError"));
        assert!(json.contains("测试上下文"));
        assert!(json.contains("error")); // source 字段被转换为 error
    }

    #[test]
    fn test_profile_not_found_serialization() {
        let error = AppError::ProfileNotFound {
            profile: "my-profile".to_string(),
        };
        let json = serde_json::to_string(&error).unwrap();
        assert!(json.contains("ProfileNotFound"));
        assert!(json.contains("my-profile"));
    }
}
