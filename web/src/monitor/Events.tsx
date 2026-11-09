import { useState } from "react";
import type { Row } from "../api";
import Table from "../business/Table";
import RequestState from "../components/RequestState";
import type { Event, Resource } from "./types";
import { ago, timestamp } from "./types";
import Tag, { type Tone } from "../components/Tag";

const levelTones: Record<string, Tone> = { ERROR: "danger", WARN: "warning" };
// Latest activity first; folded repeats carry their last occurrence time.
const latest = (r: Row<Event>) => r.data.lastAt || r.createdAt;
export default function Events({
  logs,
  alerts,
  ack,
  tab,
  setTab,
}: {
  logs: Resource<Row<Event>[]>;
  alerts: Resource<Row<Event>[]>;
  ack: (id: string) => Promise<void>;
  // Controlled by the page so the health summary can open a tab.
  tab: string;
  setTab: (tab: string) => void;
}) {
  const [busy, setBusy] = useState("");
  const resource = tab === "logs" ? logs : alerts,
    rows = [...(resource.data || [])].sort((a, b) =>
      latest(b).localeCompare(latest(a)),
    ),
    pending = (alerts.data || []).filter((r) => !r.data.acknowledged).length,
    counts: Record<string, number | undefined> = {
      logs: logs.data?.length,
      alerts: alerts.data ? pending : undefined,
    };
  return (
    <section className="panel monitor-panel monitor-events" id="monitor-events">
      <header>
        <div className="tabs" role="tablist" aria-label="监控记录">
          {[
            ["logs", "错误日志"],
            ["alerts", "异常告警"],
          ].map(([key, label]) => (
            <button
              role="tab"
              aria-label={label}
              aria-selected={tab === key}
              key={key}
              onClick={() => setTab(String(key))}
            >
              {label}
              {!!counts[key] && (
                <span className={"tab-count " + key}>{counts[key]}</span>
              )}
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
              render: (r) =>
                r.data.level ? (
                  <Tag tone={levelTones[r.data.level] || "muted"}>
                    {r.data.level}
                  </Tag>
                ) : (
                  <Tag tone={r.data.acknowledged ? "muted" : "warning"}>
                    {r.data.acknowledged ? "已确认" : "待处理"}
                  </Tag>
                ),
            },
            {
              title: "内容",
              render: (r) => {
                const repeat = (r.data.count || 1) > 1 && (
                  <span className="repeat-count" title="1 小时内重复次数">
                    ×{r.data.count}
                  </span>
                );
                return r.data.detail ? (
                  <details>
                    <summary>
                      <span>
                        {repeat}
                        {r.data.message}
                      </span>
                    </summary>
                    <pre>{r.data.detail}</pre>
                  </details>
                ) : (
                  <>
                    {repeat}
                    {r.data.message}
                  </>
                );
              },
            },
            {
              title: "记录时间",
              render: (r) => (
                <span title={timestamp(latest(r))}>
                  {ago(latest(r))}
                  {(r.data.count || 1) > 1 && (
                    <small className="cell-note">
                      首次 {timestamp(r.createdAt)}
                    </small>
                  )}
                </span>
              ),
            },
            ...(tab === "alerts"
              ? [
                  {
                    title: "处理",
                    render: (r: Row<Event>) => (
                      <button
                        className="text-button"
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
