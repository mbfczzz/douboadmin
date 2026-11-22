import { points, type Dashboard } from "../business/types";
import { count } from "./format";
import "./headline.css";

export default function PointsSummary({
  data,
  days,
}: {
  data: Dashboard;
  days: number;
}) {
  const p = data.points;
  const period = days === 1 ? "今日" : `近 ${days} 天`;
  const cards = [
    {
      label: `${period}已使用积分`,
      value: p?.spentUnits,
      note: p
        ? `成功结算 ${count(p.chargedJobs)} 个任务 · 按结算时间`
        : "仅统计成功任务的实际扣费",
    },
    {
      label: "图片已用积分",
      value: p?.imageUnits,
      note: "本期图片任务成功扣费",
    },
    {
      label: "视频已用积分",
      value: p?.videoUnits,
      note: "本期视频、混剪成功扣费",
    },
    {
      label: "Agent／其他已用积分",
      value: p?.otherUnits,
      note: "本期对话、配音等成功扣费",
    },
    {
      label: "当前待结算积分",
      value: p?.reservedUnits,
      note: p
        ? `${count(p.reservedJobs)} 个任务 · 未计入已用`
        : "当前尚未结算的任务预留",
    },
    {
      label: `${period}失败已退回积分`,
      value: p?.releasedUnits,
      note: p
        ? `${count(p.releasedJobs)} 个任务 · 含人工退回`
        : "仅统计已退回到账的积分",
    },
  ];
  return (
    <div className="points-summary" role="region" aria-label="积分统计">
      {cards.map((card) => (
        <section
          className="panel points-card"
          aria-label={card.label}
          key={card.label}
        >
          <span className="headline-label">{card.label}</span>
          <strong>{card.value === undefined ? "—" : points(card.value)}</strong>
          <small className="quiet">{card.note}</small>
        </section>
      ))}
    </div>
  );
}
