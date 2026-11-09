import { Activity, ListOrdered, Server, TriangleAlert } from "lucide-react";
import type { Health } from "./types";
import { online } from "./types";

// Headline counters; tone shows at a glance whether anything needs attention.
export default function Metrics({ health: h }: { health?: Health }) {
  const live = h?.instances.filter(online).length,
    items = [
      {
        label: "在线节点",
        value: live,
        note: h ? `已登记 ${h.instances.length} 个` : "",
        Icon: Server,
        tone: live === 0 ? "danger" : "success",
      },
      {
        label: "排队任务",
        value: h?.queue.queued,
        note: "等待执行",
        Icon: ListOrdered,
        tone: h?.queue.queued ? "warning" : "muted",
      },
      {
        label: "正在处理",
        value: h?.queue.running,
        note: "生成中",
        Icon: Activity,
        tone: h?.queue.running ? "info" : "muted",
      },
      {
        label: "近 1 小时失败",
        value: h?.queue.failedHour,
        note: "最近 60 分钟",
        Icon: TriangleAlert,
        tone: h?.queue.failedHour ? "danger" : "muted",
      },
    ];
  return (
    <div className="monitor-metrics">
      {items.map(({ label, value, note, Icon, tone }) => (
        <div
          key={label}
          className={"metric " + (value === undefined ? "muted" : tone)}
        >
          <span className="metric-label">
            <i aria-hidden="true">
              <Icon size={15} />
            </i>
            {label}
          </span>
          <strong
            className={tone === "danger" && value ? "monitor-danger" : ""}
          >
            {value ?? "—"}
          </strong>
          <small>{value === undefined ? "未读取" : note}</small>
        </div>
      ))}
    </div>
  );
}
