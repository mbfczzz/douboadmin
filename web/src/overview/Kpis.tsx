import { money, points, type Dashboard } from "../business/types";
import { pct, seconds } from "./format";

// Secondary indicators derived from the period breakdown.
export default function Kpis({ data }: { data: Dashboard }) {
  const b = data.breakdown;
  if (!b) return null;
  const sum = (pick: (d: Dashboard["days"][number]) => number) =>
      data.days.reduce((a, d) => a + (pick(d) || 0), 0),
    jobs = sum((d) => d.jobs),
    succeeded = sum((d) => d.succeeded),
    paid = sum((d) => d.paidFen),
    spent = sum((d) => d.spentUnits || 0),
    activeDays = data.days.length || 1,
    kinds = Object.values(b.kinds || {}),
    duration = kinds.reduce((a, k) => a + k.durationMs, 0),
    timed = kinds.reduce((a, k) => a + k.timed, 0);
  const items: [string, string, string][] = [
    ["累计用户", String(b.totalUsers), `周期新增 ${sum((d) => d.newUsers)}`],
    [
      "活跃用户",
      String(b.activeUsers),
      `日均 ${(sum((d) => d.activeUsers) / activeDays).toFixed(1)} 人`,
    ],
    ["生成成功率", pct(succeeded, jobs), `失败 ${sum((d) => d.failed)} 次`],
    ["平均生成耗时", seconds(duration, timed), `统计 ${timed} 个成功任务`],
    [
      "积分消耗",
      points(spent),
      `人均 ${b.creatorUsers ? points(spent / b.creatorUsers) : "—"}`,
    ],
    ["付费用户", String(b.payers), `付费率 ${pct(b.payers, b.activeUsers)}`],
    [
      "客单价",
      b.ordersPaid ? money(paid / b.ordersPaid) : "—",
      `ARPPU ${b.payers ? money(paid / b.payers) : "—"}`,
    ],
    [
      "订单支付率",
      pct(b.ordersPaid, b.ordersCreated),
      `创建 ${b.ordersCreated} · 支付 ${b.ordersPaid}`,
    ],
    ["退款率", pct(b.refunds, b.ordersPaid), `退款 ${b.refunds} 笔`],
    [
      "新开通用户",
      String(b.directActivations + b.providerActivations),
      `服务商 ${b.providerActivations} · 直接 ${b.directActivations}`,
    ],
  ];
  return (
    <dl className="kpi-strip" aria-label="更多指标">
      {items.map(([label, value, note]) => (
        <div key={label}>
          <dt>{label}</dt>
          <dd>{value}</dd>
          <small>{note}</small>
        </div>
      ))}
    </dl>
  );
}
