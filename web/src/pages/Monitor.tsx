import { api } from "../api";
import type { Row } from "../api";
import type { PageProps } from "../navigation";
import { useResource } from "../hooks/useResource";
import PageHeader from "../components/PageHeader";
import RequestState from "../components/RequestState";
import Nodes from "../monitor/Nodes";
import Events from "../monitor/Events";
import type { Health, Event } from "../monitor/types";
import { online } from "../monitor/types";
import "../styles/catalog.css";
import "../styles/monitor.css";

export default function Monitor({ notify }: PageProps) {
  const resource = useResource<Health>("/admin/monitor", 15000),
    alerts = useResource<Row<Event>[]>("/admin/alerts", 15000),
    logs = useResource<Row<Event>[]>("/admin/logs", 15000);
  const h = resource.data,
    busy = resource.loading || alerts.loading || logs.loading;
  async function refresh() {
    await Promise.all([resource.reload(), alerts.reload(), logs.reload()]);
  }
  async function ack(id: string) {
    try {
      await api(`/admin/alerts/${id}/ack`, { method: "PUT" });
      await alerts.reload();
    } catch (e) {
      notify((e as Error).message);
    }
  }
  const connections = [
    ["MySQL", h?.database, "连通", "连接异常"],
    ["Redis", h?.redisConfigured, "已配置", "未配置"],
    ["阿里云 OSS", h?.ossConfigured, "已配置", "未配置"],
    ["AI 中转", h?.relayConfigured, "已配置", "未配置"],
    ["微信支付", h?.paymentConfigured, "已配置", "未配置"],
    ["混剪引擎", h?.mixConfigured, "已配置", "未配置"],
    ["抖音接口", h?.hotConfigured, "已配置", "未配置"],
  ] as const;
  return (
    <div className="monitor-page">
      <PageHeader page="monitor" loading={busy} onRefresh={refresh} />
      <RequestState
        loading={resource.loading && !h}
        error={resource.error}
        retry={refresh}
      />
      <div className="monitor-metrics">
        {[
          ["在线节点", h ? h.instances.filter(online).length : undefined],
          ["排队任务", h?.queue.queued],
          ["正在处理", h?.queue.running],
          ["近 1 小时失败", h?.queue.failedHour],
        ].map(([label, value], i) => (
          <div key={String(label)}>
            <span>{label}</span>
            <strong
              className={i === 3 && Number(value) > 0 ? "monitor-danger" : ""}
            >
              {value ?? "—"}
            </strong>
          </div>
        ))}
      </div>
      <div className="monitor-grid">
        {h && <Nodes nodes={h.instances} />}
        <Events logs={logs} alerts={alerts} ack={ack} />
        <section className="panel monitor-panel monitor-connections">
          <header>
            <h2>服务接入</h2>
          </header>
          <ul>
            {connections.map(([label, ready, yes, no]) => (
              <li key={label}>
                <span>{label}</span>
                <span
                  className={
                    ready
                      ? "monitor-status online"
                      : label === "MySQL" && ready === false
                        ? "monitor-status monitor-danger"
                        : "monitor-status"
                  }
                >
                  {ready === undefined ? "未读取" : ready ? yes : no}
                </span>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}
