import { ArrowDownRight, ArrowUpRight } from "lucide-react";
import { money, type Daily, type Dashboard } from "../business/types";
import { count, pct } from "./format";
import Spark from "./Spark";
import "./headline.css";

type Card = {
  label: string;
  value: number;
  prev?: number;
  text: (n: number) => string;
  note: string;
  series: (d: Daily) => number;
};

// Change against the period before; up is good for every headline figure.
function Delta({
  now,
  prev,
  against,
}: {
  now: number;
  prev?: number;
  against: string;
}) {
  if (prev === undefined) return null;
  if (!prev)
    return (
      <span className="delta flat">{now ? "上期为 0" : "与上期持平"}</span>
    );
  const change = (now - prev) / prev,
    Arrow = change > 0 ? ArrowUpRight : ArrowDownRight;
  return (
    <span
      className={"delta " + (change > 0 ? "up" : change < 0 ? "down" : "flat")}
    >
      {against}
      {change === 0 ? " 持平" : <Arrow size={13} aria-hidden="true" />}
      {change !== 0 && `${Math.abs(change * 100).toFixed(1)}%`}
    </span>
  );
}

// The five figures that tell at a glance whether the period went well.
export default function Headline({
  data,
  days,
}: {
  data: Dashboard;
  days: number;
}) {
  const series = days === 1 && data.hours?.length ? data.hours : data.days,
    sum = (pick: (d: Daily) => number) =>
      data.days.reduce((a, d) => a + (pick(d) || 0), 0),
    b = data.breakdown,
    p = data.previous,
    jobs = sum((d) => d.jobs),
    refund = sum((d) => d.refundFen),
    against = days === 1 ? "较昨日同时段" : `较前 ${days} 天`;
  const cards: Card[] = [
    {
      label: "实收金额",
      value: sum((d) => d.paidFen),
      prev: p?.paidFen,
      text: money,
      note: `净收入 ${money(sum((d) => d.revenueFen))}${refund ? ` · 退款 ${money(refund)}` : ""}`,
      series: (d) => d.paidFen,
    },
    {
      label: "新增用户",
      value: sum((d) => d.newUsers),
      prev: p?.newUsers,
      text: count,
      note: `累计 ${count(b?.totalUsers || 0)} 人`,
      series: (d) => d.newUsers,
    },
    {
      label: "生成次数",
      value: jobs,
      prev: p?.jobs,
      text: count,
      note: `成功率 ${pct(
        sum((d) => d.succeeded),
        jobs,
      )}`,
      series: (d) => d.jobs,
    },
    {
      label: "活跃用户",
      value: b?.activeUsers || 0,
      prev: p?.activeUsers,
      text: count,
      note: `发起生成 ${count(b?.creatorUsers || 0)} 人`,
      series: (d) => d.activeUsers,
    },
    {
      label: "访客数",
      value: b?.traffic?.uv || 0,
      prev: p?.uv,
      text: count,
      note: `浏览量 ${count(b?.traffic?.pv || 0)}`,
      series: (d) => d.uv || 0,
    },
  ];
  return (
    <div className="headline">
      {cards.map((c) => (
        <section
          key={c.label}
          className="panel headline-card"
          aria-label={c.label}
        >
          <span className="headline-label">{c.label}</span>
          <strong>{c.text(c.value)}</strong>
          <Delta now={c.value} prev={c.prev} against={against} />
          <small className="quiet">{c.note}</small>
          <Spark values={series.map(c.series)} />
        </section>
      ))}
    </div>
  );
}
