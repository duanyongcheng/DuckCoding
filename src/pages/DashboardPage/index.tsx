import { useState, useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  CheckCircle2,
  RefreshCw,
  Loader2,
  Package,
  Key,
  AlertCircle,
} from 'lucide-react';
import { PageContainer } from '@/components/layout/PageContainer';
import { logoMap, descriptionMap, getToolDisplayName } from '@/utils/constants';
import { formatVersionLabel } from '@/utils/formatting';
import { useToast } from '@/hooks/use-toast';
import {
  updateTool as updateToolCommand,
  checkAllUpdates,
  type ToolStatus,
} from '@/lib/tauri-commands';

interface DashboardPageProps {
  tools: ToolStatus[];
  loading: boolean;
}

export function DashboardPage({ tools: toolsProp, loading: loadingProp }: DashboardPageProps) {
  const { toast } = useToast();
  const [tools, setTools] = useState<ToolStatus[]>(toolsProp);
  const [loading, setLoading] = useState(loadingProp);
  const [updating, setUpdating] = useState<string | null>(null);
  const [checkingUpdates, setCheckingUpdates] = useState(false);
  const [updateCheckMessage, setUpdateCheckMessage] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);

  const updateMessageTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // 同步外部 tools 数据
  useEffect(() => {
    setTools(toolsProp);
    setLoading(loadingProp);
  }, [toolsProp, loadingProp]);

  // 通知父组件刷新工具列表
  const refreshTools = () => {
    window.dispatchEvent(new CustomEvent('refresh-tools'));
  };

  // 检查更新
  const checkForUpdates = async () => {
    try {
      setCheckingUpdates(true);
      setUpdateCheckMessage(null);

      if (updateMessageTimeoutRef.current) {
        clearTimeout(updateMessageTimeoutRef.current);
        updateMessageTimeoutRef.current = null;
      }

      const results = await checkAllUpdates();

      const updatedTools = tools.map((tool) => {
        const updateInfo = results.find((r) => r.tool_id === tool.id);
        if (updateInfo && updateInfo.success && tool.installed) {
          return {
            ...tool,
            hasUpdate: updateInfo.has_update,
            latestVersion: updateInfo.latest_version || undefined,
            mirrorVersion: updateInfo.mirror_version || undefined,
            mirrorIsStale: updateInfo.mirror_is_stale || false,
          };
        }
        return tool;
      });
      setTools(updatedTools);

      const updatesAvailable = updatedTools.filter((t) => t.hasUpdate).length;
      if (updatesAvailable > 0) {
        setUpdateCheckMessage({
          type: 'success',
          text: `发现 ${updatesAvailable} 个工具有可用更新！`,
        });
      } else {
        setUpdateCheckMessage({
          type: 'success',
          text: '所有工具均已是最新版本',
        });
      }

      updateMessageTimeoutRef.current = setTimeout(() => {
        setUpdateCheckMessage(null);
        updateMessageTimeoutRef.current = null;
      }, 5000);
    } catch (error) {
      console.error('Failed to check for updates:', error);
      setUpdateCheckMessage({
        type: 'error',
        text: '检查更新失败，请重试',
      });
      updateMessageTimeoutRef.current = setTimeout(() => {
        setUpdateCheckMessage(null);
      }, 5000);
    } finally {
      setCheckingUpdates(false);
    }
  };

  // 更新工具
  const handleUpdate = async (toolId: string) => {
    if (updating) {
      toast({
        title: '请稍候',
        description: '已有更新任务正在进行，请等待完成后再试',
        variant: 'destructive',
      });
      return;
    }

    try {
      setUpdating(toolId);
      await updateToolCommand(toolId);
      refreshTools();
      toast({
        title: '更新成功',
        description: `${getToolDisplayName(toolId)} 已更新到最新版本`,
      });
    } catch (error) {
      console.error('Failed to update ' + toolId, error);
      toast({
        title: '更新失败',
        description: String(error),
        variant: 'destructive',
      });
    } finally {
      setUpdating(null);
    }
  };

  // 切换到配置页面
  const switchToConfig = (toolId?: string) => {
    window.dispatchEvent(new CustomEvent('navigate-to-config', { detail: { toolId } }));
  };

  // 切换到安装页面
  const switchToInstall = () => {
    window.dispatchEvent(new CustomEvent('navigate-to-install'));
  };

  const installedTools = tools.filter((t) => t.installed);

  return (
    <PageContainer>
      <div className="mb-6">
        <h2 className="text-2xl font-semibold mb-1">仪表板</h2>
        <p className="text-sm text-muted-foreground">管理已安装的 AI 开发工具和配置</p>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <span className="ml-3 text-muted-foreground">加载中...</span>
        </div>
      ) : (
        <>
          {/* 更新检查提示 */}
          {updateCheckMessage && (
            <Alert
              className={`mb-6 ${updateCheckMessage.type === 'error' ? 'border-red-500' : ''}`}
            >
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{updateCheckMessage.text}</AlertDescription>
            </Alert>
          )}

          {installedTools.length === 0 ? (
            <Card className="shadow-sm border">
              <CardContent className="pt-6">
                <div className="text-center py-12">
                  <Package className="h-16 w-16 mx-auto mb-4 text-muted-foreground opacity-30" />
                  <h3 className="text-lg font-semibold mb-2">暂无已安装的工具</h3>
                  <p className="text-sm text-muted-foreground mb-4">
                    请先前往安装页面安装 AI 开发工具
                  </p>
                  <Button
                    onClick={switchToInstall}
                    className="shadow-md hover:shadow-lg transition-all"
                  >
                    <Package className="mr-2 h-4 w-4" />
                    去安装工具
                  </Button>
                </div>
              </CardContent>
            </Card>
          ) : (
            <>
              {/* 检查更新按钮 */}
              <div className="flex justify-end mb-4">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={checkForUpdates}
                  disabled={checkingUpdates}
                  className="shadow-sm hover:shadow-md transition-all"
                >
                  {checkingUpdates ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      检查中...
                    </>
                  ) : (
                    <>
                      <RefreshCw className="mr-2 h-4 w-4" />
                      检查更新
                    </>
                  )}
                </Button>
              </div>

              {/* 工具卡片列表 */}
              <div className="grid gap-4">
                {installedTools.map((tool) => (
                  <Card key={tool.id} className="shadow-sm border">
                    <CardContent className="p-5">
                      <div className="flex items-start justify-between gap-6">
                        <div className="flex items-center gap-4 flex-1">
                          <div className="bg-secondary p-3 rounded-lg flex-shrink-0">
                            <img src={logoMap[tool.id]} alt={tool.name} className="w-12 h-12" />
                          </div>
                          <div className="flex-1 space-y-1.5">
                            <div className="flex items-center gap-3">
                              <h4 className="font-semibold text-lg">{tool.name}</h4>
                              <Badge variant="default" className="gap-1">
                                <CheckCircle2 className="h-3 w-3" />
                                已安装
                              </Badge>
                              {tool.hasUpdate && (
                                <Badge
                                  variant="secondary"
                                  className="gap-1 bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200"
                                >
                                  <RefreshCw className="h-3 w-3" />
                                  有更新
                                </Badge>
                              )}
                            </div>
                            <p className="text-sm text-muted-foreground leading-relaxed">
                              {descriptionMap[tool.id]}
                            </p>
                            <div className="flex items-center gap-3 mt-3">
                              <div className="flex items-center gap-2">
                                <span className="text-xs font-semibold text-slate-600 dark:text-slate-400">
                                  当前版本:
                                </span>
                                <span className="font-mono text-xs font-semibold text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950 px-2.5 py-1 rounded-lg shadow-sm">
                                  {formatVersionLabel(tool.version)}
                                </span>
                              </div>
                              {tool.hasUpdate && tool.latestVersion && (
                                <div className="flex items-center gap-2">
                                  <span className="text-xs font-semibold text-slate-600 dark:text-slate-400">
                                    最新版本:
                                  </span>
                                  <span className="font-mono text-xs font-semibold text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-950 px-2.5 py-1 rounded-lg shadow-sm">
                                    {formatVersionLabel(tool.latestVersion)}
                                  </span>
                                </div>
                              )}
                            </div>
                          </div>
                        </div>

                        <div className="flex flex-col gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => switchToConfig(tool.id)}
                            className="w-32"
                          >
                            <Key className="mr-2 h-4 w-4" />
                            配置
                          </Button>

                          {tool.hasUpdate ? (
                            <Button
                              size="sm"
                              onClick={() => handleUpdate(tool.id)}
                              disabled={updating === tool.id}
                              className="w-32 bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600"
                            >
                              {updating === tool.id ? (
                                <>
                                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                  更新中...
                                </>
                              ) : (
                                <>
                                  <RefreshCw className="mr-2 h-4 w-4" />
                                  更新
                                </>
                              )}
                            </Button>
                          ) : (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={checkForUpdates}
                              disabled={checkingUpdates}
                              className="w-32"
                            >
                              <RefreshCw className="mr-2 h-4 w-4" />
                              检查更新
                            </Button>
                          )}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </>
          )}
        </>
      )}
    </PageContainer>
  );
}
