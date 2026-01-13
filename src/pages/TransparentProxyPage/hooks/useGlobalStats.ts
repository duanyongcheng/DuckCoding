/**
 * @deprecated 此 Hook 已被 useAnalyticsStats 取代，请使用新的统一 Hook
 *
 * 问题：
 * - 数据源不一致（会话聚合 vs Analytics API）
 * - 成本计算不准确（使用硬编码价格）
 * - 性能问题（串行查询多个会话）
 *
 * 迁移指南：
 * ```typescript
 * // 旧代码
 * const { stats, loading } = useGlobalStats(toolId);
 *
 * // 新代码
 * import { useAnalyticsStats } from '@/hooks/useAnalyticsStats';
 * const stats = useAnalyticsStats({ toolId });
 * ```
 *
 * @see {@link useAnalyticsStats} - 新的统一 Analytics Hook
 */

// 全局统计数据 Hook（已废弃）
// 聚合所有会话的统计数据

import { useState, useEffect, useCallback } from 'react';
import {
  getSessionList,
  getSessionStats,
  queryTokenLogs,
  type SessionRecord,
} from '@/lib/tauri-commands';
import type { ToolId } from '../types/proxy-history';
import type { TokenLog } from '@/types/token-stats';

/**
 * 全局统计数据结构
 */
export interface GlobalStats {
  // 聚合统计
  totalRequests: number;
  totalInput: number;
  totalOutput: number;
  totalCacheCreation: number;
  totalCacheRead: number;
  totalCost: number;

  // 会话相关
  activeSessions: number;
  totalSessions: number;

  // 成功率
  successCount: number;
  failedCount: number;
  failureRate: number;

  // 平均耗时（暂时为 0，后续从日志计算）
  averageResponseTime: number;

  // 日志数据（用于图表渲染）
  logs: TokenLog[];
  sessions: SessionRecord[];
}

/**
 * 时间范围类型
 */
export type TimeRange = '24h' | '7d' | '30d';

/**
 * 获取时间范围的起始时间戳（毫秒）
 */
function getStartTime(timeRange: TimeRange): number {
  const now = Date.now();
  switch (timeRange) {
    case '24h':
      return now - 24 * 60 * 60 * 1000;
    case '7d':
      return now - 7 * 24 * 60 * 60 * 1000;
    case '30d':
      return now - 30 * 24 * 60 * 60 * 1000;
  }
}

/**
 * 判断会话是否活跃（最近 5 分钟有活动）
 */
function isActiveSession(lastSeenAt: number): boolean {
  const now = Math.floor(Date.now() / 1000);
  return now - lastSeenAt < 5 * 60;
}

/**
 * 全局统计数据 Hook
 *
 * @deprecated 此 Hook 已被 useAnalyticsStats 取代
 * @see {@link useAnalyticsStats}
 *
 * 功能：
 * - 聚合所有会话的统计数据
 * - 获取日志数据用于图表渲染
 * - 支持时间范围切换
 * - 自动刷新（30 秒间隔）
 */
export function useGlobalStats(toolId: ToolId | null) {
  const [stats, setStats] = useState<GlobalStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [timeRange, setTimeRange] = useState<TimeRange>('24h');

  /**
   * 获取全局统计数据
   */
  const fetchStats = useCallback(async () => {
    if (!toolId) return;

    try {
      setLoading(true);

      // 1. 获取所有会话列表
      const { sessions } = await getSessionList(toolId, 1, 999);

      // 2. 并行获取每个会话的统计数据
      const statsPromises = sessions.map((s) => getSessionStats(toolId, s.session_id));
      const sessionStats = await Promise.allSettled(statsPromises);

      // 3. 聚合统计数据（只统计成功的）
      const aggregated = sessionStats.reduce(
        (acc, result) => {
          if (result.status === 'fulfilled') {
            const curr = result.value;
            return {
              totalRequests: acc.totalRequests + curr.request_count,
              totalInput: acc.totalInput + curr.total_input,
              totalOutput: acc.totalOutput + curr.total_output,
              totalCacheCreation: acc.totalCacheCreation + curr.total_cache_creation,
              totalCacheRead: acc.totalCacheRead + curr.total_cache_read,
            };
          }
          return acc;
        },
        {
          totalRequests: 0,
          totalInput: 0,
          totalOutput: 0,
          totalCacheCreation: 0,
          totalCacheRead: 0,
        },
      );

      // 4. 获取日志数据（用于计算成本、失败率和趋势图）
      const logsResult = await queryTokenLogs({
        tool_type: toolId,
        start_time: getStartTime(timeRange),
        page: 0,
        page_size: 1000, // 获取最近 1000 条日志
      });

      // 5. 计算成本
      const totalCost = logsResult.logs.reduce((acc, log) => {
        // 假设成本计算逻辑（实际需要从后端获取价格）
        // 这里使用简单的估算：input $0.003/1K, output $0.015/1K
        const inputCost = (log.input_tokens / 1000) * 0.003;
        const outputCost = (log.output_tokens / 1000) * 0.015;
        const cacheCost = (log.cache_creation_tokens / 1000) * 0.003;
        return acc + inputCost + outputCost + cacheCost;
      }, 0);

      // 6. 计算成功率
      const successCount = logsResult.logs.filter((l) => l.request_status === 'success').length;
      const failedCount = logsResult.logs.filter((l) => l.request_status === 'failed').length;
      const failureRate = logsResult.total > 0 ? (failedCount / logsResult.total) * 100 : 0;

      // 7. 计算活跃会话数
      const activeSessions = sessions.filter((s) => isActiveSession(s.last_seen_at)).length;

      // 8. 更新状态
      setStats({
        ...aggregated,
        totalCost,
        activeSessions,
        totalSessions: sessions.length,
        successCount,
        failedCount,
        failureRate,
        averageResponseTime: 0, // TODO: 从日志计算
        logs: logsResult.logs,
        sessions,
      });
    } catch (error) {
      console.error('Failed to fetch global stats:', error);
      // 设置空数据避免 UI 崩溃
      setStats({
        totalRequests: 0,
        totalInput: 0,
        totalOutput: 0,
        totalCacheCreation: 0,
        totalCacheRead: 0,
        totalCost: 0,
        activeSessions: 0,
        totalSessions: 0,
        successCount: 0,
        failedCount: 0,
        failureRate: 0,
        averageResponseTime: 0,
        logs: [],
        sessions: [],
      });
    } finally {
      setLoading(false);
    }
  }, [toolId, timeRange]);

  // 自动刷新（30 秒间隔）
  useEffect(() => {
    if (!toolId) {
      setStats(null);
      setLoading(false);
      return;
    }

    // 立即执行一次
    fetchStats();

    // 每 30 秒刷新
    const interval = setInterval(fetchStats, 30000);

    return () => clearInterval(interval);
  }, [fetchStats, toolId]);

  return {
    stats,
    loading,
    timeRange,
    setTimeRange,
    refresh: fetchStats,
  };
}
