import { useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Loader2, Package, AlertCircle } from 'lucide-react';
import { DndContext, closestCenter } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { PageContainer } from '@/components/layout/PageContainer';
import { DeleteConfirmDialog } from '@/components/dialogs/DeleteConfirmDialog';
import { logoMap } from '@/utils/constants';
import { useToast } from '@/hooks/use-toast';
import { SortableProfileItem } from './components/SortableProfileItem';
import { ProxyStatusBanner } from './components/ProxyStatusBanner';
import { ActiveConfigCard } from './components/ActiveConfigCard';
import { useProfileSorting } from './hooks/useProfileSorting';
import {
  listProfiles,
  switchProfile,
  deleteProfile,
  getActiveConfig,
  getGlobalConfig,
  startTransparentProxy,
  stopTransparentProxy,
  getTransparentProxyStatus,
  type ToolStatus,
  type ActiveConfig,
  type GlobalConfig,
  type TransparentProxyStatus,
} from '@/lib/tauri-commands';

interface ProfileSwitchPageProps {
  tools: ToolStatus[];
  loading: boolean;
}

export function ProfileSwitchPage({ tools: toolsProp, loading: loadingProp }: ProfileSwitchPageProps) {
  const { toast } = useToast();
  const [tools, setTools] = useState<ToolStatus[]>(toolsProp);
  const [loading, setLoading] = useState(loadingProp);
  const [selectedSwitchTab, setSelectedSwitchTab] = useState<string>('');
  const [switching, setSwitching] = useState(false);
  const [deletingProfiles, setDeletingProfiles] = useState<Record<string, boolean>>({});
  const [selectedProfile, setSelectedProfile] = useState<Record<string, string>>({});
  const [profiles, setProfiles] = useState<Record<string, string[]>>({});
  const [activeConfigs, setActiveConfigs] = useState<Record<string, ActiveConfig>>({});
  const [globalConfig, setGlobalConfig] = useState<GlobalConfig | null>(null);
  const [transparentProxyStatus, setTransparentProxyStatus] = useState<TransparentProxyStatus | null>(
    null,
  );
  const [startingProxy, setStartingProxy] = useState(false);
  const [stoppingProxy, setStoppingProxy] = useState(false);
  const [deleteConfirmDialog, setDeleteConfirmDialog] = useState<{
    open: boolean;
    toolId: string;
    profile: string;
  }>({ open: false, toolId: '', profile: '' });

  // 使用拖拽排序Hook
  const { sensors, applySavedOrder, createDragEndHandler } = useProfileSorting();

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
  const loadGlobalConfig = async () => {
    try {
      const config = await getGlobalConfig();
      setGlobalConfig(config);
    } catch (error) {
      console.error('Failed to load global config:', error);
    }
  };

  // 加载透明代理状态
  const loadTransparentProxyStatus = async () => {
    try {
      const status = await getTransparentProxyStatus();
      setTransparentProxyStatus(status);
    } catch (error) {
      console.error('Failed to load transparent proxy status:', error);
    }
  };

  // 加载所有配置文件和当前激活配置
  const loadAllProfiles = useCallback(async () => {
    const installedTools = tools.filter((t) => t.installed);
    const profileData: Record<string, string[]> = {};
    const configData: Record<string, ActiveConfig> = {};

    for (const tool of installedTools) {
      try {
        const toolProfiles = await listProfiles(tool.id);
        profileData[tool.id] = applySavedOrder(tool.id, toolProfiles);
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

    // 设置默认选中的Tab（第一个已安装的工具）
    if (installedTools.length > 0 && !selectedSwitchTab) {
      setSelectedSwitchTab(installedTools[0].id);
    }
  }, [tools, selectedSwitchTab, applySavedOrder]);

  // 初始加载
  useEffect(() => {
    loadGlobalConfig();
    loadTransparentProxyStatus();
  }, []);

  // 当工具加载完成后，加载配置
  useEffect(() => {
    const installedTools = tools.filter((t) => t.installed);
    if (installedTools.length > 0) {
      loadAllProfiles();
    }
  }, [tools, loadAllProfiles]);

  // 切换配置
  const handleSwitchProfile = async (toolId: string, profile: string) => {
    try {
      setSwitching(true);

      // 检查是否启用了透明代理
      const isProxyEnabled =
        globalConfig?.transparent_proxy_enabled && transparentProxyStatus?.running;

      // 切换配置（后端会自动处理透明代理更新）
      await switchProfile(toolId, profile);
      setSelectedProfile({ ...selectedProfile, [toolId]: profile });

      // 重新加载当前生效的配置
      try {
        const activeConfig = await getActiveConfig(toolId);
        setActiveConfigs({ ...activeConfigs, [toolId]: activeConfig });
      } catch (error) {
        console.error('Failed to reload active config', error);
      }

      // 如果是 ClaudeCode，总是刷新配置确保UI显示正确
      if (toolId === 'claude-code') {
        if (isProxyEnabled) {
          await loadGlobalConfig();
          toast({
            title: '切换成功',
            description: '✅ 配置已切换\n✅ 透明代理已自动更新\n无需重启终端',
          });
        } else {
          // 未开启代理时也要刷新全局配置，确保透明代理状态正确
          await loadGlobalConfig();
          toast({
            title: '切换成功',
            description: '配置切换成功！\n请重启相关 CLI 工具以使新配置生效。',
          });
        }
      } else {
        toast({
          title: '切换成功',
          description: '配置切换成功！\n请重启相关 CLI 工具以使新配置生效。',
        });
      }
    } catch (error) {
      console.error('Failed to switch profile:', error);
      toast({
        title: '切换失败',
        description: String(error),
        variant: 'destructive',
      });
    } finally {
      setSwitching(false);
    }
  };

  // 删除配置
  const handleDeleteProfile = (toolId: string, profile: string) => {
    setDeleteConfirmDialog({
      open: true,
      toolId,
      profile,
    });
  };

  // 执行删除配置
  const performDeleteProfile = async (toolId: string, profile: string) => {
    const profileKey = `${toolId}-${profile}`;

    try {
      setDeletingProfiles((prev) => ({ ...prev, [profileKey]: true }));

      // 后端删除
      await deleteProfile(toolId, profile);

      // 立即本地更新（乐观更新）
      const currentProfiles = profiles[toolId] || [];
      const updatedProfiles = currentProfiles.filter((p) => p !== profile);

      setProfiles((prev) => ({
        ...prev,
        [toolId]: updatedProfiles,
      }));

      // 清理相关状态
      setSelectedProfile((prev) => {
        const updated = { ...prev };
        if (updated[toolId] === profile) {
          delete updated[toolId];
        }
        return updated;
      });

      // 尝试重新加载所有配置，确保与后端同步
      try {
        await loadAllProfiles();

        // 如果删除的是当前正在使用的配置，重新获取当前配置
        if (activeConfigs[toolId]?.profile_name === profile) {
          try {
            const newActiveConfig = await getActiveConfig(toolId);
            setActiveConfigs((prev) => ({ ...prev, [toolId]: newActiveConfig }));
          } catch (error) {
            console.error('Failed to reload active config', error);
          }
        }
      } catch (reloadError) {
        console.error('Failed to reload profiles after delete:', reloadError);
      }

      toast({
        title: '删除成功',
        description: '配置删除成功！',
      });
    } catch (error) {
      console.error('Failed to delete profile:', error);
      toast({
        title: '删除失败',
        description: String(error),
        variant: 'destructive',
      });
    } finally {
      setDeletingProfiles((prev) => {
        const updated = { ...prev };
        delete updated[profileKey];
        return updated;
      });
    }
  };

  // 启动透明代理
  const handleStartTransparentProxy = async () => {
    try {
      setStartingProxy(true);
      const result = await startTransparentProxy();
      toast({
        title: '启动成功',
        description: result,
      });
      // 重新加载状态
      const status = await getTransparentProxyStatus();
      setTransparentProxyStatus(status);
    } catch (error) {
      console.error('Failed to start transparent proxy:', error);
      toast({
        title: '启动失败',
        description: String(error),
        variant: 'destructive',
      });
    } finally {
      setStartingProxy(false);
    }
  };

  // 停止透明代理
  const handleStopTransparentProxy = async () => {
    try {
      setStoppingProxy(true);
      const result = await stopTransparentProxy();
      toast({
        title: '停止成功',
        description: result,
      });
      // 重新加载状态
      const status = await getTransparentProxyStatus();
      setTransparentProxyStatus(status);

      // 刷新当前生效配置（确保UI显示正确更新）
      try {
        const activeConfig = await getActiveConfig('claude-code');
        setActiveConfigs((prev) => ({ ...prev, 'claude-code': activeConfig }));
      } catch (error) {
        console.error('Failed to reload active config after stopping proxy:', error);
      }
    } catch (error) {
      console.error('Failed to stop transparent proxy:', error);
      toast({
        title: '停止失败',
        description: String(error),
        variant: 'destructive',
      });
    } finally {
      setStoppingProxy(false);
    }
  };

  // 切换到安装页面
  const switchToInstall = () => {
    window.dispatchEvent(new CustomEvent('navigate-to-install'));
  };

  // 切换到设置页面
  const switchToSettings = () => {
    window.dispatchEvent(new CustomEvent('navigate-to-settings'));
  };

  const installedTools = tools.filter((t) => t.installed);
  const effectiveTransparentEnabled = Boolean(globalConfig?.transparent_proxy_enabled);
  const shouldShowRestartForAllTools = !effectiveTransparentEnabled;

  return (
    <PageContainer>
      <div className="mb-6">
        <h2 className="text-2xl font-semibold mb-1">切换配置</h2>
        <p className="text-sm text-muted-foreground">在不同的配置文件之间快速切换</p>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <span className="ml-3 text-muted-foreground">加载中...</span>
        </div>
      ) : (
        <>
          {/* 透明代理状态显示 - 仅在ClaudeCode选项卡显示 */}
          {selectedSwitchTab === 'claude-code' && (
            <ProxyStatusBanner
              isEnabled={effectiveTransparentEnabled}
              isRunning={transparentProxyStatus?.running || false}
              startingProxy={startingProxy}
              stoppingProxy={stoppingProxy}
              onStartProxy={handleStartTransparentProxy}
              onStopProxy={handleStopTransparentProxy}
              onNavigateToSettings={switchToSettings}
            />
          )}

          {/* 重启提示（在所有工具显示） */}
          {shouldShowRestartForAllTools || selectedSwitchTab != 'claude-code' && (
            <div className="mb-6 p-4 bg-gradient-to-r from-amber-50 to-orange-50 dark:from-amber-950 dark:to-orange-950 rounded-lg border border-amber-200 dark:border-amber-800">
              <div className="flex items-start gap-3">
                <AlertCircle className="h-5 w-5 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <h4 className="font-semibold text-amber-900 dark:text-amber-100">重要提示</h4>
                  <p className="text-sm text-amber-800 dark:text-amber-200">
                    切换配置后，如果工具正在运行，<strong>需要重启对应的工具</strong>
                    才能使新配置生效。
                  </p>
                </div>
              </div>
            </div>
          )}

          {installedTools.length > 0 ? (
            <Tabs value={selectedSwitchTab} onValueChange={setSelectedSwitchTab}>
              <TabsList className="grid w-full grid-cols-3 mb-6">
                {installedTools.map((tool) => (
                  <TabsTrigger key={tool.id} value={tool.id} className="gap-2">
                    <img src={logoMap[tool.id]} alt={tool.name} className="w-4 h-4" />
                    {tool.name}
                  </TabsTrigger>
                ))}
              </TabsList>

              {installedTools.map((tool) => {
                const toolProfiles = profiles[tool.id] || [];
                const activeConfig = activeConfigs[tool.id];
                return (
                  <TabsContent key={tool.id} value={tool.id}>
                    <Card className="shadow-sm border">
                      <CardContent className="pt-6">
                        {/* 显示当前生效的配置 */}
                        {activeConfig && (
                          <ActiveConfigCard
                            toolId={tool.id}
                            activeConfig={activeConfig}
                            globalConfig={globalConfig}
                            transparentProxyEnabled={effectiveTransparentEnabled}
                          />
                        )}

                        {toolProfiles.length > 0 ? (
                          <div className="space-y-3">
                            <div className="flex items-center gap-2 mb-2">
                              <Label>可用的配置文件（拖拽可调整顺序）</Label>
                            </div>
                            <DndContext
                              sensors={sensors}
                              collisionDetection={closestCenter}
                              onDragEnd={createDragEndHandler(tool.id, setProfiles)}
                            >
                              <SortableContext
                                items={toolProfiles}
                                strategy={verticalListSortingStrategy}
                              >
                                <div className="space-y-2">
                                  {toolProfiles.map((profile) => (
                                    <SortableProfileItem
                                      key={profile}
                                      profile={profile}
                                      toolId={tool.id}
                                      switching={switching}
                                      deleting={
                                        deletingProfiles[`${tool.id}-${profile}`] || false
                                      }
                                      onSwitch={handleSwitchProfile}
                                      onDelete={handleDeleteProfile}
                                    />
                                  ))}
                                </div>
                              </SortableContext>
                            </DndContext>
                          </div>
                        ) : (
                          <div className="text-center py-8 bg-slate-50 dark:bg-slate-800/50 rounded-lg">
                            <p className="text-muted-foreground mb-3">暂无保存的配置文件</p>
                            <p className="text-sm text-muted-foreground">
                              在"配置 API"页面保存配置时填写名称即可创建多个配置
                            </p>
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  </TabsContent>
                );
              })}
            </Tabs>
          ) : (
            <Card className="shadow-sm border">
              <CardContent className="pt-6">
                <div className="text-center py-12">
                  <Package className="h-16 w-16 mx-auto mb-4 text-muted-foreground opacity-30" />
                  <h3 className="text-lg font-semibold mb-2">暂无已安装的工具</h3>
                  <p className="text-sm text-muted-foreground mb-4">请先安装工具</p>
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
        </>
      )}

      {/* 删除确认对话框 */}
      <DeleteConfirmDialog
        open={deleteConfirmDialog.open}
        toolId={deleteConfirmDialog.toolId}
        profile={deleteConfirmDialog.profile}
        onClose={() => setDeleteConfirmDialog({ open: false, toolId: '', profile: '' })}
        onConfirm={() => {
          performDeleteProfile(deleteConfirmDialog.toolId, deleteConfirmDialog.profile);
          setDeleteConfirmDialog({ open: false, toolId: '', profile: '' });
        }}
      />
    </PageContainer>
  );
}
