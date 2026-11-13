// "今天", "昨天" or "11月12日" for grouping lists by day.
export function dayLabel(at: string, now = new Date()) {
  const d = new Date(at);
  const days = Math.round((new Date(now.toDateString()).getTime() - new Date(d.toDateString()).getTime()) / 86400000);
  return days === 0 ? "今天" : days === 1 ? "昨天" : `${d.getMonth() + 1}月${d.getDate()}日`;
}

// Marks the first row of each day so a list can print one heading per day.
export function withDays<T extends { createdAt: string }>(rows: T[]) {
  let previous = "";
  return rows.map((row) => {
    const day = dayLabel(row.createdAt);
    const showDay = day !== previous;
    const at = new Date(row.createdAt);
    const clock = `${String(at.getHours()).padStart(2, "0")}:${String(at.getMinutes()).padStart(2, "0")}`;
    previous = day;
    return { ...row, day, showDay, clock }; // under a day heading only the time is needed
  });
}
