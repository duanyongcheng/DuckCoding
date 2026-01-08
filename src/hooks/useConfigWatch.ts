/**
 * 配置变更监听 Hook - 支持队列处理
 */
import { useState, useEffect, useCallback, useRef } from 'react';
import { listen } from '@tauri-apps/api/event';
import type { ExternalConfigChange } from '@/types/config-watch';

interface UseConfigWatchResult {
  /** 当前变更信息 */
  change: ExternalConfigChange | null;
  /** 是否显示对话框 */
  showDialog: boolean;
  /** 关闭对话框 */
  closeDialog: () => void;
  /** 队列中剩余的变更数量（不包括当前显示的） */
  queueLength: number;
}

/**
 * 监听配置文件外部变更（支持多工具变更队列）
 */
export function useConfigWatch(): UseConfigWatchResult {
  const [change, setChange] = useState<ExternalConfigChange | null>(null);
  const [showDialog, setShowDialog] = useState(false);
  const [queueLength, setQueueLength] = useState(0);
  // 使用 ref 存储队列，避免闭包问题
  const queueRef = useRef<ExternalConfigChange[]>([]);
  // 标记是否正在显示对话框
  const isShowingRef = useRef(false);

  // 显示下一个待处理的变更
  const showNext = useCallback(() => {
    if (queueRef.current.length > 0 && !isShowingRef.current) {
      const next = queueRef.current[0];
      console.log(
        '[ConfigWatch] 显示下一个变更:',
        next.tool_id,
        '队列剩余:',
        queueRef.current.length,
      );
      setChange(next);
      setShowDialog(true);
      setQueueLength(queueRef.current.length - 1); // 不包括当前显示的
      isShowingRef.current = true;
    }
  }, []);

  useEffect(() => {
    // 监听配置外部变更事件
    const unlisten = listen<ExternalConfigChange>('external-config-changed', (event) => {
      const newChange = event.payload;
      console.log('[ConfigWatch] 收到配置变更:', newChange.tool_id);

      // 如果队列中已有该工具的变更，替换为最新的（因为后端会标记旧的为 superseded）
      const existingIndex = queueRef.current.findIndex((c) => c.tool_id === newChange.tool_id);
      if (existingIndex >= 0) {
        console.log('[ConfigWatch] 替换队列中的旧变更:', newChange.tool_id);
        queueRef.current[existingIndex] = newChange;
      } else {
        // 添加到队列末尾
        queueRef.current.push(newChange);
        console.log(
          '[ConfigWatch] 添加到队列:',
          newChange.tool_id,
          '队列长度:',
          queueRef.current.length,
        );
      }

      // 如果当前没有显示对话框，立即显示
      if (!isShowingRef.current) {
        showNext();
      }
    });

    return () => {
      unlisten.then((fn) => fn());
    };
  }, [showNext]);

  const closeDialog = useCallback(() => {
    console.log('[ConfigWatch] 关闭对话框，队列长度:', queueRef.current.length);
    setShowDialog(false);
    isShowingRef.current = false;

    // 从队列中移除当前变更
    if (queueRef.current.length > 0) {
      queueRef.current.shift();
      console.log('[ConfigWatch] 移除当前变更，队列剩余:', queueRef.current.length);
    }

    // 延迟清空当前显示的数据，避免对话框关闭动画时看到空内容
    setTimeout(() => {
      setChange(null);
      // 检查是否还有待处理的变更
      if (queueRef.current.length > 0) {
        console.log('[ConfigWatch] 显示队列中的下一个变更');
        showNext();
      }
    }, 300);
  }, [showNext]);

  return {
    change,
    showDialog,
    closeDialog,
    queueLength,
  };
}
