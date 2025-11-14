import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { BarChart3, Settings as SettingsIcon, RefreshCw, Loader2 } from 'lucide-react';
import { PageContainer } from '@/components/layout/PageContainer';
import { QuotaCard } from '@/components/QuotaCard';
import { TodayStatsCard } from '@/components/TodayStatsCard';
import { UsageChart } from '@/components/UsageChart';
import type { GlobalConfig } from '@/lib/tauri-commands';
import { getGlobalConfig, getUserQuota, getUsageStats } from '@/lib/tauri-commands';
import type { UserQuotaResult, UsageStatsResult } from '@/lib/tauri-commands';

export function StatisticsPage() {
  const [globalConfig, setGlobalConfig] = useState<GlobalConfig | null>(null);
  const [usageStats, setUsageStats] = useState<UsageStatsResult | null>(null);
  const [userQuota, setUserQuota] = useState<UserQuotaResult | null>(null);
  const [loadingStats, setLoadingStats] = useState(false);

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

  // 加载统计数据
  const loadStatistics = async () => {
    if (!globalConfig?.user_id || !globalConfig?.system_token) {
      return;
    }

    try {
      setLoadingStats(true);

      const [quota, stats] = await Promise.all([
        getUserQuota(globalConfig.user_id, globalConfig.system_token),
        getUsageStats(globalConfig.user_id, globalConfig.system_token),
      ]);

      setUserQuota(quota);
      setUsageStats(stats);
    } catch (error) {
      console.error('Failed to load statistics:', error);
    } finally {
      setLoadingStats(false);
    }
  };

  // 当配置加载后自动加载统计数据
  useEffect(() => {
    if (globalConfig?.user_id && globalConfig?.system_token) {
      loadStatistics();
    }
  }, [globalConfig]);

  const hasCredentials = globalConfig?.user_id && globalConfig?.system_token;

  return (
    <PageContainer>
      <div className="mb-6">
        <h2 className="text-2xl font-semibold mb-1">用量统计</h2>
        <p className="text-sm text-muted-foreground">
          查看您的 DuckCoding API 使用情况和消费记录
        </p>
      </div>

      {!hasCredentials ? (
        <Card className="shadow-sm border">
          <CardContent className="pt-6">
            <div className="text-center py-12">
              <BarChart3 className="h-16 w-16 mx-auto mb-4 text-muted-foreground opacity-30" />
              <h3 className="text-lg font-semibold mb-2">需要配置凭证</h3>
              <p className="text-sm text-muted-foreground mb-4">
                请先在全局设置中配置您的用户ID和系统访问令牌
              </p>
              <Button
                onClick={() => {
                  // 切换到设置页面的逻辑将在父组件中处理
                  // 这里可以通过回调或全局状态管理来实现
                  window.dispatchEvent(new CustomEvent('navigate-to-settings'));
                }}
                className="shadow-md hover:shadow-lg transition-all"
              >
                <SettingsIcon className="mr-2 h-4 w-4" />
                前往设置
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-6">
          <div className="flex items-center justify-end">
            <Button
              variant="outline"
              size="sm"
              onClick={loadStatistics}
              disabled={loadingStats}
              className="shadow-sm hover:shadow-md transition-all"
            >
              {loadingStats ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  加载中...
                </>
              ) : (
                <>
                  <RefreshCw className="mr-2 h-4 w-4" />
                  刷新数据
                </>
              )}
            </Button>
          </div>

          {/* 顶部卡片网格 - 2列 */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <QuotaCard quota={userQuota} loading={loadingStats} />
            <TodayStatsCard stats={usageStats} loading={loadingStats} />
          </div>

          {/* 用量趋势图 - 全宽 */}
          <UsageChart stats={usageStats} loading={loadingStats} />
        </div>
      )}
    </PageContainer>
  );
}
