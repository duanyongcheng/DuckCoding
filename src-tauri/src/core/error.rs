use serde::Serialize;
use thiserror::Error;

/// 应用错误类型
///
/// 设计原则：
/// - 使用 thiserror 自动实现 Error trait
/// - 每个错误类型携带上下文信息
/// - 支持错误链（通过 #[from] 自动转换）
/// - 易于扩展（新增枚举变体即可）
/// - 实现 Serialize 以支持 Tauri 命令（source 字段会转为字符串）
#[derive(Debug, Error)]
pub enum AppError {
    // ==================== 工具相关错误 ====================
    /// 工具未找到
    #[error("工具 '{tool}' 未找到")]
    ToolNotFound { tool: String },

    /// 工具未安装
    #[error("工具 '{tool}' 未安装")]
    ToolNotInstalled { tool: String },

    /// 工具已安装
    #[error("工具 '{tool}' 已安装，版本: {version}")]
    ToolAlreadyInstalled { tool: String, version: String },

    /// 安装失败
    #[error("安装 '{tool}' 失败: {reason}")]
    InstallationFailed { tool: String, reason: String },

    /// 版本检查失败
    #[error("检查 '{tool}' 版本失败: {reason}")]
    VersionCheckFailed { tool: String, reason: String },

    // ==================== 配置相关错误 ====================
    /// 配置文件未找到
    #[error("配置文件未找到: {path}")]
    ConfigNotFound { path: String },

    /// 配置文件无效
    #[error("配置文件无效: {path}, 原因: {reason}")]
    InvalidConfig { path: String, reason: String },

    /// 配置文件读取失败
    #[error("读取配置文件失败: {path}")]
    ConfigReadError {
        path: String,
        #[source]
        source: std::io::Error,
    },

    /// 配置文件写入失败
    #[error("写入配置文件失败: {path}")]
    ConfigWriteError {
        path: String,
        #[source]
        source: std::io::Error,
    },

    /// Profile 未找到
    #[error("配置 Profile '{profile}' 未找到")]
    ProfileNotFound { profile: String },

    /// Profile 已存在
    #[error("配置 Profile '{profile}' 已存在")]
    ProfileAlreadyExists { profile: String },

    // ==================== 网络相关错误 ====================
    /// 网络请求失败
    #[error("网络请求失败: {url}")]
    NetworkError {
        url: String,
        #[source]
        source: reqwest::Error,
    },

    /// 代理配置错误
    #[error("代理配置错误: {reason}")]
    ProxyConfigError { reason: String },

    /// API 调用失败
    #[error("API 调用失败: {endpoint}, 状态码: {status_code}")]
    ApiError {
        endpoint: String,
        status_code: u16,
        body: String,
    },

    /// 下载失败
    #[error("下载文件失败: {url}")]
    DownloadError {
        url: String,
        #[source]
        source: reqwest::Error,
    },

    // ==================== 文件系统错误 ====================
    /// 文件未找到
    #[error("文件未找到: {path}")]
    FileNotFound { path: String },

    /// 目录创建失败
    #[error("创建目录失败: {path}")]
    DirCreationError {
        path: String,
        #[source]
        source: std::io::Error,
    },

    /// 权限错误
    #[error("权限不足: {path}, 操作: {operation}")]
    PermissionDenied { path: String, operation: String },

    // ==================== 解析错误 ====================
    /// JSON 解析错误
    #[error("JSON 解析失败: {context}")]
    JsonParseError {
        context: String,
        #[source]
        source: serde_json::Error,
    },

    /// TOML 解析错误
    #[error("TOML 解析失败: {context}")]
    TomlParseError {
        context: String,
        #[source]
        source: toml::de::Error,
    },

    /// TOML 序列化错误
    #[error("TOML 序列化失败: {context}")]
    TomlSerializeError {
        context: String,
        #[source]
        source: toml::ser::Error,
    },

    // ==================== 业务逻辑错误 ====================
    /// 环境检查失败
    #[error("环境检查失败: {requirement}")]
    EnvironmentError { requirement: String },

    /// 验证失败
    #[error("验证失败: {field}, 原因: {reason}")]
    ValidationError { field: String, reason: String },

    /// 操作超时
    #[error("操作超时: {operation}, 超时时间: {timeout_secs}秒")]
    Timeout {
        operation: String,
        timeout_secs: u64,
    },

    /// 功能未实现
    #[error("功能 '{feature}' 在 {platform} 平台上未实现")]
    Unimplemented { feature: String, platform: String },

    // ==================== 更新相关错误 ====================
    /// 更新检查失败
    #[error("检查更新失败: {reason}")]
    UpdateCheckFailed { reason: String },

    /// 更新下载失败
    #[error("下载更新失败: {version}")]
    UpdateDownloadFailed {
        version: String,
        #[source]
        source: Box<AppError>,
    },

    /// 更新安装失败
    #[error("安装更新失败: {reason}")]
    UpdateInstallFailed { reason: String },

    // ==================== 认证相关错误 ====================
    /// API Key 无效
    #[error("API Key 无效或已过期")]
    InvalidApiKey,

    /// 认证失败
    #[error("认证失败: {reason}")]
    AuthenticationFailed { reason: String },

    /// 权限不足（API 层面）
    #[error("权限不足: {resource}")]
    Forbidden { resource: String },

    // ==================== 通用错误 ====================
    /// 内部错误（不应该发生的错误）
    #[error("内部错误: {message}")]
    Internal { message: String },

    /// 自定义错误（用于不适合其他分类的错误）
    #[error("{0}")]
    Custom(String),

    /// 包装 anyhow::Error（用于第三方库错误）
    #[error(transparent)]
    Other(#[from] anyhow::Error),
}

// ==================== 错误扩展 trait ====================

/// 错误上下文扩展 trait
///
/// 提供便捷的错误上下文添加方法
pub trait ErrorContext<T> {
    /// 添加上下文信息
    fn context(self, context: impl Into<String>) -> Result<T, AppError>;

    /// 使用闭包添加上下文信息（懒加载）
    fn with_context<F>(self, f: F) -> Result<T, AppError>
    where
        F: FnOnce() -> String;
}

impl<T, E> ErrorContext<T> for Result<T, E>
where
    E: Into<AppError>,
{
    fn context(self, context: impl Into<String>) -> Result<T, AppError> {
        self.map_err(|e| {
            let err: AppError = e.into();
            AppError::Custom(format!("{}: {}", context.into(), err))
        })
    }

    fn with_context<F>(self, f: F) -> Result<T, AppError>
    where
        F: FnOnce() -> String,
    {
        self.map_err(|e| {
            let err: AppError = e.into();
            AppError::Custom(format!("{}: {}", f(), err))
        })
    }
}

// ==================== 标准库错误转换 ====================

impl From<std::io::Error> for AppError {
    fn from(err: std::io::Error) -> Self {
        AppError::Other(err.into())
    }
}

impl From<reqwest::Error> for AppError {
    fn from(err: reqwest::Error) -> Self {
        AppError::Other(err.into())
    }
}

impl From<serde_json::Error> for AppError {
    fn from(err: serde_json::Error) -> Self {
        AppError::JsonParseError {
            context: "未知上下文".to_string(),
            source: err,
        }
    }
}

// ==================== Tauri 错误转换 ====================

/// 实现从 AppError 到 String 的转换（Tauri commands 需要）
impl From<AppError> for String {
    fn from(err: AppError) -> String {
        err.to_string()
    }
}

// ==================== 类型别名 ====================

/// 统一的 Result 类型
pub type AppResult<T> = Result<T, AppError>;

// ==================== 辅助宏 ====================

/// 创建自定义错误的便捷宏
///
/// # 示例
/// ```rust
/// use duckcoding::app_error;
///
/// let tool_name = "claude-code";
/// app_error!("工具 {} 安装失败", tool_name);
/// ```
#[macro_export]
macro_rules! app_error {
    ($($arg:tt)*) => {
        $crate::core::error::AppError::Custom(format!($($arg)*))
    };
}

/// 创建并返回错误的便捷宏
///
/// # 示例
/// ```rust
/// use duckcoding::{bail, AppResult};
///
/// fn ensure_installed(tool_name: &str) -> AppResult<()> {
///     bail!("工具 {} 未安装", tool_name);
/// }
/// ```
#[macro_export]
macro_rules! bail {
    ($($arg:tt)*) => {
        return Err($crate::app_error!($($arg)*))
    };
}

/// 确保条件成立，否则返回错误
///
/// # 示例
/// ```rust
/// use duckcoding::{ensure, AppResult};
///
/// fn validate_version(version: Option<&str>) -> AppResult<()> {
///     ensure!(version.is_some(), "版本信息为空");
///     Ok(())
/// }
/// ```
#[macro_export]
macro_rules! ensure {
    ($cond:expr, $($arg:tt)*) => {
        if !$cond {
            $crate::bail!($($arg)*);
        }
    };
}

// ==================== Serde 序列化实现 ====================

/// 自定义序列化实现，将 source 字段转换为字符串
impl Serialize for AppError {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        use serde::ser::SerializeStruct;

        match self {
            // 工具相关错误
            AppError::ToolNotFound { tool } => {
                let mut state = serializer.serialize_struct("AppError", 2)?;
                state.serialize_field("type", "ToolNotFound")?;
                state.serialize_field("tool", tool)?;
                state.end()
            }
            AppError::ToolNotInstalled { tool } => {
                let mut state = serializer.serialize_struct("AppError", 2)?;
                state.serialize_field("type", "ToolNotInstalled")?;
                state.serialize_field("tool", tool)?;
                state.end()
            }
            AppError::ToolAlreadyInstalled { tool, version } => {
                let mut state = serializer.serialize_struct("AppError", 3)?;
                state.serialize_field("type", "ToolAlreadyInstalled")?;
                state.serialize_field("tool", tool)?;
                state.serialize_field("version", version)?;
                state.end()
            }
            AppError::InstallationFailed { tool, reason } => {
                let mut state = serializer.serialize_struct("AppError", 3)?;
                state.serialize_field("type", "InstallationFailed")?;
                state.serialize_field("tool", tool)?;
                state.serialize_field("reason", reason)?;
                state.end()
            }
            AppError::VersionCheckFailed { tool, reason } => {
                let mut state = serializer.serialize_struct("AppError", 3)?;
                state.serialize_field("type", "VersionCheckFailed")?;
                state.serialize_field("tool", tool)?;
                state.serialize_field("reason", reason)?;
                state.end()
            }

            // 配置相关错误
            AppError::ConfigNotFound { path } => {
                let mut state = serializer.serialize_struct("AppError", 2)?;
                state.serialize_field("type", "ConfigNotFound")?;
                state.serialize_field("path", path)?;
                state.end()
            }
            AppError::InvalidConfig { path, reason } => {
                let mut state = serializer.serialize_struct("AppError", 3)?;
                state.serialize_field("type", "InvalidConfig")?;
                state.serialize_field("path", path)?;
                state.serialize_field("reason", reason)?;
                state.end()
            }
            AppError::ConfigReadError { path, source } => {
                let mut state = serializer.serialize_struct("AppError", 3)?;
                state.serialize_field("type", "ConfigReadError")?;
                state.serialize_field("path", path)?;
                state.serialize_field("error", &source.to_string())?;
                state.end()
            }
            AppError::ConfigWriteError { path, source } => {
                let mut state = serializer.serialize_struct("AppError", 3)?;
                state.serialize_field("type", "ConfigWriteError")?;
                state.serialize_field("path", path)?;
                state.serialize_field("error", &source.to_string())?;
                state.end()
            }
            AppError::ProfileNotFound { profile } => {
                let mut state = serializer.serialize_struct("AppError", 2)?;
                state.serialize_field("type", "ProfileNotFound")?;
                state.serialize_field("profile", profile)?;
                state.end()
            }
            AppError::ProfileAlreadyExists { profile } => {
                let mut state = serializer.serialize_struct("AppError", 2)?;
                state.serialize_field("type", "ProfileAlreadyExists")?;
                state.serialize_field("profile", profile)?;
                state.end()
            }

            // 网络相关错误
            AppError::NetworkError { url, source } => {
                let mut state = serializer.serialize_struct("AppError", 3)?;
                state.serialize_field("type", "NetworkError")?;
                state.serialize_field("url", url)?;
                state.serialize_field("error", &source.to_string())?;
                state.end()
            }
            AppError::ProxyConfigError { reason } => {
                let mut state = serializer.serialize_struct("AppError", 2)?;
                state.serialize_field("type", "ProxyConfigError")?;
                state.serialize_field("reason", reason)?;
                state.end()
            }
            AppError::ApiError {
                endpoint,
                status_code,
                body,
            } => {
                let mut state = serializer.serialize_struct("AppError", 4)?;
                state.serialize_field("type", "ApiError")?;
                state.serialize_field("endpoint", endpoint)?;
                state.serialize_field("status_code", status_code)?;
                state.serialize_field("body", body)?;
                state.end()
            }
            AppError::DownloadError { url, source } => {
                let mut state = serializer.serialize_struct("AppError", 3)?;
                state.serialize_field("type", "DownloadError")?;
                state.serialize_field("url", url)?;
                state.serialize_field("error", &source.to_string())?;
                state.end()
            }

            // 文件系统错误
            AppError::FileNotFound { path } => {
                let mut state = serializer.serialize_struct("AppError", 2)?;
                state.serialize_field("type", "FileNotFound")?;
                state.serialize_field("path", path)?;
                state.end()
            }
            AppError::DirCreationError { path, source } => {
                let mut state = serializer.serialize_struct("AppError", 3)?;
                state.serialize_field("type", "DirCreationError")?;
                state.serialize_field("path", path)?;
                state.serialize_field("error", &source.to_string())?;
                state.end()
            }
            AppError::PermissionDenied { path, operation } => {
                let mut state = serializer.serialize_struct("AppError", 3)?;
                state.serialize_field("type", "PermissionDenied")?;
                state.serialize_field("path", path)?;
                state.serialize_field("operation", operation)?;
                state.end()
            }

            // 解析错误
            AppError::JsonParseError { context, source } => {
                let mut state = serializer.serialize_struct("AppError", 3)?;
                state.serialize_field("type", "JsonParseError")?;
                state.serialize_field("context", context)?;
                state.serialize_field("error", &source.to_string())?;
                state.end()
            }
            AppError::TomlParseError { context, source } => {
                let mut state = serializer.serialize_struct("AppError", 3)?;
                state.serialize_field("type", "TomlParseError")?;
                state.serialize_field("context", context)?;
                state.serialize_field("error", &source.to_string())?;
                state.end()
            }
            AppError::TomlSerializeError { context, source } => {
                let mut state = serializer.serialize_struct("AppError", 3)?;
                state.serialize_field("type", "TomlSerializeError")?;
                state.serialize_field("context", context)?;
                state.serialize_field("error", &source.to_string())?;
                state.end()
            }

            // 业务逻辑错误
            AppError::EnvironmentError { requirement } => {
                let mut state = serializer.serialize_struct("AppError", 2)?;
                state.serialize_field("type", "EnvironmentError")?;
                state.serialize_field("requirement", requirement)?;
                state.end()
            }
            AppError::ValidationError { field, reason } => {
                let mut state = serializer.serialize_struct("AppError", 3)?;
                state.serialize_field("type", "ValidationError")?;
                state.serialize_field("field", field)?;
                state.serialize_field("reason", reason)?;
                state.end()
            }
            AppError::Timeout {
                operation,
                timeout_secs,
            } => {
                let mut state = serializer.serialize_struct("AppError", 3)?;
                state.serialize_field("type", "Timeout")?;
                state.serialize_field("operation", operation)?;
                state.serialize_field("timeout_secs", timeout_secs)?;
                state.end()
            }
            AppError::Unimplemented { feature, platform } => {
                let mut state = serializer.serialize_struct("AppError", 3)?;
                state.serialize_field("type", "Unimplemented")?;
                state.serialize_field("feature", feature)?;
                state.serialize_field("platform", platform)?;
                state.end()
            }

            // 更新相关错误
            AppError::UpdateCheckFailed { reason } => {
                let mut state = serializer.serialize_struct("AppError", 2)?;
                state.serialize_field("type", "UpdateCheckFailed")?;
                state.serialize_field("reason", reason)?;
                state.end()
            }
            AppError::UpdateDownloadFailed { version, source } => {
                let mut state = serializer.serialize_struct("AppError", 3)?;
                state.serialize_field("type", "UpdateDownloadFailed")?;
                state.serialize_field("version", version)?;
                state.serialize_field("error", &source.to_string())?;
                state.end()
            }
            AppError::UpdateInstallFailed { reason } => {
                let mut state = serializer.serialize_struct("AppError", 2)?;
                state.serialize_field("type", "UpdateInstallFailed")?;
                state.serialize_field("reason", reason)?;
                state.end()
            }

            // 认证相关错误
            AppError::InvalidApiKey => {
                let mut state = serializer.serialize_struct("AppError", 1)?;
                state.serialize_field("type", "InvalidApiKey")?;
                state.end()
            }
            AppError::AuthenticationFailed { reason } => {
                let mut state = serializer.serialize_struct("AppError", 2)?;
                state.serialize_field("type", "AuthenticationFailed")?;
                state.serialize_field("reason", reason)?;
                state.end()
            }
            AppError::Forbidden { resource } => {
                let mut state = serializer.serialize_struct("AppError", 2)?;
                state.serialize_field("type", "Forbidden")?;
                state.serialize_field("resource", resource)?;
                state.end()
            }

            // 通用错误
            AppError::Internal { message } => {
                let mut state = serializer.serialize_struct("AppError", 2)?;
                state.serialize_field("type", "Internal")?;
                state.serialize_field("message", message)?;
                state.end()
            }
            AppError::Custom(msg) => {
                let mut state = serializer.serialize_struct("AppError", 2)?;
                state.serialize_field("type", "Custom")?;
                state.serialize_field("message", msg)?;
                state.end()
            }
            AppError::Other(err) => {
                let mut state = serializer.serialize_struct("AppError", 2)?;
                state.serialize_field("type", "Other")?;
                state.serialize_field("message", &err.to_string())?;
                state.end()
            }
        }
    }
}

