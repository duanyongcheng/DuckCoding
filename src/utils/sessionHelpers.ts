/**
 * 会话管理辅助工具函数
 */

/**
 * 判断会话是否活跃（5分钟内有请求）
 *
 * @param lastSeenAt - 最后请求时间戳（Unix 秒级时间戳）
 * @returns 如果会话在5分钟内活跃返回 true，否则返回 false
 */
export function isActiveSession(lastSeenAt: number): boolean {
  const now = Math.floor(Date.now() / 1000); // 转换为秒级时间戳
  const diff = now - lastSeenAt;
  return diff < 300; // 5分钟 = 300秒
}
