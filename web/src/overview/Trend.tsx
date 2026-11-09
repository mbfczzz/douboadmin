import { useState } from "react";
import { money, points, type Daily } from "../business/types";

const metrics: {
  key: string;
  name: string;
  value: (d: Daily) => number;
  text: (n: number) => string;
  unit: string;
}[] = [
  {
    key: "jobs",
    name: "生成量",
    value: (d) => d.jobs,
    text: String,
    unit: "次",
  },
  {
    key: "pv",
    name: "浏览量",
    value: (d) => d.pv || 0,
    text: String,
    unit: "次",
  },
  {
    key: "uv",
    name: "访客数",
    value: (d) => d.uv || 0,
    text: String,
    unit: "人",
  },
  {
    key: "new",
    name: "新增用户",
    value: (d) => d.newUsers,
    text: String,
    unit: "人",
  },
  {
    key: "active",
    name: "活跃用户",
    value: (d) => d.activeUsers,
    text: String,
    unit: "人",
  },
  {
    key: "paid",
    name: "实收金额",
    value: (d) => d.paidFen,
    text: money,
    unit: "",
  },
  {
    key: "orders",
    name: "支付订单",
    value: (d) => d.paidOrders || 0,
    text: String,
    unit: "笔",
  },
  {
    key: "spent",
    name: "积分消耗",
    value: (d) => d.spentUnits || 0,
    text: points,
    unit: "积分",
  },
];

// Beijing-time hour now, to tell past hours from those still to come.
const hourNow = () =>
  Number(
    new Date().toLocaleString("en-US", {
      timeZone: "Asia/Shanghai",
      hour: "numeric",
      hourCycle: "h23",
    }),
  );

// One series at a time; a single axis per chart, switched by the tabs. The
// "today" view charts hours instead of a single daily bar.
export default function Trend({
  series,
  hours,
  only,
}: {
  series: Daily[];
  hours?: Daily[];
  // Metric keys this chart offers (a tab shows only its own).
  only?: string[];
}) {
  // In the order given, so a tab's main metric comes first.
  const list = only
      ? only.flatMap((k) => metrics.filter((x) => x.key === k))
      : metrics,
    [key, setKey] = useState(list[0].key),
    m = list.find((x) => x.key === key) || list[0],
    hourly = !!hours?.length,
    bars = hourly ? hours! : series,
    values = bars.map(m.value),
    peak = Math.max(0, ...values),
    total = values.reduce((a, v) => a + v, 0),
    now = hourly ? hourNow() : 24,
    unit = m.unit && " " + m.unit,
    label = hourly ? `今日${m.name}（按小时）` : `每日${m.name}趋势`;
  return (
    <section className="panel">
      <div className="section-head">
        <h2>
          {hourly ? "今日" : "每日"}
          {m.name}
        </h2>
        <span className="quiet">
          {hourly
            ? `合计 ${m.text(total)}${unit} · 峰值 ${m.text(peak)}${unit} / 小时`
            : `峰值 ${m.text(peak)}${unit} / 日`}
        </span>
      </div>
      <div className="trend-switch" role="tablist" aria-label="趋势指标">
        {list.map((x) => (
          <button
            key={x.key}
            role="tab"
            aria-selected={x.key === key}
            onClick={() => setKey(x.key)}
          >
            {x.name}
          </button>
        ))}
      </div>
      <div className="business-trend" role="img" aria-label={label}>
        {!peak && (
          <span className="quiet">
            {hourly ? "今天" : "所选时段"}暂无
            {m.name === "生成量" ? "生成任务" : "数据"}
          </span>
        )}
        {!!peak && (
          <span className="trend-scale quiet" aria-hidden="true">
            <span>{m.text(peak)}</span>
            <span>0</span>
          </span>
        )}
        {!!peak &&
          bars.map((d, i) => {
            const when = hourly
                ? `${d.date}–${String(i + 1).padStart(2, "0")}:00`
                : d.date,
              tip =
                hourly && i > now
                  ? `${when}：尚未到达`
                  : `${when}：${m.text(values[i])}${unit}`;
            return (
              <div
                key={d.date}
                className={"tip" + (hourly && i > now ? " future" : "")}
                data-tip={tip}
                title={tip}
                style={{ height: (values[i] / peak) * 180 }}
              />
            );
          })}
      </div>
      <p className="chart-axis quiet">
        <span>{hourly ? "00:00" : series[0]?.date}</span>
        <span>{hourly ? "北京时间 · 按小时" : "北京时间"}</span>
        <span>{hourly ? "23:00" : series.at(-1)?.date}</span>
      </p>
    </section>
  );
}
