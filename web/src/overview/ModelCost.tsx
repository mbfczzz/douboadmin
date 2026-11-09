import Table from "../business/Table";
import type { Dashboard } from "../business/types";
import type { PageId } from "../navigation";

// Upstream AI calls per model with the estimated cost.
export default function ModelCost({
  models,
  navigate,
}: {
  models: Dashboard["models"];
  navigate: (page: PageId) => void;
}) {
  return (
    <section className="panel overview-section">
      <div className="section-head">
        <h2>AI 调用成本</h2>
        <button className="secondary" onClick={() => navigate("models")}>
          管理模型 ↗
        </button>
      </div>
      {!models.length ? (
        <p className="chart-empty quiet">所选时段没有 AI 调用</p>
      ) : (
        <>
          <Table
            framed={false}
            paged={false}
            rows={models}
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
        </>
      )}
    </section>
  );
}
