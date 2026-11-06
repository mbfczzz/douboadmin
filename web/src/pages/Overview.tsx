import { lazy, Suspense, useState } from "react";
import { Users, Film, CreditCard, RotateCcw } from "lucide-react";
import type { PageProps } from "../navigation";
import { useResource } from "../hooks/useResource";
import ResourcePage from "../business/ResourcePage";
import Table from "../business/Table";
import { money, type Dashboard } from "../business/types";
const Details = lazy(() => import("../overview/Details"));

export default function Overview({ config, navigate }: PageProps) {
  const [days, setDays] = useState(30),
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
  const peak = Math.max(0, ...series.map((d) => d.jobs));
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
    ["退款金额", money(total.refund), "周期内累计退款", RotateCcw],
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
        <div className="overview-summary">
          <section className="panel">
            <div className="section-head">
              <h2>每日生成量</h2>
              <span className="quiet">峰值 {peak} 次 / 日</span>
            </div>
            <div
              className="business-trend"
              role="img"
              aria-label="每日生成量趋势"
            >
              {!peak && <span className="quiet">所选时段暂无生成任务</span>}
              {!!peak && (
                <span className="trend-scale quiet" aria-hidden="true">
                  <span>{peak}</span>
                  <span>0</span>
                </span>
              )}
              {!!peak &&
                series.map((d) => (
                  <div
                    key={d.date}
                    title={d.date + "：" + d.jobs + " 次"}
                    style={{ height: peak ? (d.jobs / peak) * 180 : 0 }}
                  />
                ))}
            </div>
            <p className="chart-axis quiet">
              <span>{series[0]?.date}</span>
              <span>北京时间</span>
              <span>{series.at(-1)?.date}</span>
            </p>
          </section>
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
                  ? "每日经营数据 · " + days + " 天"
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
