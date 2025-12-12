use super::platform::PlatformInfo;
use std::io;
use std::process::{Command, Output};

#[cfg(target_os = "windows")]
use std::os::windows::process::CommandExt;

/// 命令执行结果
#[derive(Debug)]
pub struct CommandResult {
    pub success: bool,
    pub stdout: String,
    pub stderr: String,
    pub exit_code: Option<i32>,
}

impl CommandResult {
    pub fn from_output(output: Output) -> Self {
        CommandResult {
            success: output.status.success(),
            stdout: String::from_utf8_lossy(&output.stdout).trim().to_string(),
            stderr: String::from_utf8_lossy(&output.stderr).trim().to_string(),
            exit_code: output.status.code(),
        }
    }

    pub fn from_error(error: io::Error) -> Self {
        CommandResult {
            success: false,
            stdout: String::new(),
            stderr: error.to_string(),
            exit_code: None,
        }
    }
}

/// 命令执行器
#[derive(Clone)]
pub struct CommandExecutor {
    platform: PlatformInfo,
}

impl CommandExecutor {
    pub fn new() -> Self {
        CommandExecutor {
            platform: PlatformInfo::current(),
        }
    }

    /// 执行命令（使用增强的 PATH）
    ///
    /// 智能重试策略：
    /// 1. 首次执行使用增强 PATH
    /// 2. 如果失败且 exit code = 127（命令未找到），尝试扫描安装器
    /// 3. 将安装器目录加入 PATH 后重试
    pub fn execute(&self, command_str: &str) -> CommandResult {
        let enhanced_path = self.platform.build_enhanced_path();

        // 第一次尝试
        let result = self.execute_with_path(command_str, &enhanced_path);

        // 如果是 127 错误（命令未找到），尝试扫描安装器并重试
        if !result.success && result.exit_code == Some(127) {
            tracing::warn!(
                "命令执行失败 (exit 127): {}，尝试扫描安装器后重试",
                command_str
            );

            if let Some(extended_path) =
                self.scan_installer_and_extend_path(command_str, &enhanced_path)
            {
                tracing::info!("扫描到安装器路径，使用扩展 PATH 重试: {}", extended_path);
                return self.execute_with_path(command_str, &extended_path);
            }
        }

        result
    }

    /// 使用指定的 PATH 执行命令
    fn execute_with_path(&self, command_str: &str, path_env: &str) -> CommandResult {
        let output = if self.platform.is_windows {
            #[cfg(target_os = "windows")]
            {
                Command::new("cmd")
                    .args(["/C", command_str])
                    .creation_flags(0x08000000) // CREATE_NO_WINDOW
                    .env("PATH", path_env)
                    .output()
            }
            #[cfg(not(target_os = "windows"))]
            {
                Command::new("cmd")
                    .args(["/C", command_str])
                    .env("PATH", path_env)
                    .output()
            }
        } else {
            Command::new("sh")
                .args(["-c", command_str])
                .env("PATH", path_env)
                .output()
        };

        match output {
            Ok(output) => CommandResult::from_output(output),
            Err(e) => CommandResult::from_error(e),
        }
    }

    /// 扫描安装器并扩展 PATH
    ///
    /// 从命令字符串中提取工具路径，扫描安装器，返回扩展后的 PATH
    ///
    /// # 参数
    /// - command_str: 命令字符串（如 "/usr/local/bin/gemini --version"）
    /// - base_path: 基础 PATH
    ///
    /// # 返回
    /// - Some(String): 扩展后的 PATH
    /// - None: 未找到安装器或无法提取路径
    fn scan_installer_and_extend_path(&self, command_str: &str, base_path: &str) -> Option<String> {
        use crate::utils::scan_installer_paths;
        use std::collections::HashSet;

        // 1. 从命令字符串中提取工具路径（第一个词）
        let tool_path = command_str.split_whitespace().next()?;

        // 仅处理绝对路径（以 / 或 C:\ 开头）
        if !tool_path.starts_with('/') && !tool_path.contains(":\\") {
            return None;
        }

        tracing::info!("从命令中提取工具路径: {}", tool_path);

        // 2. 扫描安装器路径
        let installer_candidates = scan_installer_paths(tool_path);

        if installer_candidates.is_empty() {
            tracing::warn!("未扫描到任何安装器路径");
            return None;
        }

        // 3. 提取安装器所在的目录（去重）
        let mut installer_dirs = HashSet::new();

        for candidate in installer_candidates {
            if let Some(parent) = std::path::Path::new(&candidate.path).parent() {
                let parent_str = parent.to_string_lossy().to_string();
                installer_dirs.insert(parent_str);
                tracing::info!(
                    "扫描到安装器 {:?} 在目录: {}",
                    candidate.installer_type,
                    parent.display()
                );
            }
        }

        if installer_dirs.is_empty() {
            return None;
        }

        // 4. 构建扩展 PATH（安装器目录 + 原 PATH）
        let separator = self.platform.path_separator();
        let installer_paths: Vec<String> = installer_dirs.into_iter().collect();

        Some(format!(
            "{}{}{}",
            installer_paths.join(separator),
            separator,
            base_path
        ))
    }

    /// 执行命令（异步）
    pub async fn execute_async(&self, command_str: &str) -> CommandResult {
        let command_str = command_str.to_string();
        let platform = self.platform.clone();

        tokio::task::spawn_blocking(move || {
            let executor = CommandExecutor { platform };
            executor.execute(&command_str)
        })
        .await
        .unwrap_or_else(|e| CommandResult {
            success: false,
            stdout: String::new(),
            stderr: format!("任务执行失败: {e}"),
            exit_code: None,
        })
    }

    /// 检查命令是否存在
    pub fn command_exists(&self, command: &str) -> bool {
        // 从命令字符串中提取命令名（第一个词）
        // 例如: "claude --version" -> "claude"
        let cmd_name = command.split_whitespace().next().unwrap_or(command);

        let check_cmd = if self.platform.is_windows {
            format!("where {cmd_name}")
        } else {
            format!("which {cmd_name}")
        };

        self.execute(&check_cmd).success
    }

    /// 检查命令是否存在（异步）
    pub async fn command_exists_async(&self, command: &str) -> bool {
        // 从命令字符串中提取命令名（第一个词）
        // 例如: "claude --version" -> "claude"
        let cmd_name = command.split_whitespace().next().unwrap_or(command);

        let check_cmd = if self.platform.is_windows {
            format!("where {cmd_name}")
        } else {
            format!("which {cmd_name}")
        };

        tracing::info!(
            "检查命令是否存在: command={}, cmd_name={}, check_cmd={}",
            command,
            cmd_name,
            check_cmd
        );

        let result = self.execute_async(&check_cmd).await;

        tracing::info!(
            "命令检查结果: command={}, cmd_name={}, success={}, stdout={:?}, stderr={:?}",
            command,
            cmd_name,
            result.success,
            result.stdout.trim(),
            result.stderr.trim()
        );

        result.success
    }
}

impl Default for CommandExecutor {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_command_executor() {
        let executor = CommandExecutor::new();

        // Test a command that should exist on all platforms
        let result = executor.execute("echo test");

        assert!(result.success);
        assert!(result.stdout.contains("test"));
    }

    #[test]
    fn test_command_exists() {
        let executor = CommandExecutor::new();

        // Test that echo/cmd exists
        if cfg!(windows) {
            assert!(executor.command_exists("cmd"));
        } else {
            assert!(executor.command_exists("sh"));
        }
    }

    #[tokio::test]
    async fn test_async_execution() {
        let executor = CommandExecutor::new();
        let result = executor.execute_async("echo async_test").await;

        assert!(result.success);
    }
}
