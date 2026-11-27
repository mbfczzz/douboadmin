// 错误归档: an upstream failure's text fragment and the words users read
// instead (server: api/error_rules.go).
export interface ErrorRule {
  contains: string;
  message: string;
  action?: string;
}

// A starting point for the match text: the upstream reason after its last
// prefix ("…task_failed）：video_generation_failed: 本次生成失败：…"),
// which the administrator trims to the words that do not change.
export function suggestedFragment(cause: string) {
  const parts = cause.split(/[：:]\s*/).filter((p) => p.trim().length >= 4);
  return (parts.slice(-2).join("：") || cause).trim().slice(0, 200);
}
