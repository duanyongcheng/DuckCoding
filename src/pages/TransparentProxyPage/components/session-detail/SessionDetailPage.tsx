// 会话详情主页面
// 展示单个会话的详细信息，包含三个 Tab

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ChevronLeft } from 'lucide-react';
import { useSessionData } from '../../hooks/useSessionData';
import { SessionStatsTab } from './SessionStatsTab';
import { SessionLogsTab } from './SessionLogsTab';
import { SessionSettingsTab } from './SessionSettingsTab';
import { SESSION_DETAIL_TABS, type SessionDetailTabId } from '../../types/tab-types';
import type { ToolId } from '../../types/proxy-history';

interface SessionDetailPageProps {
  sessionId: string;
  toolId: ToolId;
  onBack: () => void;
}

/**
 * 会话详情页组件
 */
export function SessionDetailPage({ sessionId, toolId, onBack }: SessionDetailPageProps) {
  const [activeTab, setActiveTab] = useState<SessionDetailTabId>('session-stats');
  const { sessions } = useSessionData(toolId);

  // 查找当前会话
  const session = sessions.find((s) => s.session_id === sessionId);

  // 格式化时间
  const formatTime = (timestamp: number) => {
    return new Date(timestamp * 1000).toLocaleString('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  // 会话不存在
  if (!session) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <p className="text-lg text-muted-foreground mb-4">会话不存在或已被删除</p>
        <Button onClick={onBack}>
          <ChevronLeft className="h-4 w-4 mr-1" />
          返回会话列表
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-4 mt-4">
      {/* 返回按钮 + 标题 */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={onBack}>
          <ChevronLeft className="h-4 w-4 mr-1" />
          返回
        </Button>
        <div className="flex-1">
          <h2 className="text-xl font-semibold">{session.note || '未命名会话'}</h2>
          <p className="text-sm text-muted-foreground">
            ID: {session.display_id} | 启动于: {formatTime(session.first_seen_at)}
          </p>
        </div>
      </div>

      {/* 三个 Tab */}
      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as SessionDetailTabId)}>
        <TabsList className="grid w-full grid-cols-3">
          {SESSION_DETAIL_TABS.map((tab) => (
            <TabsTrigger key={tab.id} value={tab.id}>
              {tab.icon} {tab.label}
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value="session-stats">
          <SessionStatsTab sessionId={sessionId} toolId={toolId} />
        </TabsContent>

        <TabsContent value="session-logs">
          <SessionLogsTab sessionId={sessionId} toolId={toolId} />
        </TabsContent>

        <TabsContent value="session-settings">
          <SessionSettingsTab session={session} toolId={toolId} onBack={onBack} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
