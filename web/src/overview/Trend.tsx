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

// One daily series at a time; a single axis per chart, switched by the tabs.
export default function Trend({ series }: { series: Daily[] }) {
  const [key, setKey] = useState("jobs"),
    m = metrics.find((x) => x.key === key) || metrics[0],
    values = series.map(m.value),
    peak = Math.max(0, ...values),
    label = `每日${m.name}趋势`;
  return (
    <section className="panel">
      <div className="section-head">
        <h2>每日{m.name}</h2>
        <span className="quiet">
          峰值 {m.text(peak)}
          {m.unit && " " + m.unit} / 日
        </span>
      </div>
      <div className="trend-switch" role="tablist" aria-label="趋势指标">
        {metrics.map((x) => (
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
            所选时段暂无{m.name === "生成量" ? "生成任务" : "数据"}
          </span>
        )}
        {!!peak && (
          <span className="trend-scale quiet" aria-hidden="true">
            <span>{m.text(peak)}</span>
            <span>0</span>
          </span>
        )}
        {!!peak &&
          series.map((d, i) => {
            const tip = `${d.date}：${m.text(values[i])}${m.unit && " " + m.unit}`;
            return (
              <div
                key={d.date}
                className="tip"
                data-tip={tip}
                title={tip}
                style={{ height: (values[i] / peak) * 180 }}
              />
            );
          })}
      </div>
      <p className="chart-axis quiet">
        <span>{series[0]?.date}</span>
        <span>北京时间</span>
        <span>{series.at(-1)?.date}</span>
      </p>
    </section>
  );
}
