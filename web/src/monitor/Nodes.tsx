import { useState } from "react";
import type { Row } from "../api";
import Table from "../business/Table";
import type { Node } from "./types";
import { online, timestamp } from "./types";
export default function Nodes({ nodes }: { nodes: Row<Node>[] }) {
  const [all, setAll] = useState(false),
    active = nodes.filter(online);
  return (
    <section className="panel monitor-panel monitor-nodes">
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
            render: (r) => (
              <>
                <b>{r.data.host}</b>
                <small className="cell-note">
                  {r.id.slice(0, 8)} · {r.data.role} · {r.data.goVersion}
                </small>
              </>
            ),
          },
          {
            title: "状态",
            render: (r) => (
              <span
                className={
                  online(r) ? "monitor-status online" : "monitor-status"
                }
              >
                {online(r) ? "在线" : "离线"}
              </span>
            ),
          },
          {
            title: "内存 / 协程",
            render: (r) => (
              <>
                {(r.data.heapBytes / 1048576).toFixed(1)} MiB
                <small className="cell-note">{r.data.goroutines} 个协程</small>
              </>
            ),
          },
          {
            title: "数据库连接",
            render: (r) => (
              <>
                {r.data.dbInUse} 使用 / {r.data.dbOpen} 打开
              </>
            ),
          },
          {
            title: "最近心跳",
            render: (r) => timestamp(r.data.seenAt),
          },
        ]}
      />
    </section>
  );
}
