import { useState } from "react";
import type { Row } from "../api";
import Table from "../business/Table";
import type { Node } from "./types";
import { ago, online, timestamp } from "./types";
import Badge from "../components/Badge";
import Tag from "../components/Tag";

const roles: Record<string, [string, "info" | "accent" | "muted"]> = {
  serve: ["API", "info"],
  worker: ["Worker", "accent"],
};
export default function Nodes({ nodes }: { nodes: Row<Node>[] }) {
  const [all, setAll] = useState(false),
    active = nodes.filter(online),
    // Bars compare nodes with each other rather than a fixed ceiling.
    peak = Math.max(1, ...nodes.map((n) => n.data.heapBytes));
  return (
    <section className="panel monitor-panel monitor-nodes" id="monitor-nodes">
      <header>
        <div>
          <h2>运行节点</h2>
          <p>60 秒未收到心跳即标记离线。</p>
        </div>
        <button
          className="monitor-link"
          aria-pressed={all}
          onClick={() => setAll(!all)}
        >
          {all ? "只看在线" : "全部节点（" + nodes.length + "）"}
        </button>
      </header>
      <Table
        rows={all ? nodes : active}
        empty="暂无在线节点，请检查服务进程。"
        id={(r) => r.id}
        columns={[
          {
            title: "节点 / 实例",
            render: (r) => {
              const [role, tone] = roles[r.data.role] || [r.data.role, "muted"];
              return (
                <>
                  <span className="node-name">
                    <b>{r.data.host}</b>
                    <Tag tone={tone}>{role}</Tag>
                  </span>
                  <small className="cell-note">
                    {r.id.slice(0, 8)} · {r.data.goVersion}
                  </small>
                </>
              );
            },
          },
          {
            title: "状态",
            render: (r) => (
              <Badge
                state={online(r) ? "succeeded" : "muted"}
                label={online(r) ? "在线" : "离线"}
              />
            ),
          },
          {
            title: "内存 / 协程",
            render: (r) => {
              const mib = r.data.heapBytes / 1048576;
              return (
                <>
                  <span className="amount">{mib.toFixed(1)} MiB</span>
                  <span className="node-meter" aria-hidden="true">
                    <i
                      style={{
                        width: `${Math.max(4, (r.data.heapBytes / peak) * 100)}%`,
                      }}
                    />
                  </span>
                  <small className="cell-note">
                    {r.data.goroutines} 个协程
                  </small>
                </>
              );
            },
          },
          {
            title: "数据库连接",
            render: (r) => (
              <>
                <span className="amount">{r.data.dbInUse}</span>
                <span className="quiet"> 使用 / {r.data.dbOpen} 打开</span>
              </>
            ),
          },
          {
            title: "最近心跳",
            render: (r) => (
              <span title={timestamp(r.data.seenAt)}>
                {ago(r.data.seenAt)}
                <small className="cell-note">{timestamp(r.data.seenAt)}</small>
              </span>
            ),
          },
        ]}
      />
    </section>
  );
}
