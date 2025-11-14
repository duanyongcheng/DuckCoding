import { useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Info, ExternalLink, Loader2, Save, Sparkles, Package } from 'lucide-react';
import { PageContainer } from '@/components/layout/PageContainer';
import { ConfigOverrideDialog } from '@/components/dialogs/ConfigOverrideDialog';
import { logoMap, groupNameMap, getToolDisplayName } from '@/utils/constants';
import { openExternalLink } from '@/utils/formatting';
import { useToast } from '@/hooks/use-toast';
import {
  checkInstallations,
  configureApi,
  getActiveConfig,
  listProfiles,
  generateApiKeyForTool,
  getGlobalConfig,
  type ToolStatus,
  type ActiveConfig,
  type GlobalConfig,
} from '@/lib/tauri-commands';

interface ConfigurationPageProps {
  tools: ToolStatus[];
  loading: boolean;
}

export function ConfigurationPage({ tools: toolsProp, loading: loadingProp }: ConfigurationPageProps) {
  const { toast } = useToast();
  const [tools, setTools] = useState<ToolStatus[]>(toolsProp);
  const [loading, setLoading] = useState(loadingProp);
  const [selectedTool, setSelectedTool] = useState<string>('');
  const [provider, setProvider] = useState<string>('duckcoding');
  const [apiKey, setApiKey] = useState<string>('');
  const [baseUrl, setBaseUrl] = useState<string>('');
  const [profileName, setProfileName] = useState<string>('');
  const [configuring, setConfiguring] = useState(false);
  const [generatingKey, setGeneratingKey] = useState(false);
  const [activeConfigs, setActiveConfigs] = useState<Record<string, ActiveConfig>>({});
  const [profiles, setProfiles] = useState<Record<string, string[]>>({});
  const [globalConfig, setGlobalConfig] = useState<GlobalConfig | null>(null);

  const [configOverrideDialog, setConfigOverrideDialog] = useState<{
    open: boolean;
    targetProfile: string;
    willOverride: boolean;
  }>({ open: false, targetProfile: '', willOverride: false });

  // 同步外部 tools 数据
  useEffect(() => {
    setTools(toolsProp);
    setLoading(loadingProp);
  }, [toolsProp, loadingProp]);

  // 通知父组件刷新工具列表
  const refreshTools = () => {
    window.dispatchEvent(new CustomEvent('refresh-tools'));
  };

  // 加载全局配置
  useEffect(() => {
    const loadConfig = async () => {
      try {
        const config = await getGlobalConfig();
        setGlobalConfig(config);
      } catch (error) {
        console.error('Failed to load global config:', error);
      }
    };

    loadConfig();
  }, []);

  // 加载所有配置文件和当前激活配置
  const loadAllProfiles = useCallback(async () => {
    const installedTools = tools.filter((t) => t.installed);
    const profileData: Record<string, string[]> = {};
    const configData: Record<string, ActiveConfig> = {};

    for (const tool of installedTools) {
      try {
        const toolProfiles = await listProfiles(tool.id);
        profileData[tool.id] = toolProfiles;
      } catch (error) {
        console.error('Failed to load profiles for ' + tool.id, error);
        profileData[tool.id] = [];
      }

      try {
        const activeConfig = await getActiveConfig(tool.id);
        configData[tool.id] = activeConfig;
      } catch (error) {
        console.error('Failed to load active config for ' + tool.id, error);
        configData[tool.id] = { api_key: '未配置', base_url: '未配置' };
      }
    }

    setProfiles(profileData);
    setActiveConfigs(configData);
  }, [tools]);

  // 当工具加载完成后，设置默认选中的工具并加载配置
  useEffect(() => {
    const installedTools = tools.filter((t) => t.installed);
    if (!selectedTool && installedTools.length > 0) {
      setSelectedTool(installedTools[0].id);
    }
    if (installedTools.length > 0) {
      loadAllProfiles();
    }
  }, [tools, selectedTool, loadAllProfiles]);

  // 生成 API Key
  const handleGenerateApiKey = async () => {
    if (!selectedTool) {
      toast({
        title: '请先选择工具',
        description: '请先选择要配置的工具',
        variant: 'destructive',
      });
      return;
    }

    if (!globalConfig?.user_id || !globalConfig?.system_token) {
      toast({
        title: '缺少配置',
        description: '请先在全局设置中配置用户ID和系统访问令牌',
        variant: 'destructive',
      });
      // 通知父组件切换到设置页面
      window.dispatchEvent(new CustomEvent('navigate-to-settings'));
      return;
    }

    try {
      setGeneratingKey(true);
      const result = await generateApiKeyForTool(selectedTool);

      if (result.success && result.api_key) {
        setApiKey(result.api_key);
        toast({
          title: '生成成功',
          description: 'API Key生成成功！已自动填入配置框',
        });
      } else {
        toast({
          title: '生成失败',
          description: result.message || '未知错误',
          variant: 'destructive',
        });
      }
    } catch (error) {
      console.error('Failed to generate API key:', error);
      toast({
        title: '生成失败',
        description: String(error),
        variant: 'destructive',
      });
    } finally {
      setGeneratingKey(false);
    }
  };

  // 配置 API
  const handleConfigureApi = async () => {
    if (!selectedTool || !apiKey) {
      toast({
        title: '请填写必填项',
        description: (!selectedTool ? '• 请选择工具\n' : '') + (!apiKey ? '• 请输入 API Key' : ''),
        variant: 'destructive',
      });
      return;
    }

    if (provider === 'custom' && !baseUrl.trim()) {
      toast({
        title: '请填写 Base URL',
        description: '选择自定义端点时必须填写有效的 Base URL',
        variant: 'destructive',
      });
      return;
    }

    // 确保拥有最新的配置数据（防止状态尚未同步）
    let currentConfig = activeConfigs[selectedTool];
    if (!currentConfig) {
      try {
        const latestConfig = await getActiveConfig(selectedTool);
        setActiveConfigs((prev) => ({ ...prev, [selectedTool]: latestConfig }));
        currentConfig = latestConfig;
      } catch (error) {
        console.error('Failed to fetch active config before saving:', error);
      }
    }

    // 检查是否会覆盖现有配置
    const existingProfiles = profiles[selectedTool] || [];

    // 只有真实配置存在才认为会覆盖（排除"未配置"的默认值）
    const hasRealConfig =
      currentConfig && currentConfig.api_key !== '未配置' && currentConfig.base_url !== '未配置';

    const willOverride = profileName ? existingProfiles.includes(profileName) : hasRealConfig;

    // 如果会覆盖且未确认，显示确认对话框
    if (willOverride && !configOverrideDialog.open) {
      setConfigOverrideDialog({
        open: true,
        targetProfile: profileName || '主配置',
        willOverride: true,
      });
      return;
    }

    // 执行保存配置（从确认对话框调用或无需确认时）
    await performConfigSave();
  };

  // 实际执行配置保存的函数
  const performConfigSave = async () => {
    try {
      setConfiguring(true);

      // 调用后端 API
      await configureApi(
        selectedTool,
        provider,
        apiKey,
        provider === 'custom' ? baseUrl.trim() : undefined,
        profileName || undefined,
      );

      // 清空表单
      setApiKey('');
      setBaseUrl('');
      setProfileName('');

      // 重新加载配置列表，但不要阻塞 UI
      loadAllProfiles().catch((error) => {
        console.error('Failed to refresh profiles after saving config:', error);
      });

      // 关闭确认对话框
      setConfigOverrideDialog({ open: false, targetProfile: '', willOverride: false });

      // 弹窗提示成功
      toast({
        title: '配置保存成功',
        description: `${getToolDisplayName(selectedTool)} 配置保存成功！${profileName ? `\n配置名称: ${profileName}` : ''}`,
      });
    } catch (error) {
      console.error('Failed to configure API:', error);
      toast({
        title: '配置失败',
        description: String(error),
        variant: 'destructive',
      });
    } finally {
      setConfiguring(false);
    }
  };

  // 切换到安装页面
  const switchToInstall = () => {
    window.dispatchEvent(new CustomEvent('navigate-to-install'));
  };

  const installedTools = tools.filter((t) => t.installed);

  return (
    <PageContainer>
      <div className="mb-6">
        <h2 className="text-2xl font-semibold mb-1">配置 API</h2>
        <p className="text-sm text-muted-foreground">配置 DuckCoding API 或自定义 API 端点</p>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <span className="ml-3 text-muted-foreground">加载中...</span>
        </div>
      ) : installedTools.length > 0 ? (
        <div className="grid gap-4">
          {/* 重要提示 */}
          <div className="p-4 bg-gradient-to-r from-amber-50 to-orange-50 dark:from-amber-950 dark:to-orange-950 rounded-lg border border-amber-200 dark:border-amber-800">
            <div className="flex items-start gap-2 mb-3">
              <Info className="h-4 w-4 flex-shrink-0 mt-0.5" />
              <div className="space-y-2">
                <h4 className="font-semibold text-amber-900 dark:text-amber-100">重要提示</h4>
                <div className="text-sm text-amber-800 dark:text-amber-200 space-y-2">
                  <div>
                    <p className="font-semibold mb-1">DuckCoding API Key 分组:</p>
                    <ul className="list-disc list-inside space-y-1 ml-2">
                      {selectedTool && groupNameMap[selectedTool] && (
                        <li>
                          当前工具需要使用{' '}
                          <span className="font-mono bg-amber-100 dark:bg-amber-900 px-1.5 py-0.5 rounded">
                            {groupNameMap[selectedTool]}
                          </span>{' '}
                          的 API Key
                        </li>
                      )}
                      <li>每个工具必须使用其专用分组的 API Key</li>
                      <li>API Key 不能混用</li>
                    </ul>
                  </div>
                  <div>
                    <p className="font-semibold mb-1">获取 API Key:</p>
                    <button
                      onClick={() => openExternalLink('https://duckcoding.com/console/token')}
                      className="inline-flex items-center gap-1 text-amber-700 dark:text-amber-300 hover:underline font-medium cursor-pointer bg-transparent border-0 p-0"
                    >
                      访问 DuckCoding 控制台 <ExternalLink className="h-3 w-3" />
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <Card className="shadow-sm border">
            <CardHeader>
              <CardTitle>API 配置</CardTitle>
              <CardDescription>为已安装的工具配置 API 密钥</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="tool-select">选择工具 *</Label>
                  <Select value={selectedTool} onValueChange={setSelectedTool}>
                    <SelectTrigger id="tool-select" className="shadow-sm">
                      <SelectValue placeholder="选择要配置的工具" />
                    </SelectTrigger>
                    <SelectContent>
                      {installedTools.map((tool) => (
                        <SelectItem key={tool.id} value={tool.id}>
                          <div className="flex items-center gap-2">
                            <img src={logoMap[tool.id]} className="w-4 h-4" />
                            {tool.name}
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="provider-select">API 提供商 *</Label>
                  <Select value={provider} onValueChange={setProvider}>
                    <SelectTrigger id="provider-select" className="shadow-sm">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="duckcoding">DuckCoding (推荐)</SelectItem>
                      <SelectItem value="custom">自定义端点</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="api-key">API Key *</Label>
                  <div className="flex gap-2">
                    <Input
                      id="api-key"
                      type="password"
                      placeholder="输入 API Key"
                      value={apiKey}
                      onChange={(e) => setApiKey(e.target.value)}
                      className="shadow-sm flex-1"
                    />
                    <Button
                      onClick={handleGenerateApiKey}
                      disabled={generatingKey || !selectedTool}
                      variant="outline"
                      className="shadow-sm hover:shadow-md transition-all"
                      title="一键生成 DuckCoding API Key"
                    >
                      {generatingKey ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          生成中...
                        </>
                      ) : (
                        <>
                          <Sparkles className="mr-2 h-4 w-4" />
                          一键生成
                        </>
                      )}
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    点击"一键生成"可自动创建 DuckCoding API Key（需先配置全局设置）
                  </p>
                </div>

                {provider === 'duckcoding' && (
                  <div className="rounded-lg bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 p-4">
                    <div className="flex items-start gap-2 mb-3">
                      <Info className="h-4 w-4 text-blue-600 dark:text-blue-400 flex-shrink-0 mt-0.5" />
                      <div className="space-y-2 flex-1">
                        <p className="text-xs font-semibold text-blue-800 dark:text-blue-200">
                          点击"改用 npm 安装"将自动切换为 npm 方式并重新安装
                        </p>
                        <p className="text-xs text-blue-700 dark:text-blue-300">
                          npm 安装会直接从 npm 仓库获取最新版本
                        </p>
                      </div>
                    </div>
                  </div>
                )}

                {provider === 'custom' && (
                  <div className="space-y-2">
                    <Label htmlFor="base-url">Base URL *</Label>
                    <Input
                      id="base-url"
                      type="url"
                      placeholder="https://api.example.com"
                      value={baseUrl}
                      onChange={(e) => setBaseUrl(e.target.value)}
                      className="shadow-sm"
                    />
                  </div>
                )}

                <div className="space-y-2">
                  <Label htmlFor="profile-name">配置文件名称 (可选)</Label>
                  <Input
                    id="profile-name"
                    type="text"
                    placeholder="例如: work, personal"
                    value={profileName}
                    onChange={(e) => setProfileName(e.target.value)}
                    className="shadow-sm"
                  />
                  <p className="text-xs text-muted-foreground">
                    留空将直接保存到主配置。填写名称可保存多个配置方便切换
                  </p>
                </div>
              </div>
            </CardContent>
            <CardFooter className="flex justify-between">
              <Button
                variant="outline"
                onClick={() => {
                  setApiKey('');
                  setBaseUrl('');
                  setProfileName('');
                }}
                className="shadow-sm"
              >
                清空
              </Button>
              <Button
                onClick={handleConfigureApi}
                disabled={configuring || !selectedTool || !apiKey}
                className="shadow-sm hover:shadow-md transition-all"
              >
                {configuring ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    保存中...
                  </>
                ) : (
                  <>
                    <Save className="mr-2 h-4 w-4" />
                    保存配置
                  </>
                )}
              </Button>
            </CardFooter>
          </Card>
        </div>
      ) : (
        <Card className="shadow-sm border">
          <CardContent className="pt-6">
            <div className="text-center py-12">
              <Package className="h-16 w-16 mx-auto mb-4 text-muted-foreground opacity-30" />
              <h3 className="text-lg font-semibold mb-2">暂无已安装的工具</h3>
              <p className="text-sm text-muted-foreground mb-4">请先安装工具后再进行配置</p>
              <Button
                onClick={switchToInstall}
                className="shadow-md hover:shadow-lg transition-all"
              >
                <Package className="mr-2 h-4 w-4" />
                前往安装
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* 配置覆盖确认对话框 */}
      <ConfigOverrideDialog
        open={configOverrideDialog.open}
        targetProfile={configOverrideDialog.targetProfile}
        onClose={() =>
          setConfigOverrideDialog({ open: false, targetProfile: '', willOverride: false })
        }
        onConfirm={performConfigSave}
      />
    </PageContainer>
  );
}
