import { useState, useRef, useCallback } from 'react';
import {
  updateTool as updateToolCommand,
  checkAllUpdates,
  type ToolStatus,
} from '@/lib/tauri-commands';

export function useDashboard(initialTools: ToolStatus[]) {
  const [tools, setTools] = useState<ToolStatus[]>(initialTools);
  const [updating, setUpdating] = useState<string | null>(null);
  const [checkingUpdates, setCheckingUpdates] = useState(false);
  const [updateCheckMessage, setUpdateCheckMessage] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);

  const updateMessageTimeoutRef = useRef<NodeJS.Timeout | null>(null);

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
  const handleUpdate = async (
    toolId: string,
  ): Promise<{ success: boolean; message: string; isUpdating?: boolean }> => {
    if (updating) {
      return {
        success: false,
        message: '已有更新任务正在进行，请等待完成后再试',
        isUpdating: true,
      };
    }

    try {
      setUpdating(toolId);
      await updateToolCommand(toolId);

      return {
        success: true,
        message: '已更新到最新版本',
      };
    } catch (error) {
      console.error('Failed to update ' + toolId, error);
      return {
        success: false,
        message: String(error),
      };
    } finally {
      setUpdating(null);
    }
  };

  // 更新tools数据（用于外部同步）
  // 智能合并：保留现有的更新检测字段，避免被外部状态覆盖
  const updateTools = useCallback((newTools: ToolStatus[]) => {
    setTools((prevTools) => {
      const mergedTools = newTools.map((newTool) => {
        const existingTool = prevTools.find((t) => t.id === newTool.id);

        // 如果找到现有工具，合并状态并保留更新检测字段
        if (existingTool) {
          return {
            ...newTool,
            // 保留检查更新后设置的字段
            hasUpdate: existingTool.hasUpdate,
            latestVersion: existingTool.latestVersion,
            mirrorVersion: existingTool.mirrorVersion,
            mirrorIsStale: existingTool.mirrorIsStale,
          };
        }

        // 新工具直接使用
        return newTool;
      });

      return mergedTools;
    });
  }, []); // 空依赖数组，因为使用了函数式更新

  return {
    tools,
    updating,
    checkingUpdates,
    updateCheckMessage,
    checkForUpdates,
    handleUpdate,
    updateTools,
  };
}
