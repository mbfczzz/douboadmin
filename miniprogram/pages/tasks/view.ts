// How long an unfinished task has been going, from its creation time.
export function elapsed(createdAt: string, status: string, now = Date.now()) {
  const minutes = Math.max(0, Math.floor((now - Date.parse(createdAt)) / 60000));
  const span = minutes < 1 ? "不到 1 分钟" : minutes < 60 ? `${minutes} 分钟` : `${Math.floor(minutes / 60)} 小时 ${minutes % 60} 分`;
  return (status === "queued" ? "已排队 " : "已进行 ") + span;
}

// The counters double as filters: "running" (running + queued) or "failed".
export function nextFilter(current: string, picked: string) {
  return current === picked ? "" : picked;
}
