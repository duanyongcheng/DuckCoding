import { useState, useEffect, useCallback } from 'react';
import {
  getGlobalConfig,
  saveGlobalConfig,
  type GlobalConfig,
} from '@/lib/tauri-commands';

export function useSettingsForm() {
  // 基本设置状态
  const [userId, setUserId] = useState('');
  const [systemToken, setSystemToken] = useState('');

  // 代理设置状态
  const [proxyEnabled, setProxyEnabled] = useState(false);
  const [proxyType, setProxyType] = useState<'http' | 'https' | 'socks5'>('http');
  const [proxyHost, setProxyHost] = useState('');
  const [proxyPort, setProxyPort] = useState('');
  const [proxyUsername, setProxyUsername] = useState('');
  const [proxyPassword, setProxyPassword] = useState('');

  // 实验性功能 - 透明代理
  const [transparentProxyEnabled, setTransparentProxyEnabled] = useState(false);
  const [transparentProxyPort, setTransparentProxyPort] = useState(8787);
  const [transparentProxyApiKey, setTransparentProxyApiKey] = useState('');
  const [transparentProxyAllowPublic, setTransparentProxyAllowPublic] = useState(false);

  // 状态
  const [globalConfig, setGlobalConfig] = useState<GlobalConfig | null>(null);
  const [savingSettings, setSavingSettings] = useState(false);

  // 加载全局配置
  const loadGlobalConfig = useCallback(async () => {
    try {
      const config = await getGlobalConfig();
      setGlobalConfig(config);

      // 填充表单
      setUserId(config.user_id || '');
      setSystemToken(config.system_token || '');
      setProxyEnabled(config.proxy_enabled || false);
      setProxyType(config.proxy_type || 'http');
      setProxyHost(config.proxy_host || '');
      setProxyPort(config.proxy_port || '');
      setProxyUsername(config.proxy_username || '');
      setProxyPassword(config.proxy_password || '');
      setTransparentProxyEnabled(config.transparent_proxy_enabled || false);
      setTransparentProxyPort(config.transparent_proxy_port || 8787);
      setTransparentProxyApiKey(config.transparent_proxy_api_key || '');
      setTransparentProxyAllowPublic(config.transparent_proxy_allow_public || false);
    } catch (error) {
      console.error('Failed to load global config:', error);
      throw error;
    }
  }, []);

  // 保存配置
  const saveSettings = useCallback(async (): Promise<void> => {
    const trimmedUserId = userId.trim();
    const trimmedToken = systemToken.trim();

    if (!trimmedUserId || !trimmedToken) {
      throw new Error('用户ID和系统访问令牌不能为空');
    }

    const proxyPortNumber = proxyPort ? parseInt(proxyPort) : 0;
    if (proxyEnabled && (!proxyHost.trim() || proxyPortNumber <= 0)) {
      throw new Error('代理地址和端口不能为空');
    }

    if (
      transparentProxyEnabled &&
      (!transparentProxyApiKey.trim() || transparentProxyPort <= 0)
    ) {
      throw new Error('透明代理 API Key 和端口不能为空');
    }

    setSavingSettings(true);
    try {
      const configToSave: GlobalConfig = {
        user_id: trimmedUserId,
        system_token: trimmedToken,
        proxy_enabled: proxyEnabled,
        proxy_type: proxyType,
        proxy_host: proxyHost.trim(),
        proxy_port: proxyPort,
        proxy_username: proxyUsername.trim(),
        proxy_password: proxyPassword,
        transparent_proxy_enabled: transparentProxyEnabled,
        transparent_proxy_port: transparentProxyPort,
        transparent_proxy_api_key: transparentProxyApiKey.trim(),
        transparent_proxy_allow_public: transparentProxyAllowPublic,
        transparent_proxy_real_api_key: globalConfig?.transparent_proxy_real_api_key || '',
        transparent_proxy_real_base_url: globalConfig?.transparent_proxy_real_base_url || '',
      };

      await saveGlobalConfig(configToSave);
      await loadGlobalConfig();
    } finally {
      setSavingSettings(false);
    }
  }, [
    userId,
    systemToken,
    proxyEnabled,
    proxyType,
    proxyHost,
    proxyPort,
    proxyUsername,
    proxyPassword,
    transparentProxyEnabled,
    transparentProxyPort,
    transparentProxyApiKey,
    transparentProxyAllowPublic,
    globalConfig,
    loadGlobalConfig,
  ]);

  // 生成代理 API Key
  const generateProxyKey = useCallback(() => {
    const charset = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let result = 'dc-proxy-';
    for (let i = 0; i < 32; i++) {
      result += charset.charAt(Math.floor(Math.random() * charset.length));
    }
    setTransparentProxyApiKey(result);
  }, []);

  return {
    // Basic settings
    userId,
    setUserId,
    systemToken,
    setSystemToken,

    // Proxy settings
    proxyEnabled,
    setProxyEnabled,
    proxyType,
    setProxyType,
    proxyHost,
    setProxyHost,
    proxyPort,
    setProxyPort,
    proxyUsername,
    setProxyUsername,
    proxyPassword,
    setProxyPassword,

    // Transparent proxy settings
    transparentProxyEnabled,
    setTransparentProxyEnabled,
    transparentProxyPort,
    setTransparentProxyPort,
    transparentProxyApiKey,
    setTransparentProxyApiKey,
    transparentProxyAllowPublic,
    setTransparentProxyAllowPublic,

    // State
    globalConfig,
    savingSettings,

    // Actions
    loadGlobalConfig,
    saveSettings,
    generateProxyKey,
  };
}
