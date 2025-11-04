const chalk = require('chalk');
const path = require('path');
const fs = require('fs');
const { TOOLS, PROVIDERS } = require('./constants');
const {
  readJsonFile,
  writeJsonFile,
  readTomlFile,
  writeTomlFile,
  ensureDir
} = require('./utils');

/**
 * 配置 API
 * 新方案：配置文件使用后缀保存
 * 生效的: settings.json
 * 备份的: settings.{profileName}.json
 */
async function configureAPI(toolKey, config) {
  const { provider, apiKey, baseUrl, profileName } = config;
  const tool = TOOLS[toolKey];

  if (!tool) {
    console.log(chalk.red(`❌ 未知工具: ${toolKey}`));
    return false;
  }

  // 显示专用分组提示
  console.log(chalk.cyan(`\n⚙️  正在配置 ${tool.name}...`));

  if (provider === 'duckcoding') {
    console.log(chalk.yellow('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━'));
    console.log(chalk.bold.yellow('⚠️  重要提示：请使用专用分组密钥！'));
    console.log(chalk.yellow('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━'));
    console.log(chalk.white(`\n配置 ${tool.name} 时，必须使用【${tool.groupName}】的密钥！\n`));
    console.log(chalk.gray('获取步骤：'));
    console.log(chalk.gray('1. 访问: https://duckcoding.com/console/token'));
    console.log(chalk.gray(`2. 点击 "创建新密钥"`));
    console.log(chalk.gray(`3. 在 "令牌分组" 中选择【${tool.groupName}】`));
    console.log(chalk.gray('4. 复制生成的 API Key\n'));
    console.log(chalk.red('❌ 不要使用其他分组的密钥，否则无法正常使用！\n'));
  }

  console.log(chalk.gray(`   提供商: ${provider}`));
  console.log(chalk.gray(`   Base URL: ${baseUrl}`));
  console.log(chalk.gray(`   配置名称: ${profileName}\n`));

  // 应用配置到工具（生效的配置）
  const applied = await applyConfig(toolKey, { provider, apiKey, baseUrl });

  if (!applied) {
    console.log(chalk.red(`❌ ${tool.name} 配置失败`));
    return false;
  }

  // 同时保存为带 profile 名称的备份文件
  await saveBackupConfig(toolKey, { provider, apiKey, baseUrl, profileName });

  console.log(chalk.green(`✅ ${tool.name} 配置成功！`));
  console.log(chalk.gray(`\n生效的配置: ${path.join(tool.configDir, tool.configFile)}`));
  console.log(chalk.gray(`备份配置: ${getBackupPath(tool, profileName)}\n`));

  return true;
}

/**
 * 应用配置到工具（生成生效的配置文件）
 */
async function applyConfig(toolKey, config) {
  const tool = TOOLS[toolKey];
  const { apiKey, baseUrl } = config;

  try {
    ensureDir(tool.configDir);
    const configPath = path.join(tool.configDir, tool.configFile);

    if (toolKey === 'claude-code') {
      // 读取现有配置，保留用户的自定义设置
      let settings = readJsonFile(configPath) || {};

      // 确保有 env 字段
      if (!settings.env) settings.env = {};

      // 只更新 API 相关的字段，保留其他用户配置
      settings.env[tool.envVars.apiKey] = apiKey;       // ANTHROPIC_AUTH_TOKEN
      settings.env[tool.envVars.baseUrl] = baseUrl;     // ANTHROPIC_BASE_URL

      return writeJsonFile(configPath, settings);

    } else if (toolKey === 'codex') {
      // 读取现有配置，保留用户的自定义设置
      console.log(chalk.gray(`CodeX配置路径: ${configPath}`));
      let config = readTomlFile(configPath) || {};
      console.log(chalk.gray(`现有配置:`, JSON.stringify(config, null, 2)));

      // 只更新必要的字段，保留用户的其他配置
      if (!config.model_provider) config.model_provider = 'duckcoding';
      if (!config.model) config.model = 'gpt-5-codex';
      if (!config.model_reasoning_effort) config.model_reasoning_effort = 'high';
      if (!config.network_access) config.network_access = 'enabled';
      if (!config.disable_response_storage) config.disable_response_storage = true;

      // 更新 provider 配置
      if (!config.model_providers) config.model_providers = {};
      const providerKey = baseUrl.includes('duckcoding') ? 'duckcoding' : 'custom';

      config.model_providers[providerKey] = {
        name: providerKey,
        base_url: baseUrl.endsWith('/v1') ? baseUrl : `${baseUrl}/v1`,
        wire_api: 'responses',
        requires_openai_auth: true
      };

      console.log(chalk.gray(`要写入的配置:`, JSON.stringify(config, null, 2)));
      const configSuccess = writeTomlFile(configPath, config);
      console.log(chalk.gray(`config.toml 写入结果: ${configSuccess}`));

      // 更新 auth.json（只更新 API Key，保留其他字段）
      const authPath = path.join(tool.configDir, 'auth.json');
      console.log(chalk.gray(`auth.json路径: ${authPath}`));
      let authData = readJsonFile(authPath) || {};
      authData.OPENAI_API_KEY = apiKey;
      console.log(chalk.gray(`要写入的auth.json:`, JSON.stringify(authData, null, 2)));
      const authSuccess = writeJsonFile(authPath, authData);
      console.log(chalk.gray(`auth.json 写入结果: ${authSuccess}`));

      if (!configSuccess) {
        throw new Error('写入 config.toml 失败');
      }
      if (!authSuccess) {
        throw new Error('写入 auth.json 失败');
      }

      return configSuccess && authSuccess;

    } else if (toolKey === 'gemini-cli') {
      // 读取现有 .env 文件，保留其他环境变量
      const envPath = path.join(tool.configDir, '.env');
      let existingEnv = {};

      if (fs.existsSync(envPath)) {
        const envContent = fs.readFileSync(envPath, 'utf-8');
        // 解析现有的环境变量
        envContent.split('\n').forEach(line => {
          const trimmed = line.trim();
          if (trimmed && !trimmed.startsWith('#')) {
            const [key, ...valueParts] = trimmed.split('=');
            if (key) {
              existingEnv[key.trim()] = valueParts.join('=').trim();
            }
          }
        });
      }

      // 更新 API 相关的环境变量
      existingEnv['GOOGLE_GEMINI_BASE_URL'] = baseUrl;
      existingEnv['GEMINI_API_KEY'] = apiKey;
      if (!existingEnv['GEMINI_MODEL']) {
        existingEnv['GEMINI_MODEL'] = 'gemini-2.5-pro';
      }

      // 重新生成 .env 文件内容
      const envContent = Object.entries(existingEnv)
        .map(([key, value]) => `${key}=${value}`)
        .join('\n') + '\n';

      ensureDir(path.dirname(envPath));
      fs.writeFileSync(envPath, envContent, 'utf-8');

      // 读取并更新 settings.json，保留用户的其他配置
      let settings = readJsonFile(configPath) || {};

      if (!settings.ide) settings.ide = { enabled: true };
      if (!settings.security) {
        settings.security = { auth: { selectedType: 'gemini-api-key' } };
      }

      return writeJsonFile(configPath, settings);
    }

    return false;
  } catch (error) {
    console.error(chalk.red(`配置失败: ${error.message}`));
    return false;
  }
}

/**
 * 保存备份配置（带 profile 名称）
 */
async function saveBackupConfig(toolKey, config) {
  const tool = TOOLS[toolKey];
  const { apiKey, baseUrl, profileName } = config;

  try {
    if (toolKey === 'claude-code') {
      const backupPath = getBackupPath(tool, profileName);

      // 简化的配置，只保存必要字段
      let settings = {
        env: {
          [tool.envVars.apiKey]: apiKey,
          [tool.envVars.baseUrl]: baseUrl
        }
      };

      writeJsonFile(backupPath, settings);

    } else if (toolKey === 'codex') {
      // config.toml 备份
      const backupConfigPath = path.join(tool.configDir, `config.${profileName}.toml`);
      let config = {};

      config.model_provider = 'duckcoding';
      config.model = 'gpt-5-codex';
      config.model_reasoning_effort = 'high';
      config.network_access = 'enabled';
      config.disable_response_storage = true;

      config.model_providers = {};
      const providerKey = baseUrl.includes('duckcoding') ? 'duckcoding' : 'custom';
      config.model_providers[providerKey] = {
        name: providerKey,
        base_url: baseUrl.endsWith('/v1') ? baseUrl : `${baseUrl}/v1`,
        wire_api: 'responses',
        requires_openai_auth: true
      };

      writeTomlFile(backupConfigPath, config);

      // auth.json 备份
      const backupAuthPath = path.join(tool.configDir, `auth.${profileName}.json`);
      writeJsonFile(backupAuthPath, { OPENAI_API_KEY: apiKey });

    } else if (toolKey === 'gemini-cli') {
      // .env 备份
      const backupEnvPath = path.join(tool.configDir, `.env.${profileName}`);
      const envContent = `GOOGLE_GEMINI_BASE_URL=${baseUrl}
GEMINI_API_KEY=${apiKey}
GEMINI_MODEL=gemini-2.5-pro
`;
      fs.writeFileSync(backupEnvPath, envContent, 'utf-8');

      // settings.json 备份
      const backupSettingsPath = getBackupPath(tool, profileName);
      const settings = {
        ide: { enabled: true },
        security: { auth: { selectedType: 'gemini-api-key' } }
      };
      writeJsonFile(backupSettingsPath, settings);
    }

    return true;
  } catch (error) {
    console.error(chalk.red(`保存备份配置失败: ${error.message}`));
    return false;
  }
}

/**
 * 获取备份文件路径
 */
function getBackupPath(tool, profileName) {
  const ext = path.extname(tool.configFile);
  const basename = path.basename(tool.configFile, ext);
  return path.join(tool.configDir, `${basename}.${profileName}${ext}`);
}

/**
 * 列出所有保存的配置
 */
function listSavedProfiles(toolKey) {
  const tool = TOOLS[toolKey];
  const profiles = [];

  try {
    ensureDir(tool.configDir);
    const files = fs.readdirSync(tool.configDir);

    const ext = path.extname(tool.configFile);
    const basename = path.basename(tool.configFile, ext);

    // 改进的正则表达式，支持任意字符（包括中文）
    const escapeExt = ext.replace('.', '\\.');
    const pattern = new RegExp(`^${basename}\\.(.+)${escapeExt}$`);

    files.forEach(file => {
      const match = file.match(pattern);
      if (match && match[1]) {
        profiles.push(match[1]); // profile 名称
      }
    });

    return profiles;
  } catch (error) {
    console.error(chalk.red(`读取配置文件失败: ${error.message}`));
    return [];
  }
}

/**
 * 切换配置
 */
async function switchAPI(toolKey) {
  const tool = TOOLS[toolKey];
  if (!tool) {
    console.log(chalk.red(`❌ 未知工具: ${toolKey}`));
    return false;
  }

  const profiles = listSavedProfiles(toolKey);

  if (profiles.length === 0) {
    console.log(chalk.yellow(`\n⚠️  ${tool.name} 没有保存的配置`));
    console.log(chalk.gray('请先使用 "配置 API Key" 创建配置\n'));
    return false;
  }

  console.log(chalk.cyan(`\n🔄 ${tool.name} - 可用配置:\n`));

  const inquirer = require('inquirer');

  const choices = profiles.map(profile => ({
    name: `${profile}`,
    value: profile
  }));

  choices.push({
    name: chalk.red('🗑️  删除配置...'),
    value: '__delete__'
  });

  const { selectedProfile } = await inquirer.prompt([
    {
      type: 'list',
      name: 'selectedProfile',
      message: '选择配置:',
      choices
    }
  ]);

  if (selectedProfile === '__delete__') {
    return await deleteProfile(toolKey, profiles);
  }

  // 切换配置：复制备份文件到生效文件
  const success = await activateProfile(toolKey, selectedProfile);

  if (success) {
    console.log(chalk.green(`\n✅ 已切换到配置: ${selectedProfile}`));
    console.log(chalk.gray(`当前生效: ${path.join(tool.configDir, tool.configFile)}\n`));
    return true;
  } else {
    console.log(chalk.red(`\n❌ 切换配置失败`));
    return false;
  }
}

/**
 * 激活指定的 profile（合并配置而不是覆盖）
 */
async function activateProfile(toolKey, profileName) {
  const tool = TOOLS[toolKey];

  try {
    if (toolKey === 'claude-code') {
      const backupPath = getBackupPath(tool, profileName);
      const activePath = path.join(tool.configDir, tool.configFile);

      if (!fs.existsSync(backupPath)) {
        console.log(chalk.red(`配置文件不存在: ${backupPath}`));
        return false;
      }

      // 读取备份配置和当前配置
      const backupConfig = readJsonFile(backupPath);
      const activeConfig = readJsonFile(activePath) || {};

      if (!backupConfig || !backupConfig.env) {
        console.log(chalk.red('备份配置格式错误'));
        return false;
      }

      // 合并配置：只更新 API 相关字段
      if (!activeConfig.env) activeConfig.env = {};
      activeConfig.env[tool.envVars.apiKey] = backupConfig.env[tool.envVars.apiKey];
      activeConfig.env[tool.envVars.baseUrl] = backupConfig.env[tool.envVars.baseUrl];

      // 保存合并后的配置
      writeJsonFile(activePath, activeConfig);

    } else if (toolKey === 'codex') {
      // 复制 config.toml - 读取并合并
      const backupConfigPath = path.join(tool.configDir, `config.${profileName}.toml`);
      const activeConfigPath = path.join(tool.configDir, 'config.toml');

      if (!fs.existsSync(backupConfigPath)) {
        console.log(chalk.red(`配置文件不存在: ${backupConfigPath}`));
        return false;
      }

      const backupConfig = readTomlFile(backupConfigPath);
      const activeConfig = readTomlFile(activeConfigPath) || {};

      if (!backupConfig) {
        console.log(chalk.red('备份配置格式错误'));
        return false;
      }

      // 合并配置：只更新 API 相关字段
      if (backupConfig.model_provider) activeConfig.model_provider = backupConfig.model_provider;
      if (backupConfig.model) activeConfig.model = backupConfig.model;
      if (backupConfig.model_reasoning_effort) activeConfig.model_reasoning_effort = backupConfig.model_reasoning_effort;
      if (backupConfig.network_access) activeConfig.network_access = backupConfig.network_access;
      if (backupConfig.disable_response_storage !== undefined) activeConfig.disable_response_storage = backupConfig.disable_response_storage;

      // 更新 provider 配置
      if (backupConfig.model_providers) {
        if (!activeConfig.model_providers) activeConfig.model_providers = {};
        Object.assign(activeConfig.model_providers, backupConfig.model_providers);
      }

      writeTomlFile(activeConfigPath, activeConfig);

      // 更新 auth.json - 合并
      const backupAuthPath = path.join(tool.configDir, `auth.${profileName}.json`);
      const activeAuthPath = path.join(tool.configDir, 'auth.json');

      if (fs.existsSync(backupAuthPath)) {
        const backupAuth = readJsonFile(backupAuthPath);
        const activeAuth = readJsonFile(activeAuthPath) || {};

        if (backupAuth && backupAuth.OPENAI_API_KEY) {
          activeAuth.OPENAI_API_KEY = backupAuth.OPENAI_API_KEY;
          writeJsonFile(activeAuthPath, activeAuth);
        }
      }

    } else if (toolKey === 'gemini-cli') {
      // 复制 .env - 解析并合并
      const backupEnvPath = path.join(tool.configDir, `.env.${profileName}`);
      const activeEnvPath = path.join(tool.configDir, '.env');

      if (!fs.existsSync(backupEnvPath)) {
        console.log(chalk.red(`配置文件不存在: ${backupEnvPath}`));
        return false;
      }

      // 读取备份的环境变量
      const backupEnvContent = fs.readFileSync(backupEnvPath, 'utf-8');
      let backupEnv = {};
      backupEnvContent.split('\n').forEach(line => {
        const trimmed = line.trim();
        if (trimmed && !trimmed.startsWith('#')) {
          const [key, ...valueParts] = trimmed.split('=');
          if (key) {
            backupEnv[key.trim()] = valueParts.join('=').trim();
          }
        }
      });

      // 读取当前的环境变量
      let activeEnv = {};
      if (fs.existsSync(activeEnvPath)) {
        const activeEnvContent = fs.readFileSync(activeEnvPath, 'utf-8');
        activeEnvContent.split('\n').forEach(line => {
          const trimmed = line.trim();
          if (trimmed && !trimmed.startsWith('#')) {
            const [key, ...valueParts] = trimmed.split('=');
            if (key) {
              activeEnv[key.trim()] = valueParts.join('=').trim();
            }
          }
        });
      }

      // 合并：只更新 API 相关字段
      if (backupEnv['GOOGLE_GEMINI_BASE_URL']) activeEnv['GOOGLE_GEMINI_BASE_URL'] = backupEnv['GOOGLE_GEMINI_BASE_URL'];
      if (backupEnv['GEMINI_API_KEY']) activeEnv['GEMINI_API_KEY'] = backupEnv['GEMINI_API_KEY'];
      if (backupEnv['GEMINI_MODEL']) activeEnv['GEMINI_MODEL'] = backupEnv['GEMINI_MODEL'];

      // 写回 .env
      const envContent = Object.entries(activeEnv)
        .map(([key, value]) => `${key}=${value}`)
        .join('\n') + '\n';
      fs.writeFileSync(activeEnvPath, envContent, 'utf-8');

      // 复制 settings.json - 合并
      const backupSettingsPath = getBackupPath(tool, profileName);
      const activeSettingsPath = path.join(tool.configDir, tool.configFile);

      if (fs.existsSync(backupSettingsPath)) {
        const backupSettings = readJsonFile(backupSettingsPath);
        const activeSettings = readJsonFile(activeSettingsPath) || {};

        // 合并：只更新必要字段
        if (backupSettings) {
          if (backupSettings.ide) activeSettings.ide = backupSettings.ide;
          if (backupSettings.security) activeSettings.security = backupSettings.security;
          writeJsonFile(activeSettingsPath, activeSettings);
        }
      }
    }

    return true;
  } catch (error) {
    console.error(chalk.red(`激活配置失败: ${error.message}`));
    return false;
  }
}

/**
 * 删除配置
 */
async function deleteProfile(toolKey, profiles) {
  const tool = TOOLS[toolKey];
  const inquirer = require('inquirer');

  const { profileToDelete } = await inquirer.prompt([
    {
      type: 'list',
      name: 'profileToDelete',
      message: '选择要删除的配置:',
      choices: profiles
    }
  ]);

  const { confirm } = await inquirer.prompt([
    {
      type: 'confirm',
      name: 'confirm',
      message: `确认删除配置 "${profileToDelete}"?`,
      default: false
    }
  ]);

  if (confirm) {
    try {
      if (toolKey === 'claude-code') {
        const backupPath = getBackupPath(tool, profileToDelete);
        if (fs.existsSync(backupPath)) {
          fs.unlinkSync(backupPath);
        }

      } else if (toolKey === 'codex') {
        const backupConfigPath = path.join(tool.configDir, `config.${profileToDelete}.toml`);
        const backupAuthPath = path.join(tool.configDir, `auth.${profileToDelete}.json`);

        if (fs.existsSync(backupConfigPath)) fs.unlinkSync(backupConfigPath);
        if (fs.existsSync(backupAuthPath)) fs.unlinkSync(backupAuthPath);

      } else if (toolKey === 'gemini-cli') {
        const backupEnvPath = path.join(tool.configDir, `.env.${profileToDelete}`);
        const backupSettingsPath = getBackupPath(tool, profileToDelete);

        if (fs.existsSync(backupEnvPath)) fs.unlinkSync(backupEnvPath);
        if (fs.existsSync(backupSettingsPath)) fs.unlinkSync(backupSettingsPath);
      }

      console.log(chalk.green(`\n✅ 已删除配置: ${profileToDelete}`));
      return true;
    } catch (error) {
      console.log(chalk.red(`\n❌ 删除配置失败: ${error.message}`));
      return false;
    }
  }

  return false;
}

/**
 * 列出所有配置
 */
async function listConfigs() {
  console.log(chalk.bold.cyan('\n📋 当前配置:\n'));

  let hasConfigs = false;

  for (const [toolKey, tool] of Object.entries(TOOLS)) {
    const profiles = listSavedProfiles(toolKey);

    console.log(chalk.bold(`${tool.name}:`));
    console.log(chalk.gray(`  配置目录: ${tool.configDir}`));

    if (profiles.length === 0) {
      console.log(chalk.gray(`  无保存的配置\n`));
      continue;
    }

    hasConfigs = true;

    // 显示当前生效的配置
    const activePath = path.join(tool.configDir, tool.configFile);
    if (fs.existsSync(activePath)) {
      console.log(chalk.green(`  ✓ 当前生效: ${tool.configFile}`));
    }

    // 显示所有备份配置
    console.log(chalk.gray(`  保存的配置:`));
    profiles.forEach(profile => {
      const backupPath = getBackupPath(tool, profile);
      console.log(chalk.gray(`    • ${profile} → ${path.basename(backupPath)}`));
    });

    console.log('');
  }

  if (!hasConfigs) {
    console.log(chalk.yellow('⚠️  没有保存的配置'));
    console.log(chalk.gray('使用 "配置 API Key" 创建第一个配置\n'));
  }
}

module.exports = {
  configureAPI,
  applyConfig,
  switchAPI,
  listConfigs,
  deleteProfile
};
