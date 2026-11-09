import type { Daily } from "../business/types";
import type { Traffic } from "../business/traffic";
import { count, pct } from "./format";
import { duration } from "./traffic-names";

const ratio = (r: number) => pct(r, 1);

// Eight visit figures for the selected client (or all clients).
export default function TrafficKpis({
  t,
  all,
  days,
  whole,
}: {
  t: Traffic;
  all: Traffic;
  days: Daily[];
  whole: boolean;
}) {
  const n = days.length || 1,
    dailyUV = days.reduce((a, d) => a + (d.uv || 0), 0) / n;
  const tiles: [string, string, string][] = [
    ["浏览量 PV", count(t.pv), `日均 ${(t.pv / n).toFixed(1)}`],
    [
      "访客数 UV",
      count(t.uv),
      whole ? `日均 ${dailyUV.toFixed(1)} 人` : `占全部 ${pct(t.uv, all.uv)}`,
    ],
    [
      "访问次数",
      count(t.visits),
      `人均 ${(t.visits / (t.uv || 1)).toFixed(1)} 次`,
    ],
    ["人均浏览页数", t.pagesPerVisit.toFixed(1), "按访问次数平均"],
    ["平均访问时长", duration(t.avgVisitSeconds), "首末页面间隔"],
    ["跳出率", ratio(t.bounceRate), "只浏览 1 个页面"],
    ["新访客", count(t.newVisitors), `占访客 ${pct(t.newVisitors, t.uv)}`],
    // Retention follows signed-in accounts, so it is not split by client.
    [
      "次日留存",
      whole && t.retentionBase ? ratio(t.nextDayRetention) : "—",
      !whole
        ? "按账号统计，见「全部」"
        : t.retentionBase
          ? `登录用户 · ${count(t.retentionBase)} 人次`
          : "需两个完整自然日",
    ],
  ];
  return (
    <dl className="kpi-strip traffic-kpis" aria-label="访问指标">
      {tiles.map(([label, value, note]) => (
        <div key={label}>
          <dt>{label}</dt>
          <dd>{value}</dd>
          <small>{note}</small>
        </div>
      ))}
    </dl>
  );
}
