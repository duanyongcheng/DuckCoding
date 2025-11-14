import { useState, useEffect, useCallback } from 'react';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import { AppSidebar } from '@/components/layout/AppSidebar';
import { CloseActionDialog } from '@/components/dialogs/CloseActionDialog';
import { StatisticsPage } from '@/pages/StatisticsPage';
import { InstallationPage } from '@/pages/InstallationPage';
import { DashboardPage } from '@/pages/DashboardPage';
import { ConfigurationPage } from '@/pages/ConfigurationPage';
import { ProfileSwitchPage } from '@/pages/ProfileSwitchPage';
import { SettingsPage } from '@/pages/SettingsPage';
import { useToast } from '@/hooks/use-toast';
import { Toaster } from '@/components/ui/toaster';
import { applyCloseAction, checkInstallations, type CloseAction, type ToolStatus } from '@/lib/tauri-commands';

const CLOSE_EVENT = 'duckcoding://request-close-action';
const CLOSE_PREFERENCE_KEY = 'duckcoding.closePreference';
const SINGLE_INSTANCE_EVENT = 'single-instance';

interface SingleInstancePayload {
  args: string[];
  cwd: string;
}

const isTauriEnvironment = () => {
  if (typeof window === 'undefined') {
    return false;
  }

  const globalWindow = window as unknown as Record<string, unknown>;
  return Boolean(
    globalWindow.__TAURI_INTERNALS__ ??
      globalWindow.__TAURI_METADATA__ ??
      globalWindow.__TAURI_IPC__,
  );
};

type TabType = 'dashboard' | 'install' | 'config' | 'switch' | 'statistics' | 'settings';

function App() {
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState<TabType>('dashboard');
  const [closeDialogOpen, setCloseDialogOpen] = useState(false);
  const [rememberCloseChoice, setRememberCloseChoice] = useState(false);
  const [closeActionLoading, setCloseActionLoading] = useState<CloseAction | null>(null);

  // 全局工具状态缓存
  const [tools, setTools] = useState<ToolStatus[]>([]);
  const [toolsLoading, setToolsLoading] = useState(true);

  // 加载工具状态（全局缓存）
  const loadTools = useCallback(async () => {
    try {
      setToolsLoading(true);
      const result = await checkInstallations();
      setTools(result);
    } catch (error) {
      console.error('Failed to load tools:', error);
    } finally {
      setToolsLoading(false);
    }
  }, []);

  // 初始化加载工具
  useEffect(() => {
    loadTools();
  }, [loadTools]);

  // 执行窗口关闭动作
  const executeCloseAction = useCallback(
    async (action: CloseAction, remember = false, autoTriggered = false) => {
      if (!isTauriEnvironment()) {
        setCloseDialogOpen(false);
        return;
      }

      setCloseActionLoading(action);
      try {
        await applyCloseAction(action);

        if (typeof window !== 'undefined') {
          try {
            if (remember) {
              window.localStorage.setItem(CLOSE_PREFERENCE_KEY, action);
            } else if (!autoTriggered) {
              window.localStorage.removeItem(CLOSE_PREFERENCE_KEY);
            }
          } catch (storageError) {
            console.warn('保存关闭偏好失败:', storageError);
          }
        }
      } catch (error) {
        console.error('执行窗口操作失败:', error);
        toast({
          variant: 'destructive',
          title: '窗口操作失败',
          description:
            error instanceof Error ? error.message : '请稍后重试，或从系统托盘退出/展开窗口',
        });

        if (!autoTriggered) {
          setCloseDialogOpen(true);
        }
      } finally {
        setCloseActionLoading(null);
        if (!autoTriggered) {
          setCloseDialogOpen(false);
          setRememberCloseChoice(false);
        }
      }
    },
    [toast],
  );

  // 监听窗口关闭事件
  useEffect(() => {
    if (!isTauriEnvironment()) {
      return;
    }

    let unlisten: UnlistenFn | null = null;
    let disposed = false;

    listen(CLOSE_EVENT, () => {
      if (typeof window !== 'undefined') {
        try {
          const savedPreference = window.localStorage.getItem(
            CLOSE_PREFERENCE_KEY,
          ) as CloseAction | null;

          if (savedPreference === 'minimize' || savedPreference === 'quit') {
            executeCloseAction(savedPreference, true, true);
            return;
          }
        } catch (storageError) {
          console.warn('读取关闭偏好失败:', storageError);
        }
      }

      setCloseDialogOpen(true);
    })
      .then((fn) => {
        if (disposed) {
          fn();
        } else {
          unlisten = fn;
        }
      })
      .catch((error) => {
        console.error('注册关闭事件监听失败:', error);
      });

    return () => {
      disposed = true;
      if (unlisten) {
        unlisten();
      }
    };
  }, [executeCloseAction]);

  // 监听单例应用事件
  useEffect(() => {
    if (!isTauriEnvironment()) {
      return;
    }

    let unlisten: UnlistenFn | null = null;
    let disposed = false;

    listen<SingleInstancePayload>(SINGLE_INSTANCE_EVENT, (event) => {
      const args = event.payload?.args?.slice(1).join(' ') ?? '';
      toast({
        title: 'DuckCoding 已在运行',
        description: args
          ? `已切换到当前实例（参数：${args}）`
          : '检测到重复启动，已切换到当前实例。',
      });
    })
      .then((fn) => {
        if (disposed) {
          fn();
        } else {
          unlisten = fn;
        }
      })
      .catch((error) => {
        console.error('注册 single-instance 事件监听失败:', error);
      });

    return () => {
      disposed = true;
      if (unlisten) {
        unlisten();
      }
    };
  }, [toast]);

  // 监听页面导航事件（从各个页面组件触发）
  useEffect(() => {
    const handleNavigateToConfig = (event: Event) => {
      const customEvent = event as CustomEvent<{ toolId?: string }>;
      setActiveTab('config');
      console.log('Navigate to config:', customEvent.detail);
    };

    const handleNavigateToInstall = () => {
      setActiveTab('install');
    };

    const handleNavigateToSettings = () => {
      setActiveTab('settings');
    };

    const handleRefreshTools = () => {
      loadTools();
    };

    window.addEventListener('navigate-to-config', handleNavigateToConfig);
    window.addEventListener('navigate-to-install', handleNavigateToInstall);
    window.addEventListener('navigate-to-settings', handleNavigateToSettings);
    window.addEventListener('refresh-tools', handleRefreshTools);

    return () => {
      window.removeEventListener('navigate-to-config', handleNavigateToConfig);
      window.removeEventListener('navigate-to-install', handleNavigateToInstall);
      window.removeEventListener('navigate-to-settings', handleNavigateToSettings);
      window.removeEventListener('refresh-tools', handleRefreshTools);
    };
  }, [loadTools]);

  return (
    <div className="flex h-screen bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-800">
      {/* 侧边栏 */}
      <AppSidebar activeTab={activeTab} onTabChange={(tab) => setActiveTab(tab as TabType)} />

      {/* 主内容区域 */}
      <main className="flex-1 overflow-auto">
        {activeTab === 'dashboard' && <DashboardPage tools={tools} loading={toolsLoading} />}
        {activeTab === 'install' && <InstallationPage tools={tools} loading={toolsLoading} />}
        {activeTab === 'config' && <ConfigurationPage tools={tools} loading={toolsLoading} />}
        {activeTab === 'switch' && <ProfileSwitchPage tools={tools} loading={toolsLoading} />}
        {activeTab === 'statistics' && <StatisticsPage />}
        {activeTab === 'settings' && <SettingsPage />}
      </main>

      {/* 关闭动作选择对话框 */}
      <CloseActionDialog
        open={closeDialogOpen}
        closeActionLoading={closeActionLoading}
        rememberCloseChoice={rememberCloseChoice}
        onClose={() => {
          setCloseDialogOpen(false);
          setRememberCloseChoice(false);
        }}
        onRememberChange={setRememberCloseChoice}
        onExecuteAction={(action: CloseAction, remember: boolean) => executeCloseAction(action, remember, false)}
      />

      {/* Toast 通知 */}
      <Toaster />
    </div>
  );
}

export default App;
