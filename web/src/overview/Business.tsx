import type { Breakdown } from "../business/types";
import Revenue from "./Revenue";
import Activations from "./Activations";
import "./panels.css";
import HBars from "./HBars";
import { pct } from "./format";

// Conversion, revenue mix and provider activations.
export default function Business({
  b,
  today = false,
}: {
  b: Breakdown;
  today?: boolean;
}) {
  const base = b.totalUsers;
  return (
    <div className="overview-grid three stat-row">
      <section className="panel">
        <div className="section-head">
          <h2>用户转化</h2>
          <span className="quiet">占累计用户</span>
        </div>
        <HBars
          label="用户转化"
          rows={[
            ["累计用户", b.totalUsers],
            [today ? "今日活跃" : "周期活跃", b.activeUsers],
            ["发起生成", b.creatorUsers],
            ["完成付费", b.payers],
          ].map(([name, n]) => ({
            key: String(name),
            label: name,
            value: Number(n),
            display: (
              <>
                <b>{n}</b>
                <small className="hbar-share">{pct(Number(n), base)}</small>
              </>
            ),
          }))}
        />
      </section>
      <Revenue b={b} />
      <Activations b={b} />
    </div>
  );
}
