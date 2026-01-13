/**
 * 统一的 Analytics 数据 Hook
 * 整合 queryTokenTrends + queryCostSummary，提供完整的统计数据
 *
 * 功能：
 * - 支持全局统计 / 会话级统计
 * - 统一时间范围控制（15分钟～30天 + 自定义）
 * - 自动聚合 Token 分布数据
 * - 处理响应时间 null 值
 * - 数据一致性保证
 */

import { useState, useEffect, useMemo, useCallback } from 'react';
import { useTimeRangeControl, type UseTimeRangeControlReturn } from './useTimeRangeControl';
import { queryTokenTrends, queryCostSummary } from '@/lib/tauri-commands/analytics';
import type { TrendDataPoint, CostSummary } from '@/types/analytics';

/**
 * Hook 参数
 */
export interface UseAnalyticsStatsProps {
  /** 工具 ID */
  toolId: string;
  /** 会话 ID（可选，传入时为会话级统计） */
  sessionId?: string;
  /** 是否启用自动加载（默认 true） */
  enabled?: boolean;
}

/**
 * Token 分布数据
 */
export interface TokenBreakdown {
  /** 输入 Token 总数 */
  input: number;
  /** 输出 Token 总数 */
  output: number;
  /** 缓存创建 Token 总数 */
  cacheCreation: number;
  /** 缓存读取 Token 总数 */
  cacheRead: number;
}

/**
 * Analytics 统计数据
 */
export interface AnalyticsStats {
  /** 成本汇总数据（统计卡片） */
  summary: CostSummary | null;
  /** 趋势数据（图表） */
  trends: TrendDataPoint[];
  /** Token 总数 */
  totalTokens: number;
  /** Token 分布详情 */
  tokenBreakdown: TokenBreakdown;
  /** 加载状态 */
  loading: boolean;
  /** 错误信息 */
  error: string | null;
  /** 时间范围控制 */
  timeControl: UseTimeRangeControlReturn;
  /** 手动刷新 */
  refresh: () => Promise<void>;
}

/**
 * 统一的 Analytics 数据 Hook
 */
export function useAnalyticsStats(props: UseAnalyticsStatsProps): AnalyticsStats {
  const { toolId, sessionId, enabled = true } = props;

  // 时间范围控制
  const timeControl = useTimeRangeControl();

  // 数据状态
  const [trendsData, setTrendsData] = useState<TrendDataPoint[]>([]);
  const [summary, setSummary] = useState<CostSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  /**
   * 加载 Analytics 数据
   */
  const loadAnalyticsData = useCallback(async () => {
    if (!enabled) return;

    try {
      setLoading(true);
      setError(null);

      // 并行查询趋势数据和成本汇总
      const [trends, summaryData] = await Promise.all([
        queryTokenTrends({
          start_time: timeControl.startTimeMs,
          end_time: timeControl.endTimeMs,
          tool_type: toolId,
          granularity: timeControl.granularity,
          session_id: sessionId,
        }),
        queryCostSummary(timeControl.startTimeMs, timeControl.endTimeMs, toolId, sessionId),
      ]);

      // 处理响应时间的 null 值，转换为 0 以便图表连线
      const processedTrends = trends.map((point) => ({
        ...point,
        avg_response_time: point.avg_response_time ?? 0,
      }));

      setTrendsData(processedTrends);
      setSummary(summaryData);
    } catch (err: any) {
      console.error('Failed to load analytics data:', err);
      setError(err?.message || String(err));
    } finally {
      setLoading(false);
    }
  }, [
    enabled,
    toolId,
    sessionId,
    timeControl.startTimeMs,
    timeControl.endTimeMs,
    timeControl.granularity,
  ]);

  // 自动加载数据（依赖时间范围和粒度）
  useEffect(() => {
    loadAnalyticsData();
  }, [loadAnalyticsData]);

  /**
   * 计算 Token 总数
   */
  const totalTokens = useMemo(() => {
    return trendsData.reduce((acc, point) => {
      return (
        acc +
        point.input_tokens +
        point.output_tokens +
        point.cache_creation_tokens +
        point.cache_read_tokens
      );
    }, 0);
  }, [trendsData]);

  /**
   * 计算 Token 分布
   */
  const tokenBreakdown = useMemo<TokenBreakdown>(() => {
    return {
      input: trendsData.reduce((acc, point) => acc + point.input_tokens, 0),
      output: trendsData.reduce((acc, point) => acc + point.output_tokens, 0),
      cacheCreation: trendsData.reduce((acc, point) => acc + point.cache_creation_tokens, 0),
      cacheRead: trendsData.reduce((acc, point) => acc + point.cache_read_tokens, 0),
    };
  }, [trendsData]);

  return {
    summary,
    trends: trendsData,
    totalTokens,
    tokenBreakdown,
    loading,
    error,
    timeControl,
    refresh: loadAnalyticsData,
  };
}
