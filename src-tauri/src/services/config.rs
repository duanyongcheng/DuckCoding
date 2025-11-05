use crate::models::Tool;
use anyhow::{Result, Context};
use serde_json::{Value, Map};
use std::collections::HashMap;
use std::fs;
use std::path::Path;

/// 配置服务
pub struct ConfigService;

impl ConfigService {
    /// 应用配置（增量更新）
    pub fn apply_config(
        tool: &Tool,
        api_key: &str,
        base_url: &str,
        profile_name: Option<&str>,
    ) -> Result<()> {
        match tool.id.as_str() {
            "claude-code" => Self::apply_claude_config(tool, api_key, base_url)?,
            "codex" => Self::apply_codex_config(tool, api_key, base_url)?,
            "gemini-cli" => Self::apply_gemini_config(tool, api_key, base_url)?,
            _ => anyhow::bail!("未知工具: {}", tool.id),
        }

        // 保存备份
        if let Some(profile) = profile_name {
            Self::save_backup(tool, profile)?;
        }

        Ok(())
    }

    /// Claude Code 配置
    fn apply_claude_config(tool: &Tool, api_key: &str, base_url: &str) -> Result<()> {
        let config_path = tool.config_dir.join(&tool.config_file);

        // 读取现有配置
        let mut settings = if config_path.exists() {
            let content = fs::read_to_string(&config_path)
                .context("读取配置文件失败")?;
            serde_json::from_str::<Value>(&content)
                .unwrap_or(Value::Object(Map::new()))
        } else {
            Value::Object(Map::new())
        };

        // 确保有 env 字段
        if !settings.is_object() {
            settings = serde_json::json!({});
        }

        let obj = settings.as_object_mut().unwrap();
        if !obj.contains_key("env") {
            obj.insert("env".to_string(), Value::Object(Map::new()));
        }

        // 只更新 API 相关字段
        let env = obj.get_mut("env").unwrap().as_object_mut().unwrap();
        env.insert(tool.env_vars.api_key.clone(), Value::String(api_key.to_string()));
        env.insert(tool.env_vars.base_url.clone(), Value::String(base_url.to_string()));

        // 确保目录存在
        fs::create_dir_all(&tool.config_dir)?;

        // 写入配置
        let json = serde_json::to_string_pretty(&settings)?;
        fs::write(&config_path, json)?;

        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            let metadata = fs::metadata(&config_path)?;
            let mut perms = metadata.permissions();
            perms.set_mode(0o600);
            fs::set_permissions(&config_path, perms)?;
        }

        Ok(())
    }

    /// CodeX 配置（使用 toml_edit 保留注释和格式）
    fn apply_codex_config(tool: &Tool, api_key: &str, base_url: &str) -> Result<()> {
        let config_path = tool.config_dir.join(&tool.config_file);
        let auth_path = tool.config_dir.join("auth.json");

        // 确保目录存在
        fs::create_dir_all(&tool.config_dir)?;

        // 读取现有 config.toml（使用 toml_edit 保留注释）
        let mut doc = if config_path.exists() {
            let content = fs::read_to_string(&config_path)?;
            content.parse::<toml_edit::DocumentMut>()
                .unwrap_or_else(|_| toml_edit::DocumentMut::new())
        } else {
            toml_edit::DocumentMut::new()
        };

        // 判断 provider 类型
        let is_duckcoding = base_url.contains("duckcoding");
        let provider_key = if is_duckcoding { "duckcoding" } else { "custom" };

        // 只更新必要字段（保留用户自定义配置和注释）
        if !doc.contains_key("model") {
            doc["model"] = toml_edit::value("gpt-5-codex");
        }
        if !doc.contains_key("model_reasoning_effort") {
            doc["model_reasoning_effort"] = toml_edit::value("high");
        }
        if !doc.contains_key("network_access") {
            doc["network_access"] = toml_edit::value("enabled");
        }
        if !doc.contains_key("disable_response_storage") {
            doc["disable_response_storage"] = toml_edit::value(true);
        }

        // 更新 model_provider
        doc["model_provider"] = toml_edit::value(provider_key);

        // 增量更新 model_providers
        if !doc.contains_key("model_providers") {
            doc["model_providers"] = toml_edit::table();
        }

        let base_url_with_v1 = if base_url.ends_with("/v1") {
            base_url.to_string()
        } else {
            format!("{}/v1", base_url)
        };

        // 增量更新 model_providers[provider_key]（保留注释和格式）
        if !doc["model_providers"].is_table() {
            doc["model_providers"] = toml_edit::table();
        }

        // 如果 provider 不存在，创建新的 table（非 inline）
        if doc["model_providers"][provider_key].is_none() {
            doc["model_providers"][provider_key] = toml_edit::table();
        }

        // 逐项更新字段（保留其他字段和注释）
        if let Some(provider_table) = doc["model_providers"][provider_key].as_table_mut() {
            provider_table.insert("name", toml_edit::value(provider_key));
            provider_table.insert("base_url", toml_edit::value(base_url_with_v1));
            provider_table.insert("wire_api", toml_edit::value("responses"));
            provider_table.insert("requires_openai_auth", toml_edit::value(true));
        }

        // 写入 config.toml（保留注释和格式）
        fs::write(&config_path, doc.to_string())?;

        // 更新 auth.json（增量）
        let mut auth_data = if auth_path.exists() {
            let content = fs::read_to_string(&auth_path)?;
            serde_json::from_str::<Value>(&content)
                .unwrap_or(Value::Object(Map::new()))
        } else {
            Value::Object(Map::new())
        };

        if let Value::Object(ref mut auth_obj) = auth_data {
            auth_obj.insert("OPENAI_API_KEY".to_string(), Value::String(api_key.to_string()));
        }

        fs::write(&auth_path, serde_json::to_string_pretty(&auth_data)?)?;

        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            for path in [&config_path, &auth_path] {
                if path.exists() {
                    let metadata = fs::metadata(path)?;
                    let mut perms = metadata.permissions();
                    perms.set_mode(0o600);
                    fs::set_permissions(path, perms)?;
                }
            }
        }

        Ok(())
    }

    /// Gemini CLI 配置
    fn apply_gemini_config(tool: &Tool, api_key: &str, base_url: &str) -> Result<()> {
        let env_path = tool.config_dir.join(".env");
        let settings_path = tool.config_dir.join(&tool.config_file);

        // 确保目录存在
        fs::create_dir_all(&tool.config_dir)?;

        // 读取现有 .env
        let mut env_vars = HashMap::new();
        if env_path.exists() {
            let content = fs::read_to_string(&env_path)?;
            for line in content.lines() {
                let trimmed = line.trim();
                if !trimmed.is_empty() && !trimmed.starts_with('#') {
                    if let Some((key, value)) = trimmed.split_once('=') {
                        env_vars.insert(key.trim().to_string(), value.trim().to_string());
                    }
                }
            }
        }

        // 更新 API 相关字段
        env_vars.insert("GOOGLE_GEMINI_BASE_URL".to_string(), base_url.to_string());
        env_vars.insert("GEMINI_API_KEY".to_string(), api_key.to_string());
        if !env_vars.contains_key("GEMINI_MODEL") {
            env_vars.insert("GEMINI_MODEL".to_string(), "gemini-2.5-pro".to_string());
        }

        // 写入 .env
        let env_content: Vec<String> = env_vars
            .iter()
            .map(|(k, v)| format!("{}={}", k, v))
            .collect();
        fs::write(&env_path, env_content.join("\n") + "\n")?;

        // 读取并更新 settings.json
        let mut settings = if settings_path.exists() {
            let content = fs::read_to_string(&settings_path)?;
            serde_json::from_str::<Value>(&content)
                .unwrap_or(Value::Object(Map::new()))
        } else {
            Value::Object(Map::new())
        };

        if let Value::Object(ref mut obj) = settings {
            if !obj.contains_key("ide") {
                obj.insert("ide".to_string(), serde_json::json!({"enabled": true}));
            }
            if !obj.contains_key("security") {
                obj.insert("security".to_string(), serde_json::json!({
                    "auth": {"selectedType": "gemini-api-key"}
                }));
            }
        }

        fs::write(&settings_path, serde_json::to_string_pretty(&settings)?)?;

        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            for path in [&env_path, &settings_path] {
                if path.exists() {
                    let metadata = fs::metadata(path)?;
                    let mut perms = metadata.permissions();
                    perms.set_mode(0o600);
                    fs::set_permissions(path, perms)?;
                }
            }
        }

        Ok(())
    }

    /// 保存备份配置
    pub fn save_backup(tool: &Tool, profile_name: &str) -> Result<()> {
        match tool.id.as_str() {
            "claude-code" => Self::backup_claude(tool, profile_name)?,
            "codex" => Self::backup_codex(tool, profile_name)?,
            "gemini-cli" => Self::backup_gemini(tool, profile_name)?,
            _ => anyhow::bail!("未知工具: {}", tool.id),
        }
        Ok(())
    }

    fn backup_claude(tool: &Tool, profile_name: &str) -> Result<()> {
        let config_path = tool.config_dir.join(&tool.config_file);
        let backup_path = tool.backup_path(profile_name);

        if config_path.exists() {
            fs::copy(&config_path, &backup_path)?;
        }

        Ok(())
    }

    fn backup_codex(tool: &Tool, profile_name: &str) -> Result<()> {
        let config_path = tool.config_dir.join("config.toml");
        let auth_path = tool.config_dir.join("auth.json");

        let backup_config = tool.config_dir.join(format!("config.{}.toml", profile_name));
        let backup_auth = tool.config_dir.join(format!("auth.{}.json", profile_name));

        if config_path.exists() {
            fs::copy(&config_path, &backup_config)?;
        }
        if auth_path.exists() {
            fs::copy(&auth_path, &backup_auth)?;
        }

        Ok(())
    }

    fn backup_gemini(tool: &Tool, profile_name: &str) -> Result<()> {
        let env_path = tool.config_dir.join(".env");
        let settings_path = tool.config_dir.join(&tool.config_file);

        let backup_env = tool.config_dir.join(format!(".env.{}", profile_name));
        let backup_settings = tool.backup_path(profile_name);

        if env_path.exists() {
            fs::copy(&env_path, &backup_env)?;
        }
        if settings_path.exists() {
            fs::copy(&settings_path, &backup_settings)?;
        }

        Ok(())
    }

    /// 列出所有保存的配置
    pub fn list_profiles(tool: &Tool) -> Result<Vec<String>> {
        if !tool.config_dir.exists() {
            return Ok(vec![]);
        }

        let entries = fs::read_dir(&tool.config_dir)?;
        let mut profiles = Vec::new();

        let ext = Path::new(&tool.config_file)
            .extension()
            .and_then(|e| e.to_str())
            .unwrap_or("");

        let basename = Path::new(&tool.config_file)
            .file_stem()
            .and_then(|s| s.to_str())
            .unwrap_or("config");

        for entry in entries {
            let entry = entry?;
            let filename = entry.file_name();
            let filename_str = filename.to_string_lossy();

            // 排除主配置文件本身 (settings.json, config.toml, .env 等)
            if filename_str == tool.config_file {
                continue;
            }

            // 匹配 settings.{profile}.json 格式
            if filename_str.starts_with(&format!("{}.", basename)) {
                let profile = filename_str
                    .trim_start_matches(&format!("{}.", basename))
                    .trim_end_matches(&format!(".{}", ext))
                    .to_string();

                if !profile.is_empty() && !profile.starts_with('.') {
                    profiles.push(profile);
                }
            }
        }

        profiles.sort();
        profiles.dedup();
        Ok(profiles)
    }

    /// 激活指定的配置
    pub fn activate_profile(tool: &Tool, profile_name: &str) -> Result<()> {
        match tool.id.as_str() {
            "claude-code" => Self::activate_claude(tool, profile_name)?,
            "codex" => Self::activate_codex(tool, profile_name)?,
            "gemini-cli" => Self::activate_gemini(tool, profile_name)?,
            _ => anyhow::bail!("未知工具: {}", tool.id),
        }
        Ok(())
    }

    fn activate_claude(tool: &Tool, profile_name: &str) -> Result<()> {
        let backup_path = tool.backup_path(profile_name);
        let active_path = tool.config_dir.join(&tool.config_file);

        if !backup_path.exists() {
            anyhow::bail!("配置文件不存在: {:?}", backup_path);
        }

        fs::copy(&backup_path, &active_path)?;
        Ok(())
    }

    fn activate_codex(tool: &Tool, profile_name: &str) -> Result<()> {
        let backup_config = tool.config_dir.join(format!("config.{}.toml", profile_name));
        let backup_auth = tool.config_dir.join(format!("auth.{}.json", profile_name));

        let active_config = tool.config_dir.join("config.toml");
        let active_auth = tool.config_dir.join("auth.json");

        if !backup_config.exists() {
            anyhow::bail!("配置文件不存在: {:?}", backup_config);
        }

        fs::copy(&backup_config, &active_config)?;
        if backup_auth.exists() {
            fs::copy(&backup_auth, &active_auth)?;
        }

        Ok(())
    }

    fn activate_gemini(tool: &Tool, profile_name: &str) -> Result<()> {
        let backup_env = tool.config_dir.join(format!(".env.{}", profile_name));
        let backup_settings = tool.backup_path(profile_name);

        let active_env = tool.config_dir.join(".env");
        let active_settings = tool.config_dir.join(&tool.config_file);

        if !backup_env.exists() {
            anyhow::bail!("配置文件不存在: {:?}", backup_env);
        }

        fs::copy(&backup_env, &active_env)?;
        if backup_settings.exists() {
            fs::copy(&backup_settings, &active_settings)?;
        }

        Ok(())
    }

    /// 删除配置
    pub fn delete_profile(tool: &Tool, profile_name: &str) -> Result<()> {
        match tool.id.as_str() {
            "claude-code" => {
                let backup_path = tool.backup_path(profile_name);
                if backup_path.exists() {
                    fs::remove_file(backup_path)?;
                }
            }
            "codex" => {
                let backup_config = tool.config_dir.join(format!("config.{}.toml", profile_name));
                let backup_auth = tool.config_dir.join(format!("auth.{}.json", profile_name));

                if backup_config.exists() {
                    fs::remove_file(backup_config)?;
                }
                if backup_auth.exists() {
                    fs::remove_file(backup_auth)?;
                }
            }
            "gemini-cli" => {
                let backup_env = tool.config_dir.join(format!(".env.{}", profile_name));
                let backup_settings = tool.backup_path(profile_name);

                if backup_env.exists() {
                    fs::remove_file(backup_env)?;
                }
                if backup_settings.exists() {
                    fs::remove_file(backup_settings)?;
                }
            }
            _ => anyhow::bail!("未知工具: {}", tool.id),
        }

        Ok(())
    }
}
