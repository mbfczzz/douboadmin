import type { APIStats } from "../business/types";
import { count, pct } from "./format";

// Request volume, failures and latency from the operation log for the
// overview's period (sent with the dashboard; absent if no log is kept).
export default function ServiceStats({
  s,
  days,
}: {
  s?: APIStats;
  days: number;
}) {
  if (!s) return null;
  const tiles: [string, string, string][] = [
    [
      "接口请求量",
      count(s.requests),
      days === 1 ? "今日累计" : `日均 ${count(Math.round(s.requests / days))}`,
    ],
    ["服务错误率", pct(s.errors, s.requests), `5xx ${count(s.errors)} 次`],
    ["请求被拒", pct(s.rejected, s.requests), `4xx ${count(s.rejected)} 次`],
    [
      "平均响应",
      `${Math.round(s.avgMs)} ms`,
      `慢请求 ${count(s.slow)} 次（>1 秒）`,
    ],
    ["调用用户数", count(s.users), "登录后调用过接口"],
  ];
  return (
    <>
      <h3 className="traffic-sub">服务接口</h3>
      <dl className="kpi-strip service-kpis" aria-label="服务接口指标">
        {tiles.map(([label, value, note]) => (
          <div key={label}>
            <dt>{label}</dt>
            <dd>{value}</dd>
            <small>{note}</small>
          </div>
        ))}
      </dl>
    </>
  );
}
