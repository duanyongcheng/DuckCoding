// CLI 入口
// 使用: cargo run --features cli --bin duckcoding

use clap::{Parser, Subcommand};
use colored::Colorize;
use duckcoding::{
    ConfigService, InstallerService, Tool, VersionService,
    Result,
};
use inquire::{Select, Text, Confirm};

#[derive(Parser)]
#[command(name = "duckcoding")]
#[command(about = "DuckCoding AI 工具一键配置", long_about = None)]
#[command(version)]
struct Cli {
    #[command(subcommand)]
    command: Option<Commands>,
}

#[derive(Subcommand)]
enum Commands {
    /// 检查工具安装状态
    Check,

    /// 安装工具
    Install {
        /// 工具名称 (claude-code, codex, gemini-cli)
        tool: Option<String>,
    },

    /// 配置 API Key
    Configure {
        /// 工具名称
        tool: Option<String>,
    },

    /// 切换配置
    Switch {
        /// 工具名称
        tool: Option<String>,
    },

    /// 更新工具
    Update {
        /// 工具名称
        tool: Option<String>,
    },

    /// 交互式主菜单
    Menu,
}

#[tokio::main]
async fn main() -> Result<()> {
    let cli = Cli::parse();

    match cli.command {
        Some(Commands::Check) => check_installations().await?,
        Some(Commands::Install { tool }) => install_tool(tool).await?,
        Some(Commands::Configure { tool }) => configure_tool(tool).await?,
        Some(Commands::Switch { tool }) => switch_config(tool).await?,
        Some(Commands::Update { tool }) => update_tool(tool).await?,
        Some(Commands::Menu) | None => show_main_menu().await?,
    }

    Ok(())
}

/// 显示主菜单
async fn show_main_menu() -> Result<()> {
    loop {
        println!("\n{}", "=".repeat(50).cyan());
        println!("{}", "    DuckCoding AI 工具一键配置".bold().cyan());
        println!("{}", "=".repeat(50).cyan());

        let options = vec![
            "检查安装状态",
            "安装工具",
            "配置 API Key",
            "切换配置",
            "更新工具",
            "退出",
        ];

        let choice = Select::new("请选择操作:", options).prompt()?;

        match choice {
            "检查安装状态" => check_installations().await?,
            "安装工具" => install_tool(None).await?,
            "配置 API Key" => configure_tool(None).await?,
            "切换配置" => switch_config(None).await?,
            "更新工具" => update_tool(None).await?,
            "退出" => {
                println!("{}", "\n再见！".green());
                break;
            }
            _ => {}
        }
    }

    Ok(())
}

/// 检查安装状态
async fn check_installations() -> Result<()> {
    println!("\n{}", "正在检查安装状态...".cyan());

    let installer = InstallerService::new();
    let version_service = VersionService::new();

    for tool in Tool::all() {
        print!("\n{} ", tool.name.bold());

        if installer.is_installed(&tool).await {
            if let Some(version) = installer.get_installed_version(&tool).await {
                println!("{} {}", "✓".green(), format!("v{}", version).dimmed());

                // 检查更新
                let version_info = version_service.check_version(&tool).await?;
                if version_info.has_update {
                    println!(
                        "  {} 有新版本: {}",
                        "↑".yellow(),
                        version_info.latest_version.unwrap().yellow()
                    );
                }
            } else {
                println!("{}", "✓ 已安装".green());
            }
        } else {
            println!("{}", "✗ 未安装".red());
        }
    }

    println!();
    Ok(())
}

/// 安装工具
async fn install_tool(tool_name: Option<String>) -> Result<()> {
    let tool = match tool_name {
        Some(name) => Tool::by_id(&name)
            .ok_or_else(|| anyhow::anyhow!("未知工具: {}", name))?,
        None => {
            let all_tools = Tool::all();
            let tool_names: Vec<String> = all_tools.iter().map(|t| t.name.clone()).collect();
            let choice = Select::new("选择要安装的工具:", tool_names).prompt()?;
            all_tools.into_iter().find(|t| t.name == choice).unwrap()
        }
    };

    println!("\n{} {}", "正在安装".cyan(), tool.name.bold());

    let installer = InstallerService::new();

    // 检查是否已安装
    if installer.is_installed(&tool).await {
        let reinstall = Confirm::new(&format!("{} 已安装，是否重新安装？", tool.name))
            .with_default(false)
            .prompt()?;

        if !reinstall {
            return Ok(());
        }
    }

    // 选择安装方法
    let methods = tool.available_install_methods();
    let method_names: Vec<_> = methods
        .iter()
        .map(|m| match m {
            duckcoding::InstallMethod::Official => "官方脚本",
            duckcoding::InstallMethod::Npm => "npm",
            duckcoding::InstallMethod::Brew => "Homebrew",
        })
        .collect();

    let default_idx = methods
        .iter()
        .position(|m| m == &tool.recommended_install_method())
        .unwrap_or(0);

    let choice = Select::new("选择安装方法:", method_names)
        .with_starting_cursor(default_idx)
        .prompt()?;

    let selected_method = match choice {
        "官方脚本" => duckcoding::InstallMethod::Official,
        "npm" => duckcoding::InstallMethod::Npm,
        "Homebrew" => duckcoding::InstallMethod::Brew,
        _ => tool.recommended_install_method(),
    };

    // 执行安装
    match installer.install(&tool, &selected_method).await {
        Ok(_) => {
            println!("{} {} 安装成功！", "✓".green(), tool.name.green());
        }
        Err(e) => {
            eprintln!("{} 安装失败: {}", "✗".red(), e.to_string().red());
        }
    }

    Ok(())
}

/// 配置工具
async fn configure_tool(tool_name: Option<String>) -> Result<()> {
    let tool = match tool_name {
        Some(name) => Tool::by_id(&name)
            .ok_or_else(|| anyhow::anyhow!("未知工具: {}", name))?,
        None => {
            let all_tools = Tool::all();
            let tool_names: Vec<String> = all_tools.iter().map(|t| t.name.clone()).collect();
            let choice = Select::new("选择要配置的工具:", tool_names).prompt()?;
            all_tools.into_iter().find(|t| t.name == choice).unwrap()
        }
    };

    println!("\n{} {}", "配置".cyan(), tool.name.bold());

    // API Key
    let api_key = Text::new("API Key:")
        .with_help_message("从 https://duckcoding.com/console/token 获取")
        .prompt()?;

    // Base URL
    let base_url = Text::new("Base URL:")
        .with_default("https://jp.duckcoding.com")
        .prompt()?;

    // Profile Name
    let profile_name = Text::new("配置名称（可选，用于切换）:")
        .with_help_message("留空则不保存备份")
        .prompt_skippable()?;

    // 应用配置
    match ConfigService::apply_config(
        &tool,
        &api_key,
        &base_url,
        profile_name.as_deref(),
    ) {
        Ok(_) => {
            println!("{} 配置成功！", "✓".green());
            if let Some(profile) = profile_name {
                println!("  配置已保存为: {}", profile.yellow());
            }
        }
        Err(e) => {
            eprintln!("{} 配置失败: {}", "✗".red(), e.to_string().red());
        }
    }

    Ok(())
}

/// 切换配置
async fn switch_config(tool_name: Option<String>) -> Result<()> {
    let tool = match tool_name {
        Some(name) => Tool::by_id(&name)
            .ok_or_else(|| anyhow::anyhow!("未知工具: {}", name))?,
        None => {
            let all_tools = Tool::all();
            let tool_names: Vec<String> = all_tools.iter().map(|t| t.name.clone()).collect();
            let choice = Select::new("选择工具:", tool_names).prompt()?;
            all_tools.into_iter().find(|t| t.name == choice).unwrap()
        }
    };

    println!("\n{} {}", "切换配置".cyan(), tool.name.bold());

    // 列出可用配置
    let profiles = ConfigService::list_profiles(&tool)?;

    if profiles.is_empty() {
        println!("{} 没有保存的配置", "⚠".yellow());
        return Ok(());
    }

    let mut options = profiles.clone();
    options.push("🗑️  删除配置".to_string());

    let choice = Select::new("选择配置:", options).prompt()?;

    if choice == "🗑️  删除配置" {
        let to_delete = Select::new("选择要删除的配置:", profiles).prompt()?;

        let confirm = Confirm::new(&format!("确认删除配置 '{}'？", to_delete))
            .with_default(false)
            .prompt()?;

        if confirm {
            ConfigService::delete_profile(&tool, &to_delete)?;
            println!("{} 配置已删除", "✓".green());
        }
    } else {
        ConfigService::activate_profile(&tool, &choice)?;
        println!("{} 已切换到配置: {}", "✓".green(), choice.yellow());
    }

    Ok(())
}

/// 更新工具
async fn update_tool(tool_name: Option<String>) -> Result<()> {
    let tool = match tool_name {
        Some(name) => Tool::by_id(&name)
            .ok_or_else(|| anyhow::anyhow!("未知工具: {}", name))?,
        None => {
            let all_tools = Tool::all();
            let tool_names: Vec<String> = all_tools.iter().map(|t| t.name.clone()).collect();
            let choice = Select::new("选择要更新的工具:", tool_names).prompt()?;
            all_tools.into_iter().find(|t| t.name == choice).unwrap()
        }
    };

    println!("\n{} {}", "正在更新".cyan(), tool.name.bold());

    let installer = InstallerService::new();

    // 检查是否已安装
    if !installer.is_installed(&tool).await {
        eprintln!("{} 未安装，请先安装", "✗".red());
        return Ok(());
    }

    // 执行更新
    match installer.update(&tool).await {
        Ok(_) => {
            println!("{} {} 更新成功！", "✓".green(), tool.name.green());

            // 显示新版本
            if let Some(version) = installer.get_installed_version(&tool).await {
                println!("  当前版本: {}", format!("v{}", version).yellow());
            }
        }
        Err(e) => {
            eprintln!("{} 更新失败: {}", "✗".red(), e.to_string().red());
        }
    }

    Ok(())
}
