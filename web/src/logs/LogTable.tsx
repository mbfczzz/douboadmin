import { useState } from "react";
import { date } from "../api";
import { useResource } from "../hooks/useResource";
import Table, { type Column } from "../business/Table";
import RequestState from "../components/RequestState";
import Badge from "../components/Badge";
import Tag, { IdChip } from "../components/Tag";
import LogDetail from "./LogDetail";
import {
  actorLabels,
  failed,
  methodTones,
  targetLabels,
  type LogEntry,
  type LogPage,
  type LogTab,
} from "./types";

const actor = (e: LogEntry) => {
  const [label, tone] = actorLabels[e.actorType] || actorLabels.guest;
  return (
    <>
      <Tag tone={tone}>{label}</Tag> {e.actorName || e.actorId || "—"}
      {e.actorName && e.actorId && (
        <small className="cell-note mono">{e.actorId}</small>
      )}
    </>
  );
};
const target = (e: LogEntry) =>
  e.targetId ? (
    <>
      {e.targetType && <Tag>{targetLabels[e.targetType] || e.targetType}</Tag>}{" "}
      {e.targetName || <IdChip>{e.targetId}</IdChip>}
    </>
  ) : (
    "—"
  );
const result = (e: LogEntry) => (
  <Badge
    state={failed(e) ? "failed" : "succeeded"}
    label={e.status ? String(e.status) : failed(e) ? "失败" : "成功"}
  />
);
const took = (e: LogEntry) => (
  <span className={e.durationMs > 1000 ? "log-slow" : undefined}>
    {e.durationMs} ms
  </span>
);
const request = (e: LogEntry) => (
  <>
    <Tag tone={methodTones[e.method || ""] || "muted"}>{e.method}</Tag>{" "}
    <span className="mono log-path">{e.path}</span>
  </>
);
const action = (e: LogEntry) => (
  <>
    <b className="log-action">{e.action || e.route || "—"}</b>
    {(e.summary || e.error) && (
      <small className={"cell-note" + (e.error ? " danger-text" : "")}>
        {e.error || e.summary}
      </small>
    )}
  </>
);

function columns(tab: LogTab, open: (e: LogEntry) => void): Column<LogEntry>[] {
  const time = { title: "时间", render: (e: LogEntry) => date(e.at, true) };
  const detail = {
    title: "操作",
    action: true,
    render: (e: LogEntry) => <button onClick={() => open(e)}>详情</button>,
  };
  const sets: Record<string, Column<LogEntry>[]> = {
    business: [
      time,
      { title: "操作人", render: actor },
      { title: "操作", render: action },
      { title: "对象", render: target },
      { title: "结果", render: result },
    ],
    api: [
      time,
      { title: "调用方", render: actor },
      { title: "请求", render: request },
      { title: "状态", render: result },
      { title: "耗时", render: took },
      { title: "IP", render: (e) => e.ip || "—" },
    ],
    model: [
      time,
      { title: "用户", render: actor },
      { title: "动作", render: action },
      { title: "任务", render: target },
      { title: "状态", render: result },
      { title: "耗时", render: took },
    ],
    auth: [
      time,
      { title: "账号", render: actor },
      { title: "动作", render: action },
      { title: "结果", render: result },
      { title: "IP", render: (e) => e.ip || "—" },
    ],
  };
  return [...sets[tab], detail];
}

// Cursor-paged log list: each page asks for entries older than the last
// one shown, so paging stays fast however large the log grows.
export default function LogTable({
  tab,
  query,
}: {
  tab: LogTab;
  query: string;
}) {
  const [cursors, setCursors] = useState<string[]>([""]),
    [open, setOpen] = useState<LogEntry>();
  const before = cursors[cursors.length - 1];
  const resource = useResource<LogPage>(
    `/admin/audit?tab=${tab}&limit=30${query ? "&" + query : ""}${before ? "&before=" + before : ""}`,
  );
  const page = resource.data;
  return (
    <>
      <RequestState
        loading={resource.loading && !page}
        error={resource.error}
        retry={resource.reload}
      />
      {page && (
        <Table
          rows={page.items}
          id={(e) => e.id}
          paged={false}
          empty={query ? "没有符合条件的日志" : "暂无日志"}
          columns={columns(tab, setOpen)}
        />
      )}
      {page && (cursors.length > 1 || page.next) && (
        <div className="log-pager">
          <button
            className="secondary"
            disabled={cursors.length < 2}
            onClick={() => setCursors((c) => c.slice(0, -1))}
          >
            上一页
          </button>
          <span className="quiet">第 {cursors.length} 页</span>
          <button
            className="secondary"
            disabled={!page.next}
            onClick={() => setCursors((c) => [...c, page.next!])}
          >
            下一页
          </button>
        </div>
      )}
      {open && <LogDetail entry={open} onClose={() => setOpen(undefined)} />}
    </>
  );
}
