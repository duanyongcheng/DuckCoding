// Gemini CLI Detector
//
// Gemini CLI 工具的检测、安装、配置管理实现

use super::super::detector_trait::ToolDetector;
use crate::data::DataManager;
use crate::models::InstallMethod;
use crate::services::version::{VersionInfo, VersionService};
use crate::utils::CommandExecutor;
use anyhow::Result;
use async_trait::async_trait;
use serde_json::Value;
use std::path::PathBuf;

/// Gemini CLI 工具检测器
pub struct GeminiCLIDetector {
    config_dir: PathBuf,
}

impl GeminiCLIDetector {
    pub fn new() -> Self {
        let home_dir = dirs::home_dir().expect("无法获取用户主目录");
        Self {
            config_dir: home_dir.join(".gemini"),
        }
    }
}

impl Default for GeminiCLIDetector {
    fn default() -> Self {
        Self::new()
    }
}

#[async_trait]
impl ToolDetector for GeminiCLIDetector {
    // ==================== 基础信息 ====================

    fn tool_id(&self) -> &str {
        "gemini-cli"
    }

    fn tool_name(&self) -> &str {
        "Gemini CLI"
    }

    fn config_dir(&self) -> PathBuf {
        self.config_dir.clone()
    }

    fn config_file(&self) -> &str {
        "settings.json"
    }

    fn npm_package(&self) -> &str {
        "@google/gemini-cli"
    }

    fn check_command(&self) -> &str {
        "gemini --version"
    }

    fn use_proxy_for_version_check(&self) -> bool {
        // Gemini CLI 可以使用代理
        true
    }

    // ==================== 检测逻辑 ====================

    async fn detect_install_method(&self, executor: &CommandExecutor) -> Option<InstallMethod> {
        // 检查 Homebrew 安装（macOS）
        #[cfg(target_os = "macos")]
        {
            if executor.command_exists_async("brew").await {
                let cmd = "brew list --formula | grep -q '^gemini-cli$'";
                let result = executor.execute_async(cmd).await;
                if result.success {
                    return Some(InstallMethod::Brew);
                }
            }
        }

        // 检查 npm 全局安装
        if executor.command_exists_async("npm").await {
            let stderr_redirect = if cfg!(windows) {
                "2>nul"
            } else {
                "2>/dev/null"
            };
            let cmd = format!("npm list -g @google/gemini-cli {stderr_redirect}");
            let result = executor.execute_async(&cmd).await;
            if result.success && !result.stdout.contains("(empty)") {
                return Some(InstallMethod::Npm);
            }
        }

        // 默认返回 Other（无法确定安装方式）
        Some(InstallMethod::Other)
    }

    // ==================== 安装逻辑 ====================

    async fn install(
        &self,
        executor: &CommandExecutor,
        method: &InstallMethod,
        force: bool,
    ) -> Result<()> {
        match method {
            InstallMethod::Npm => self.install_npm(executor, force).await,
            InstallMethod::Brew => self.install_brew(executor).await,
            InstallMethod::Official | InstallMethod::Other => {
                anyhow::bail!("Gemini CLI 支持 npm 或 brew 安装")
            }
        }
    }

    async fn update(&self, executor: &CommandExecutor, _force: bool) -> Result<()> {
        // 根据当前安装方式选择更新命令
        let method = self.detect_install_method(executor).await;
        match method {
            Some(InstallMethod::Brew) => self.update_brew(executor).await,
            _ => self.update_npm(executor).await,
        }
    }

    // ==================== 配置管理 ====================

    async fn read_config(&self, manager: &DataManager) -> Result<Value> {
        let config_path = self.config_dir.join(self.config_file());

        // 使用 uncached 避免配置文件变更不被检测
        let content = manager.json_uncached().read(&config_path)?;
        Ok(content)
    }

    async fn save_config(&self, manager: &DataManager, config: Value) -> Result<()> {
        let config_path = self.config_dir.join(self.config_file());

        // 使用 uncached 确保立即写入
        manager.json_uncached().write(&config_path, &config)?;
        Ok(())
    }
}

// ==================== 私有实现方法 ====================

impl GeminiCLIDetector {
    /// 使用 npm 安装
    async fn install_npm(&self, executor: &CommandExecutor, force: bool) -> Result<()> {
        if !executor.command_exists_async("npm").await {
            anyhow::bail!("npm 未安装");
        }

        let version_hint = if !force {
            let version_service = VersionService::new();
            version_service
                .check_version(&self.to_legacy_tool())
                .await
                .ok()
                .and_then(|info| Self::preferred_npm_version(&info))
        } else {
            None
        };

        let package_spec = match version_hint {
            Some(version) if !version.is_empty() => format!("@google/gemini-cli@{}", version),
            _ => "@google/gemini-cli@latest".to_string(),
        };

        let command =
            format!("npm install -g {package_spec} --registry https://registry.npmmirror.com");
        let result = executor.execute_async(&command).await;

        if result.success {
            Ok(())
        } else {
            anyhow::bail!("❌ npm 安装失败\n\n{}", result.stderr)
        }
    }

    /// 使用 npm 更新
    async fn update_npm(&self, executor: &CommandExecutor) -> Result<()> {
        let command = "npm update -g @google/gemini-cli --registry https://registry.npmmirror.com";
        let result = executor.execute_async(command).await;

        if result.success {
            Ok(())
        } else {
            anyhow::bail!("❌ npm 更新失败\n\n{}", result.stderr)
        }
    }

    /// 使用 Homebrew 安装（macOS）
    async fn install_brew(&self, executor: &CommandExecutor) -> Result<()> {
        if !executor.command_exists_async("brew").await {
            anyhow::bail!("Homebrew 未安装");
        }

        let command = "brew install gemini-cli";
        let result = executor.execute_async(command).await;

        if result.success {
            Ok(())
        } else {
            anyhow::bail!("❌ Homebrew 安装失败\n\n{}", result.stderr)
        }
    }

    /// 使用 Homebrew 更新（macOS）
    async fn update_brew(&self, executor: &CommandExecutor) -> Result<()> {
        let command = "brew upgrade gemini-cli";
        let result = executor.execute_async(command).await;

        if result.success {
            Ok(())
        } else {
            anyhow::bail!("❌ Homebrew 更新失败\n\n{}", result.stderr)
        }
    }

    /// 转换为旧版 Tool 结构
    fn to_legacy_tool(&self) -> crate::models::Tool {
        crate::models::Tool::gemini_cli()
    }

    /// 从版本信息中提取推荐的 npm 版本
    fn preferred_npm_version(info: &VersionInfo) -> Option<String> {
        info.mirror_version
            .clone()
            .or_else(|| info.latest_version.clone())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_basic_info() {
        let detector = GeminiCLIDetector::new();
        assert_eq!(detector.tool_id(), "gemini-cli");
        assert_eq!(detector.tool_name(), "Gemini CLI");
        assert_eq!(detector.npm_package(), "@google/gemini-cli");
        assert!(detector.use_proxy_for_version_check());
    }
}
