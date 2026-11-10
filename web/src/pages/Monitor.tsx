import { useState } from "react";
import { api } from "../api";
import type { PageProps } from "../navigation";
import { useResource } from "../hooks/useResource";
import { useRecordPage } from "../hooks/useRecordPage";
import PageHeader from "../components/PageHeader";
import Badge from "../components/Badge";
import RequestState from "../components/RequestState";
import Nodes from "../monitor/Nodes";
import Events from "../monitor/Events";
import type { Health, Event } from "../monitor/types";
import Metrics from "../monitor/Metrics";
import HealthSummary from "../monitor/HealthSummary";
import ApiHealth from "../monitor/ApiHealth";

export default function Monitor({ notify, navigate }: PageProps) {
  const [logPage, setLogPage] = useState(1),
    [alertPage, setAlertPage] = useState(1);
  const resource = useResource<Health>("/admin/monitor", 15000),
    alertsPage = useRecordPage<Event>("/admin/alerts", alertPage, 20, 15000),
    logsPage = useRecordPage<Event>("/admin/logs", logPage, 20, 15000);
  const alerts = { ...alertsPage, data: alertsPage.data?.items },
    logs = { ...logsPage, data: logsPage.data?.items };
  const [tab, setTab] = useState("logs");
  const h = resource.data,
    busy = resource.loading || alerts.loading || logs.loading;
  async function refresh() {
    await Promise.all([resource.reload(), alerts.reload(), logs.reload()]);
  }
  async function ack(id: string) {
    try {
      await api(`/admin/alerts/${id}/ack`, { method: "PUT" });
      notify("告警已确认");
      await Promise.all([alerts.reload(), resource.reload()]);
    } catch (e) {
      notify((e as Error).message, "error");
    }
  }
  const connections = [
    ["MySQL", h?.database, "连通", "连接异常"],
    ["Redis", h?.redisConfigured, "已配置", "未配置"],
    ["阿里云 OSS", h?.ossConfigured, "已配置", "未配置"],
    ["AI 中转", h?.relayConfigured, "已配置", "未配置"],
    ["微信支付", h?.paymentConfigured, "已配置", "未配置"],
    ["热门视频接口", h?.hotConfigured, "已配置", "未配置"],
  ] as const;
  return (
    <div className="monitor-page">
      <PageHeader page="monitor" loading={busy} onRefresh={refresh} />
      <RequestState
        loading={resource.loading && !h}
        error={resource.error}
        retry={refresh}
      />
      <HealthSummary
        health={h}
        logs={logs.data}
        alerts={alerts.data}
        navigate={navigate}
        showEvents={(next) => {
          setTab(next);
          document
            .getElementById("monitor-events")
            ?.scrollIntoView({ behavior: "smooth", block: "start" });
        }}
      />
      <Metrics health={h} />
      <ApiHealth />
      <div className="monitor-grid">
        {h && <Nodes nodes={h.instances} />}
        <Events
          logs={logs}
          alerts={alerts}
          ack={ack}
          tab={tab}
          setTab={setTab}
          pagination={{
            page: tab === "logs" ? logPage : alertPage,
            total: (tab === "logs" ? logsPage : alertsPage).data?.total || 0,
            onChange: tab === "logs" ? setLogPage : setAlertPage,
          }}
          pending={h?.pendingAlerts}
        />
        <section
          className="panel monitor-panel monitor-connections"
          id="monitor-connections"
        >
          <header>
            <h2>服务接入</h2>
          </header>
          <ul>
            {connections.map(([label, ready, yes, no]) => (
              <li key={label}>
                <span>{label}</span>
                <Badge
                  state={
                    ready
                      ? "succeeded"
                      : label === "MySQL" && ready === false
                        ? "failed"
                        : "muted"
                  }
                  label={ready === undefined ? "未读取" : ready ? yes : no}
                />
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}
