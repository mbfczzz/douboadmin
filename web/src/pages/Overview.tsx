import { useState } from "react";
import type { PageProps } from "../navigation";
import { useResource } from "../hooks/useResource";
import ResourcePage from "../business/ResourcePage";
import Table from "../business/Table";
import { money, type Dashboard } from "../business/types";

export default function Overview({ config, navigate }: PageProps) {
  const [days, setDays] = useState(30),
    resource = useResource<Dashboard>("/admin/dashboard?days=" + days, 30000);
  const data = resource.data,
    series = data?.days || [];
  const total = series.reduce(
    (a, d) => ({
      users: a.users + d.newUsers,
      jobs: a.jobs + d.jobs,
      revenue: a.revenue + d.revenueFen,
      refund: a.refund + d.refundFen,
    }),
    { users: 0, jobs: 0, revenue: 0, refund: 0 },
  );
  const peak = Math.max(0, ...series.map((d) => d.jobs));
  const failed = series.reduce((sum, day) => sum + day.failed, 0),
    unknownCost = (data?.models || []).reduce(
      (sum, model) => sum + Math.max(0, model.calls - model.known),
      0,
    ),
    attention = [
      failed
        ? {
            label: `${failed} 个生成任务失败`,
            help: "查看失败原因并判断是否需要重试。",
            page: "jobs" as const,
          }
        : undefined,
      unknownCost
        ? {
            label: `${unknownCost} 次 AI 调用成本未知`,
            help: "补充模型成本，避免经营数据失真。",
            page: "models" as const,
          }
        : undefined,
      config && !config.relayConfigured
        ? {
            label: "AI 中转服务尚未配置",
            help: "完成服务连接后才能提交真实生成任务。",
            page: "settings" as const,
          }
        : undefined,
    ].filter((item) => item !== undefined);
  return (
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
      <section className="panel attention-panel">
        <div className="section-head">
          <h2>需要处理</h2>
          <span className="quiet">
            {attention.length ? `${attention.length} 项` : "当前正常"}
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
                查看
              </button>
            ))}
          </div>
        ) : (
          <p className="attention-clear">
            当前没有失败任务、成本缺口或关键服务配置问题。
          </p>
        )}
      </section>
      <div className="business-metrics">
        {[
          ["新增用户", total.users],
          ["今日活跃", series[series.length - 1]?.activeUsers || 0],
          ["生成任务", total.jobs],
          ["净收入", money(total.revenue)],
          ["退款金额", money(total.refund)],
        ].map(([label, value]) => (
          <div className="panel" key={String(label)}>
            <span>{label}</span>
            <strong>{data ? value : "—"}</strong>
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
            aria-label="每日生成量，明细可在下方展开查看"
          >
            {!peak && <span className="quiet">所选时段暂无生成任务</span>}
            {series.map((d) => (
              <div
                key={d.date}
                title={`${d.date}：${d.jobs} 次`}
                style={{ height: peak ? (d.jobs / peak) * 110 : 0 }}
              />
            ))}
          </div>
          <p className="chart-axis">
            <span>{series[0]?.date}</span>
            <span>北京时间</span>
            <span>{series.at(-1)?.date}</span>
          </p>
        </section>
        <section className="panel">
          <div className="section-head">
            <h2>AI 调用成本</h2>
          </div>
          <Table
            rows={data?.models || []}
            id={(m) => m.model}
            columns={[
              { title: "模型", render: (m) => m.model },
              { title: "调用数", render: (m) => m.calls },
              {
                title: "估算成本（USD）",
                render: (m) => (
                  <>
                    {m.known
                      ? "$" + (m.estimatedMicros / 1e6).toFixed(4)
                      : "未配置"}
                    {m.calls > m.known && (
                      <small className="cell-note">
                        {m.calls - m.known} 次成本未知
                      </small>
                    )}
                  </>
                ),
              },
            ]}
          />
          <p className="chart-axis">按模型配置估算，不等于上游结算账单。</p>
        </section>
      </div>
      <details className="overview-details">
        <summary>每日经营数据 · {days} 天</summary>
        <Table
          rows={[...series].reverse()}
          id={(d) => d.date}
          columns={[
            { title: "日期", render: (d) => d.date },
            {
              title: "新增 / 活跃",
              render: (d) => (
                <>
                  {d.newUsers} / {d.activeUsers}
                </>
              ),
            },
            {
              title: "生成 / 成功 / 失败",
              render: (d) => (
                <>
                  {d.jobs} / {d.succeeded} / {d.failed}
                </>
              ),
            },
            {
              title: "实收 / 退款",
              render: (d) => (
                <>
                  {money(d.paidFen)} / {money(d.refundFen)}
                </>
              ),
            },
            { title: "净收入", render: (d) => money(d.revenueFen) },
          ]}
        />
      </details>
      <details className="overview-details">
        <summary>行为事件</summary>
        <Table
          rows={Object.entries(data?.events || {})}
          id={(r) => r[0]}
          columns={[
            { title: "事件", render: (r) => r[0] },
            { title: "次数", render: (r) => r[1] },
          ]}
        />
      </details>
    </ResourcePage>
  );
}
