import { useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Settings as SettingsIcon,
  Loader2,
  Save,
  Info,
  AlertCircle,
  Power,
  Sparkles,
} from 'lucide-react';
import { PageContainer } from '@/components/layout/PageContainer';
import { openExternalLink } from '@/utils/formatting';
import { useToast } from '@/hooks/use-toast';
import { useSettingsForm } from './hooks/useSettingsForm';
import { useTransparentProxy } from './hooks/useTransparentProxy';

export function SettingsPage() {
  const { toast } = useToast();

  // 使用自定义 Hooks
  const {
    userId,
    setUserId,
    systemToken,
    setSystemToken,
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
    transparentProxyEnabled,
    setTransparentProxyEnabled,
    transparentProxyPort,
    setTransparentProxyPort,
    transparentProxyApiKey,
    setTransparentProxyApiKey,
    transparentProxyAllowPublic,
    setTransparentProxyAllowPublic,
    globalConfig,
    savingSettings,
    loadGlobalConfig,
    saveSettings,
    generateProxyKey,
  } = useSettingsForm();

  const {
    transparentProxyStatus,
    startingProxy,
    stoppingProxy,
    loadTransparentProxyStatus,
    handleStartProxy,
    handleStopProxy,
  } = useTransparentProxy();

  // 初始加载
  useEffect(() => {
    loadGlobalConfig().catch((error) => {
      toast({
        title: '加载失败',
        description: String(error),
        variant: 'destructive',
      });
    });
    loadTransparentProxyStatus().catch((error) => {
      console.error('Failed to load transparent proxy status:', error);
    });
  }, [loadGlobalConfig, loadTransparentProxyStatus, toast]);

  // 保存设置
  const handleSaveSettings = async () => {
    try {
      await saveSettings();
      toast({
        title: '保存成功',
        description: '全局设置已保存',
      });
    } catch (error) {
      console.error('Failed to save settings:', error);
      toast({
        title: '保存失败',
        description: String(error),
        variant: 'destructive',
      });
    }
  };

  // 启动透明代理
  const handleStartTransparentProxy = async () => {
    try {
      const result = await handleStartProxy();
      toast({
        title: '启动成功',
        description: result,
      });
    } catch (error) {
      console.error('Failed to start transparent proxy:', error);
      toast({
        title: '启动失败',
        description: String(error),
        variant: 'destructive',
      });
    }
  };

  // 停止透明代理
  const handleStopTransparentProxy = async () => {
    try {
      const result = await handleStopProxy();
      toast({
        title: '停止成功',
        description: result,
      });
    } catch (error) {
      console.error('Failed to stop transparent proxy:', error);
      toast({
        title: '停止失败',
        description: String(error),
        variant: 'destructive',
      });
    }
  };

  return (
    <PageContainer>
      <div className="mb-6">
        <h2 className="text-2xl font-semibold mb-1">全局设置</h2>
        <p className="text-sm text-muted-foreground">配置 DuckCoding 的全局参数和功能</p>
      </div>

      <Tabs defaultValue="basic" className="space-y-6">
        <TabsList>
          <TabsTrigger value="basic">基本设置</TabsTrigger>
          <TabsTrigger value="proxy">代理设置</TabsTrigger>
          <TabsTrigger value="experimental">实验性功能</TabsTrigger>
        </TabsList>

        {/* 基本设置 */}
        <TabsContent value="basic" className="space-y-6">
          <div className="space-y-4 rounded-lg border p-6">
            <div className="flex items-center gap-2">
              <SettingsIcon className="h-5 w-5" />
              <h3 className="text-lg font-semibold">DuckCoding 账户</h3>
            </div>
            <Separator />

            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="user-id">用户 ID *</Label>
                <Input
                  id="user-id"
                  placeholder="请输入您的用户 ID"
                  value={userId}
                  onChange={(e) => setUserId(e.target.value)}
                  className="shadow-sm"
                />
                <p className="text-xs text-muted-foreground">
                  用于识别您的账户和一键生成 API Key
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="system-token">系统访问令牌 *</Label>
                <Input
                  id="system-token"
                  type="password"
                  placeholder="请输入系统访问令牌"
                  value={systemToken}
                  onChange={(e) => setSystemToken(e.target.value)}
                  className="shadow-sm"
                />
                <p className="text-xs text-muted-foreground">
                  用于验证您的身份和调用系统 API
                </p>
              </div>

              <div className="rounded-lg bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 p-4">
                <div className="flex items-start gap-2">
                  <Info className="h-4 w-4 text-blue-600 dark:text-blue-400 flex-shrink-0 mt-0.5" />
                  <div className="space-y-2 flex-1">
                    <p className="text-sm font-semibold text-blue-800 dark:text-blue-200">
                      如何获取用户 ID 和系统访问令牌？
                    </p>
                    <p className="text-xs text-blue-700 dark:text-blue-300">
                      请访问 DuckCoding 控制台获取您的凭证信息
                    </p>
                    <button
                      onClick={() => openExternalLink('https://duckcoding.com/console')}
                      className="text-xs text-blue-600 dark:text-blue-400 hover:underline font-medium"
                    >
                      前往控制台 →
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </TabsContent>

        {/* 代理设置 */}
        <TabsContent value="proxy" className="space-y-6">
          <div className="space-y-4 rounded-lg border p-6">
            <div className="flex items-center gap-2">
              <Info className="h-5 w-5" />
              <h3 className="text-lg font-semibold">网络代理配置</h3>
            </div>
            <Separator />

            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>启用代理</Label>
                  <p className="text-xs text-muted-foreground">
                    通过代理服务器转发所有网络请求
                  </p>
                </div>
                <input
                  type="checkbox"
                  checked={proxyEnabled}
                  onChange={(e) => setProxyEnabled(e.target.checked)}
                  className="h-4 w-4 rounded border-slate-300"
                />
              </div>

              {proxyEnabled && (
                <>
                  <div className="space-y-2">
                    <Label htmlFor="proxy-type">代理类型</Label>
                    <Select value={proxyType} onValueChange={(v: any) => setProxyType(v)}>
                      <SelectTrigger id="proxy-type">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="http">HTTP</SelectItem>
                        <SelectItem value="https">HTTPS</SelectItem>
                        <SelectItem value="socks5">SOCKS5</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="proxy-host">代理地址 *</Label>
                      <Input
                        id="proxy-host"
                        placeholder="127.0.0.1"
                        value={proxyHost}
                        onChange={(e) => setProxyHost(e.target.value)}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="proxy-port">端口 *</Label>
                      <Input
                        id="proxy-port"
                        placeholder="7890"
                        value={proxyPort}
                        onChange={(e) => setProxyPort(e.target.value)}
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="proxy-username">用户名（可选）</Label>
                      <Input
                        id="proxy-username"
                        placeholder="username"
                        value={proxyUsername}
                        onChange={(e) => setProxyUsername(e.target.value)}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="proxy-password">密码（可选）</Label>
                      <Input
                        id="proxy-password"
                        type="password"
                        placeholder="password"
                        value={proxyPassword}
                        onChange={(e) => setProxyPassword(e.target.value)}
                      />
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
        </TabsContent>

        {/* 实验性功能 */}
        <TabsContent value="experimental" className="space-y-6">
          <div className="space-y-4 rounded-lg border p-6">
            <div className="flex items-center gap-2">
              <Sparkles className="h-5 w-5" />
              <h3 className="text-lg font-semibold">ClaudeCode 透明代理</h3>
            </div>
            <Separator />

            {/* 实验性功能警告 */}
            <div className="rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 p-4">
              <div className="flex items-start gap-2">
                <AlertCircle className="h-4 w-4 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <p className="text-sm font-semibold text-amber-800 dark:text-amber-200">
                    实验性功能
                  </p>
                  <p className="text-xs text-amber-700 dark:text-amber-300">
                    此功能处于实验阶段，可能存在不稳定性。使用前请确保已保存重要数据。
                  </p>
                </div>
              </div>
            </div>

            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>启用透明代理</Label>
                  <p className="text-xs text-muted-foreground">
                    允许 ClaudeCode 动态切换 API 配置，无需重启终端
                  </p>
                </div>
                <input
                  type="checkbox"
                  checked={transparentProxyEnabled}
                  onChange={(e) => setTransparentProxyEnabled(e.target.checked)}
                  className="h-4 w-4 rounded border-slate-300"
                />
              </div>

              {transparentProxyEnabled && (
                <>
                  <div className="space-y-2">
                    <Label htmlFor="transparent-proxy-port">监听端口</Label>
                    <Input
                      id="transparent-proxy-port"
                      type="number"
                      value={transparentProxyPort}
                      onChange={(e) => setTransparentProxyPort(parseInt(e.target.value) || 8787)}
                    />
                    <p className="text-xs text-muted-foreground">
                      透明代理服务器监听的本地端口，默认 8787
                    </p>
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label htmlFor="transparent-proxy-api-key">API Key *</Label>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={generateProxyKey}
                      >
                        <Sparkles className="h-3 w-3 mr-1" />
                        生成
                      </Button>
                    </div>
                    <Input
                      id="transparent-proxy-api-key"
                      type="password"
                      placeholder="点击「生成」按钮自动生成"
                      value={transparentProxyApiKey}
                      onChange={(e) => setTransparentProxyApiKey(e.target.value)}
                    />
                    <p className="text-xs text-muted-foreground">
                      用于验证透明代理请求的密钥
                    </p>
                  </div>

                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <Label>允许公网访问</Label>
                      <p className="text-xs text-muted-foreground">
                        允许从非本机地址访问透明代理（不推荐）
                      </p>
                    </div>
                    <input
                      type="checkbox"
                      checked={transparentProxyAllowPublic}
                      onChange={(e) => setTransparentProxyAllowPublic(e.target.checked)}
                      className="h-4 w-4 rounded border-slate-300"
                    />
                  </div>

                  {/* 透明代理状态 */}
                  {transparentProxyStatus && (
                    <div className="mt-4 p-4 rounded-lg border bg-slate-50 dark:bg-slate-900">
                      <div className="flex items-center justify-between">
                        <div className="space-y-1">
                          <p className="text-sm font-semibold">代理状态</p>
                          <p className="text-xs text-muted-foreground">
                            {transparentProxyStatus.running
                              ? `运行中 (端口 ${transparentProxyStatus.port})`
                              : '未运行'}
                          </p>
                        </div>
                        <div className="flex gap-2">
                          {transparentProxyStatus.running ? (
                            <Button
                              variant="destructive"
                              size="sm"
                              onClick={handleStopTransparentProxy}
                              disabled={stoppingProxy}
                            >
                              {stoppingProxy ? (
                                <>
                                  <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                                  停止中...
                                </>
                              ) : (
                                <>
                                  <Power className="h-3 w-3 mr-1" />
                                  停止
                                </>
                              )}
                            </Button>
                          ) : (
                            <Button
                              variant="default"
                              size="sm"
                              onClick={handleStartTransparentProxy}
                              disabled={startingProxy}
                            >
                              {startingProxy ? (
                                <>
                                  <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                                  启动中...
                                </>
                              ) : (
                                <>
                                  <Power className="h-3 w-3 mr-1" />
                                  启动
                                </>
                              )}
                            </Button>
                          )}
                        </div>
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </TabsContent>
      </Tabs>

      {/* 保存按钮 */}
      <div className="flex justify-end mt-6">
        <Button
          onClick={handleSaveSettings}
          disabled={savingSettings}
          className="shadow-md hover:shadow-lg transition-all"
        >
          {savingSettings ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              保存中...
            </>
          ) : (
            <>
              <Save className="mr-2 h-4 w-4" />
              保存设置
            </>
          )}
        </Button>
      </div>
    </PageContainer>
  );
}
