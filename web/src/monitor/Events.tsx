import { useState } from "react";
import type { Row } from "../api";
import Table from "../business/Table";
import RequestState from "../components/RequestState";
import type { Event, Resource } from "./types";
import { timestamp } from "./types";
export default function Events({
  logs,
  alerts,
  ack,
}: {
  logs: Resource<Row<Event>[]>;
  alerts: Resource<Row<Event>[]>;
  ack: (id: string) => Promise<void>;
}) {
  const [tab, setTab] = useState("logs"),
    [busy, setBusy] = useState("");
  const resource = tab === "logs" ? logs : alerts,
    rows = resource.data || [];
  return (
    <section className="panel monitor-panel monitor-events">
      <header>
        <div className="tabs" role="tablist" aria-label="监控记录">
          {[
            ["logs", "错误日志"],
            ["alerts", "异常告警"],
          ].map(([key, label]) => (
            <button
              role="tab"
              aria-selected={tab === key}
              key={key}
              onClick={() => setTab(String(key))}
            >
              {label}
            </button>
          ))}
        </div>
      </header>
      <RequestState
        loading={resource.loading && !resource.data}
        error={resource.error}
        retry={resource.reload}
      />
      {resource.data && (
        <Table
          rows={rows}
          empty={tab === "logs" ? "暂无错误日志" : "暂无异常告警"}
          id={(r) => r.id}
          columns={[
            {
              title: "级别 / 状态",
              render: (r) => (
                <span
                  className="monitor-level"
                  data-level={r.data.level || "alert"}
                >
                  {r.data.level || (r.data.acknowledged ? "已确认" : "待处理")}
                </span>
              ),
            },
            {
              title: "内容",
              render: (r) =>
                r.data.detail ? (
                  <details>
                    <summary>{r.data.message}</summary>
                    <pre>{r.data.detail}</pre>
                  </details>
                ) : (
                  r.data.message
                ),
            },
            { title: "记录时间", render: (r) => timestamp(r.createdAt) },
            ...(tab === "alerts"
              ? [
                  {
                    title: "处理",
                    render: (r: Row<Event>) => (
                      <button
                        disabled={!!busy || r.data.acknowledged}
                        onClick={async () => {
                          setBusy(r.id);
                          try {
                            await ack(r.id);
                          } finally {
                            setBusy("");
                          }
                        }}
                      >
                        {r.data.acknowledged ? "已确认" : "确认收到"}
                      </button>
                    ),
                  },
                ]
              : []),
          ]}
        />
      )}
    </section>
  );
}
