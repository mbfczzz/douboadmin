import { useResource } from "../hooks/useResource";
import type { APIStats } from "../business/types";
import "./api-health.css";

const count = (n: number) => n.toLocaleString("zh-CN");
const share = (n: number, of: number) =>
  of ? `${((n / of) * 100).toFixed(1)}%` : "—";

// Today's API traffic from the operation log: volume, failures, latency.
// Server errors and slow requests are coloured when they occur.
export default function ApiHealth() {
  const res = useResource<{ stats: APIStats; dropped: number }>(
    "/admin/audit/stats?days=1",
    60000,
  );
  const s = res.data?.stats;
  if (!s) return null;
  const tiles: [string, string, string, string?][] = [
    ["请求量", count(s.requests), `${count(s.users)} 位用户调用`],
    [
      "服务错误率",
      share(s.errors, s.requests),
      `5xx ${count(s.errors)} 次`,
      s.errors ? "bad" : undefined,
    ],
    ["请求被拒", share(s.rejected, s.requests), `4xx ${count(s.rejected)} 次`],
    [
      "平均响应",
      `${Math.round(s.avgMs)} ms`,
      `慢请求 ${count(s.slow)} 次（>1 秒）`,
      s.slow ? "warn" : undefined,
    ],
  ];
  return (
    <section className="panel api-health" aria-label="接口健康">
      <header>
        <h2>接口健康</h2>
        <span className="quiet">
          今日 · 来自操作日志
          {res.data?.dropped ? ` · 日志队列丢弃 ${res.data.dropped} 条` : ""}
        </span>
      </header>
      <dl>
        {tiles.map(([label, value, note, tone]) => (
          <div key={label} className={tone}>
            <dt>{label}</dt>
            <dd>{value}</dd>
            <small>{note}</small>
          </div>
        ))}
      </dl>
    </section>
  );
}
