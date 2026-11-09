import { lazy, Suspense, useState } from "react";
import { Users, Film, CreditCard, RotateCcw } from "lucide-react";
import type { PageProps } from "../navigation";
import { useResource } from "../hooks/useResource";
import ResourcePage from "../business/ResourcePage";
import Table from "../business/Table";
import { money, type Dashboard } from "../business/types";
import Trend from "../overview/Trend";
import Kpis from "../overview/Kpis";
import Generation from "../overview/Generation";
import Business from "../overview/Business";
import Traffic from "../overview/Traffic";
import ServiceStats from "../overview/ServiceStats";
import "../overview/charts.css";
import "../overview/tip.css";
const Details = lazy(() => import("../overview/Details"));

export default function Overview({ config, navigate }: PageProps) {
  const [days, setDays] = useState(1),
    [expanded, setExpanded] = useState<Record<string, boolean>>({}),
    resource = useResource<Dashboard>("/admin/dashboard?days=" + days, 30000);
  const data = resource.data,
    series = data?.days || [];
  const total = series.reduce(
    (a, d) => ({
      users: a.users + d.newUsers,
      jobs: a.jobs + d.jobs,
      succeeded: a.succeeded + d.succeeded,
      failed: a.failed + d.failed,
      revenue: a.revenue + d.revenueFen,
      refund: a.refund + d.refundFen,
      paid: a.paid + d.paidFen,
    }),
    {
      users: 0,
      jobs: 0,
      succeeded: 0,
      failed: 0,
      revenue: 0,
      refund: 0,
      paid: 0,
    },
  );
  const unknownCost = (data?.models || []).reduce(
    (sum, m) => sum + Math.max(0, m.calls - m.known),
    0,
  );
  const attention = [
    total.failed
      ? {
          label: total.failed + " 个生成任务失败",
          help: "查看失败原因并处理。",
          page: "jobs" as const,
        }
      : undefined,
    unknownCost
      ? {
          label: unknownCost + " 次 AI 调用成本未知",
          help: "补全模型成本配置。",
          page: "models" as const,
        }
      : undefined,
    config && !config.relayConfigured
      ? {
          label: "AI 中转服务尚未配置",
          help: "配置中转服务后开放生成。",
          page: "settings" as const,
        }
      : undefined,
  ].filter((item) => item !== undefined);
  const metrics = [
    [
      "新增用户",
      total.users,
      "今日活跃 " + (series.at(-1)?.activeUsers || 0) + " 人",
      Users,
    ],
    [
      "生成任务",
      total.jobs,
      "成功 " + total.succeeded + " 次 · 失败 " + total.failed + " 次",
      Film,
    ],
    [
      "净收入",
      money(total.revenue),
      "实收金额 " + money(total.paid),
      CreditCard,
    ],
    [
      "退款金额",
      money(total.refund),
      days === 1 ? "今日累计退款" : "周期内累计退款",
      RotateCcw,
    ],
  ] as const;
  return (
    <div className="overview-page">
      <ResourcePage
        page="overview"
        resource={resource}
        actions={
          <select
            aria-label="统计周期"
            value={days}
            onChange={(e) => setDays(Number(e.target.value))}
          >
            <option value={1}>今天</option>
            <option value={7}>近 7 天</option>
            <option value={30}>近 30 天</option>
            <option value={90}>近 90 天</option>
          </select>
        }
      >
        <div className="business-metrics">
          {metrics.map(([label, value, note, Icon]) => (
            <div className="panel" key={label}>
              <Icon size={20} />
              <span>{label}</span>
              <strong>{data ? value : "—"}</strong>
              <small className="quiet">{note}</small>
            </div>
          ))}
        </div>
        {data && <Kpis data={data} />}
        <div className="overview-summary">
          <Trend series={series} />
          <section className="panel attention-panel">
            <div className="section-head">
              <h2>需要处理</h2>
              <span
                className={"badge " + (attention.length ? "" : "succeeded")}
              >
                {attention.length ? attention.length + " 项待办" : "当前正常"}
              </span>
            </div>
            {attention.length ? (
              <div className="attention-list">
                {attention.map((item) => (
                  <button key={item.label} onClick={() => navigate(item.page)}>
                    <span>
                      <b>{item.label}</b>
                      <small>{item.help}</small>
                    </span>
                    <span aria-hidden="true">↗</span>
                  </button>
                ))}
              </div>
            ) : (
              <p className="attention-clear">当前无待处理事项。</p>
            )}
          </section>
        </div>
        {data && (
          <Traffic
            t={data.breakdown?.traffic}
            byClient={data.breakdown?.trafficByClient}
            days={series}
            extra={<ServiceStats s={data.api} days={days} />}
          />
        )}
        {data?.breakdown && <Generation b={data.breakdown} />}
        {data?.breakdown && <Business b={data.breakdown} today={days === 1} />}
        <section className="panel overview-section">
          <div className="section-head">
            <h2>AI 调用成本</h2>
            <button className="secondary" onClick={() => navigate("models")}>
              管理模型 ↗
            </button>
          </div>
          <Table
            framed={false}
            rows={data?.models || []}
            id={(m) => m.model}
            columns={[
              {
                title: "模型",
                render: (m) => <span className="mono">{m.model}</span>,
              },
              { title: "调用数", render: (m) => m.calls },
              {
                title: "估算成本（USD）",
                render: (m) =>
                  m.calls > m.known
                    ? "待配置"
                    : "$" + (m.estimatedMicros / 1e6).toFixed(4),
              },
            ]}
          />
          <p className="chart-axis quiet">估算费用以上游账单为准。</p>
        </section>
        <div className="overview-summary overview-section">
          {["daily", "events"].map((kind) => (
            <details
              key={kind}
              className="panel overview-details"
              onToggle={(e) => {
                const open = e.currentTarget.open;
                setExpanded((state) => ({ ...state, [kind]: open }));
              }}
            >
              <summary>
                {kind === "daily"
                  ? days === 1
                    ? "今日经营数据"
                    : "每日经营数据 · " + days + " 天"
                  : "行为事件"}
              </summary>
              {expanded[kind] && data && (
                <Suspense fallback="正在加载明细…">
                  <Details data={data} events={kind === "events"} />
                </Suspense>
              )}
            </details>
          ))}
        </div>
      </ResourcePage>
    </div>
  );
}
