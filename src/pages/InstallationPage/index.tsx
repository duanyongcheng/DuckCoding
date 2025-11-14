import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { CheckCircle2, Loader2, Package } from 'lucide-react';
import { PageContainer } from '@/components/layout/PageContainer';
import { MirrorStaleDialog } from '@/components/dialogs/MirrorStaleDialog';
import type { NodeEnvironment } from '@/components/dialogs/MirrorStaleDialog';
import { logoMap, descriptionMap } from '@/utils/constants';
import { formatVersionLabel } from '@/utils/formatting';
import { useToast } from '@/hooks/use-toast';
import {
  checkNodeEnvironment,
  installTool as installToolCommand,
  type ToolStatus,
} from '@/lib/tauri-commands';

interface InstallationPageProps {
  tools: ToolStatus[];
  loading: boolean;
}

export function InstallationPage({ tools: toolsProp, loading: loadingProp }: InstallationPageProps) {
  const { toast } = useToast();
  const [tools, setTools] = useState<ToolStatus[]>(toolsProp);
  const [loading, setLoading] = useState(loadingProp);
  const [installing, setInstalling] = useState<string | null>(null);
  const [nodeEnv, setNodeEnv] = useState<NodeEnvironment | null>(null);
  const [installMethods, setInstallMethods] = useState<Record<string, string>>({
    'claude-code': 'official',
    codex: navigator.userAgent.includes('Mac') ? 'brew' : 'npm',
    'gemini-cli': 'npm',
  });

  const [mirrorStaleDialog, setMirrorStaleDialog] = useState({
    open: false,
    toolId: '',
    mirrorVersion: '',
    officialVersion: '',
    source: 'install' as 'install' | 'update',
  });

  // 同步外部 tools 数据
  useEffect(() => {
    setTools(toolsProp);
    setLoading(loadingProp);
  }, [toolsProp, loadingProp]);

  // 通知父组件刷新工具列表
  const refreshTools = () => {
    window.dispatchEvent(new CustomEvent('refresh-tools'));
  };

  // 加载 Node 环境信息
  const loadNodeEnv = async () => {
    try {
      const env = await checkNodeEnvironment();
      setNodeEnv(env);
    } catch (error) {
      console.error('Failed to load node environment:', error);
    }
  };

  // 初始加载
  useEffect(() => {
    loadNodeEnv();
  }, []);

  // 获取可用的安装方法
  const getAvailableInstallMethods = (
    toolId: string,
  ): Array<{ value: string; label: string; disabled?: boolean }> => {
    const isMac = navigator.userAgent.includes('Mac');

    if (toolId === 'claude-code') {
      return [
        { value: 'official', label: '官方脚本 (推荐)' },
        { value: 'npm', label: 'npm 安装', disabled: !nodeEnv?.npm_available },
      ];
    } else if (toolId === 'codex') {
      const methods = [{ value: 'npm', label: 'npm 安装', disabled: !nodeEnv?.npm_available }];
      if (isMac) {
        methods.unshift({ value: 'brew', label: 'Homebrew (推荐)', disabled: false });
      }
      return methods;
    } else if (toolId === 'gemini-cli') {
      return [{ value: 'npm', label: 'npm 安装 (推荐)', disabled: !nodeEnv?.npm_available }];
    }
    return [];
  };

  // 安装工具
  const handleInstall = async (toolId: string) => {
    try {
      setInstalling(toolId);
      const method = installMethods[toolId] || 'official';
      console.log(`Installing ${toolId} using method: ${method}`);
      await installToolCommand(toolId, method);
      refreshTools();
      toast({
        title: '安装成功',
        description: `${toolId} 已成功安装`,
      });
    } catch (error) {
      console.error('Failed to install ' + toolId, error);
      const errorMsg = String(error);

      // 检查是否是镜像滞后错误
      if (errorMsg.includes('MIRROR_STALE')) {
        const parts = errorMsg.split('|');
        if (parts.length === 3) {
          const mirrorVer = parts[1];
          const officialVer = parts[2];

          // 显示镜像滞后对话框
          setMirrorStaleDialog({
            open: true,
            toolId: toolId,
            mirrorVersion: mirrorVer,
            officialVersion: officialVer,
            source: 'install',
          });
          return; // 不显示 toast，由对话框处理
        }
      }

      toast({
        title: '安装失败',
        description: String(error),
        variant: 'destructive',
      });
    } finally {
      setInstalling(null);
    }
  };

  // 处理镜像滞后对话框 - 继续使用镜像
  const handleContinueMirror = async (
    toolId: string,
    source: 'install' | 'update',
    mirrorVersion: string,
  ) => {
    setMirrorStaleDialog({
      open: false,
      toolId: '',
      mirrorVersion: '',
      officialVersion: '',
      source: 'install',
    });

    try {
      setInstalling(toolId);
      const method = installMethods[toolId] || 'official';
      await installToolCommand(toolId, method, true); // force=true
      refreshTools();
      toast({
        title: '安装成功',
        description: `已安装镜像版本 ${mirrorVersion}`,
      });
    } catch (error) {
      console.error('Failed to force install', error);
      toast({
        title: '安装失败',
        description: String(error),
        variant: 'destructive',
      });
    } finally {
      setInstalling(null);
    }
  };

  // 处理镜像滞后对话框 - 改用 npm
  const handleUseNpm = async (toolId: string, officialVersion: string) => {
    setMirrorStaleDialog({
      open: false,
      toolId: '',
      mirrorVersion: '',
      officialVersion: '',
      source: 'install',
    });

    // 改用 npm 安装
    setInstallMethods({ ...installMethods, [toolId]: 'npm' });

    // 重新触发安装
    try {
      setInstalling(toolId);
      await installToolCommand(toolId, 'npm');
      refreshTools();
      toast({
        title: '安装成功',
        description: `已获取最新版本 ${officialVersion}`,
      });
    } catch (error) {
      console.error('Failed to install with npm', error);
      toast({
        title: 'npm 安装失败',
        description: String(error),
        variant: 'destructive',
      });
    } finally {
      setInstalling(null);
    }
  };

  return (
    <PageContainer>
      <div className="mb-6">
        <h2 className="text-2xl font-semibold mb-1">安装工具</h2>
        <p className="text-sm text-muted-foreground">选择并安装您需要的 AI 开发工具</p>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <span className="ml-3 text-muted-foreground">加载中...</span>
        </div>
      ) : (
        <div className="grid gap-4">
          {tools.map((tool) => (
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
                        {tool.installed && (
                          <Badge variant="default" className="gap-1">
                            <CheckCircle2 className="h-3 w-3" />
                            已安装
                          </Badge>
                        )}
                      </div>
                      <p className="text-sm text-muted-foreground leading-relaxed">
                        {descriptionMap[tool.id]}
                      </p>
                      {tool.installed && tool.version && (
                        <div className="flex items-center gap-2 mt-3">
                          <span className="text-xs font-semibold text-slate-600 dark:text-slate-400">
                            当前版本:
                          </span>
                          <span className="font-mono text-xs font-semibold text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950 px-2.5 py-1 rounded-lg shadow-sm">
                            {formatVersionLabel(tool.version)}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="flex flex-col gap-3 items-end">
                    {!tool.installed && (
                      <div className="w-48">
                        <Label htmlFor={`method-${tool.id}`} className="text-xs mb-1.5 block">
                          安装方式
                        </Label>
                        <Select
                          value={installMethods[tool.id]}
                          onValueChange={(value) =>
                            setInstallMethods({ ...installMethods, [tool.id]: value })
                          }
                        >
                          <SelectTrigger id={`method-${tool.id}`} className="shadow-sm h-9 text-sm">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {getAvailableInstallMethods(tool.id).map((method) => (
                              <SelectItem
                                key={method.value}
                                value={method.value}
                                disabled={method.disabled}
                              >
                                {method.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    )}

                    <Button
                      disabled={tool.installed || installing === tool.id}
                      onClick={() => handleInstall(tool.id)}
                      className="shadow-md hover:shadow-lg transition-all bg-gradient-to-r from-blue-500 to-cyan-500 hover:from-blue-600 hover:to-cyan-600 disabled:from-slate-400 disabled:to-slate-400 h-11 px-6 font-medium w-48"
                      size="lg"
                    >
                      {installing === tool.id ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          安装中...
                        </>
                      ) : tool.installed ? (
                        <>
                          <CheckCircle2 className="mr-2 h-4 w-4" />
                          已安装
                        </>
                      ) : (
                        <>
                          <Package className="mr-2 h-4 w-4" />
                          安装工具
                        </>
                      )}
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* 镜像滞后对话框 */}
      <MirrorStaleDialog
        open={mirrorStaleDialog.open}
        toolId={mirrorStaleDialog.toolId}
        mirrorVersion={mirrorStaleDialog.mirrorVersion}
        officialVersion={mirrorStaleDialog.officialVersion}
        source={mirrorStaleDialog.source}
        nodeEnv={nodeEnv}
        onClose={() =>
          setMirrorStaleDialog({
            open: false,
            toolId: '',
            mirrorVersion: '',
            officialVersion: '',
            source: 'install',
          })
        }
        onContinueMirror={handleContinueMirror}
        onUseNpm={handleUseNpm}
      />
    </PageContainer>
  );
}
