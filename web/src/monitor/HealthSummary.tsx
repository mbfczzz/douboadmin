import { CircleAlert, CircleCheck, CircleX, ArrowRight } from "lucide-react";
import type { Row } from "../api";
import type { PageId } from "../navigation";
import type { Event, Health } from "./types";
import { online } from "./types";
import "./health.css";

type Issue = {
  level: "critical" | "warning";
  text: string;
  go: () => void;
};

// The page's verdict first: healthy, needs attention or failing, with the
// concrete problems listed and each one linked to where it can be checked.
export default function HealthSummary({
  health: h,
  logs,
  alerts,
  showEvents,
  navigate,
}: {
  health?: Health;
  logs?: Row<Event>[];
  alerts?: Row<Event>[];
  showEvents: (tab: "logs" | "alerts") => void;
  navigate: (page: PageId) => void;
}) {
  if (!h) return null;
  const scroll = (id: string) =>
      document
        .getElementById(id)
        ?.scrollIntoView({ behavior: "smooth", block: "start" }),
    live = h.instances.filter(online),
    workers = live.filter((n) => n.data.role === "worker").length,
    hourAgo = Date.now() - 3600_000,
    errors = (logs || []).filter(
      (r) =>
        r.data.level === "ERROR" &&
        Date.parse(r.data.lastAt || r.createdAt) > hourAgo,
    ).length,
    pending = (alerts || []).filter((r) => !r.data.acknowledged).length,
    issues: Issue[] = [];
  if (!h.database)
    issues.push({
      level: "critical",
      text: "数据库连接异常",
      go: () => scroll("monitor-connections"),
    });
  if (!live.length)
    issues.push({
      level: "critical",
      text: "没有在线节点，请检查服务进程",
      go: () => scroll("monitor-nodes"),
    });
  else if (
    h.queue.queued > 0 &&
    !workers &&
    h.instances.some((n) => n.data.role === "worker")
  )
    issues.push({
      level: "critical",
      text: `${h.queue.queued} 个任务排队，但没有在线的 Worker`,
      go: () => scroll("monitor-nodes"),
    });
  if (!h.relayConfigured)
    issues.push({
      level: "critical",
      text: "AI 中转未配置，无法生成",
      go: () => navigate("settings"),
    });
  if (h.queue.failedHour > 0)
    issues.push({
      level: "warning",
      text: `近 1 小时 ${h.queue.failedHour} 个生成任务失败`,
      go: () => navigate("jobs"),
    });
  if (pending)
    issues.push({
      level: "warning",
      text: `${pending} 条告警待确认`,
      go: () => showEvents("alerts"),
    });
  if (errors)
    issues.push({
      level: "warning",
      text: `近 1 小时 ${errors} 条错误日志`,
      go: () => showEvents("logs"),
    });
  if (h.queue.queued >= 20)
    issues.push({
      level: "warning",
      text: `${h.queue.queued} 个任务排队等待`,
      go: () => scroll("monitor-nodes"),
    });
  if (!h.ossConfigured)
    issues.push({
      level: "warning",
      text: "阿里云 OSS 未配置",
      go: () => navigate("settings"),
    });
  const critical = issues.some((i) => i.level === "critical"),
    state = critical ? "critical" : issues.length ? "warning" : "ok",
    Icon = critical ? CircleX : issues.length ? CircleAlert : CircleCheck;
  return (
    <section className={"health-summary " + state} aria-label="运行状态总览">
      <div className="health-verdict">
        <Icon size={30} aria-hidden="true" />
        <div>
          <h2>
            {critical
              ? "服务异常"
              : issues.length
                ? `${issues.length} 项需要关注`
                : "运行正常"}
          </h2>
          <p>
            在线节点 {live.length} 个 · 正在处理 {h.queue.running} · 排队{" "}
            {h.queue.queued} · 每 15 秒自动刷新
          </p>
        </div>
      </div>
      {issues.length > 0 && (
        <ul className="health-issues">
          {issues.map((issue) => (
            <li key={issue.text} className={issue.level}>
              <button type="button" onClick={issue.go}>
                <i aria-hidden="true" />
                <span>{issue.text}</span>
                <ArrowRight size={14} aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
