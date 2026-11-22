import { RefreshCw } from "lucide-react";
import { date, type Row } from "../api";
import Table from "../business/Table";
import RequestState from "../components/RequestState";
import Tag from "../components/Tag";
import { useResource } from "../hooks/useResource";
import { online, type Node } from "../monitor/types";
import ToolStatus from "./ToolStatus";
import "./tools.css";

export default function SystemTools() {
  const resource = useResource<{ currentId: string; nodes: Row<Node>[] }>(
    "/admin/system-tools",
    15000,
  );
  const data = resource.data;
  return (
    <section className="panel system-tools" aria-label="FFmpeg 检测">
      <header>
        <div>
          <h2>FFmpeg 检测</h2>
          <p className="quiet">
            检查各节点的 FFmpeg 与 FFprobe。重新检测会立即检查当前
            API，其他节点随心跳更新。
          </p>
        </div>
        <button
          className="secondary"
          disabled={resource.loading}
          onClick={() => void resource.reload()}
        >
          <RefreshCw size={14} aria-hidden="true" />
          {resource.loading ? "检测中…" : "重新检测"}
        </button>
      </header>
      <RequestState
        loading={resource.loading && !data}
        error={resource.error}
        retry={resource.reload}
      />
      {data && (
        <Table
          rows={data.nodes}
          framed={false}
          id={(row) => row.id}
          columns={[
            {
              title: "节点",
              render: (row) => (
                <div className="tool-node">
                  <b>{row.data.host}</b>
                  <span>
                    <Tag>{row.data.role === "worker" ? "Worker" : "API"}</Tag>
                    {row.id === data.currentId && (
                      <Tag tone="accent">当前 API</Tag>
                    )}
                  </span>
                  <small className="quiet">
                    {online(row) ? "在线" : "离线"} · {row.id.slice(0, 8)}
                  </small>
                </div>
              ),
            },
            ...(["ffmpeg", "ffprobe"] as const).map((key) => ({
              title: key === "ffmpeg" ? "FFmpeg" : "FFprobe",
              render: (row: Row<Node>) => (
                <ToolStatus
                  name={key}
                  tool={row.data.mediaTools?.[key]}
                  checkedAt={row.data.mediaTools?.checkedAt}
                  online={online(row)}
                />
              ),
            })),
            {
              title: "检测时间",
              render: (row) =>
                row.data.mediaTools?.checkedAt
                  ? date(row.data.mediaTools.checkedAt, true)
                  : "尚未上报",
            },
          ]}
        />
      )}
    </section>
  );
}
