// 会话日志 Tab 组件
// 复用 LogsTable 组件展示单个会话的日志，自动过滤该会话

import { LogsTable } from '../LogsTable';
import type { ToolId } from '../../types/proxy-history';

interface SessionLogsTabProps {
  sessionId: string;
  toolId: ToolId;
}

/**
 * 会话日志 Tab 组件
 */
export function SessionLogsTab({ sessionId, toolId }: SessionLogsTabProps) {
  return (
    <div className="space-y-4">
      {/* 复用 LogsTable 组件，自动过滤该会话的日志 */}
      <LogsTable initialToolType={toolId} initialSessionId={sessionId} hideSessionIdFilter={true} />
    </div>
  );
}
